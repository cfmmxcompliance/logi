const admin = require('firebase-admin');
const serviceAccount = require('./service_account.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function runAudit() {
  console.log("Iniciando auditoría de registros huérfanos...");
  const orphans = {
    liberacionesCaja: [],
    liberacionesDock: [],
    sellos: []
  };

  // 1. Obtener todos los IDs de asignacion_cajas válidos
  console.log("Obteniendo asignaciones válidas...");
  const asigSnap = await db.collection('asignacion_cajas').get();
  const validAsigIds = new Set();
  asigSnap.forEach(doc => validAsigIds.add(doc.id));
  console.log(`- Encontradas ${validAsigIds.size} asignaciones válidas.`);

  // 2. Verificar liberacionesCaja
  console.log("Verificando liberacionesCaja...");
  const libSnap = await db.collection('liberacionesCaja').get();
  libSnap.forEach(doc => {
    const data = doc.data();
    if (data.asignacionCajaId && !validAsigIds.has(data.asignacionCajaId)) {
      orphans.liberacionesCaja.push({ id: doc.id, asignacionCajaId: data.asignacionCajaId });
    }
  });
  console.log(`- Encontrados ${orphans.liberacionesCaja.length} registros huérfanos.`);

  // 3. Verificar liberacionesDock
  console.log("Verificando liberacionesDock...");
  const dockSnap = await db.collection('liberacionesDock').get();
  dockSnap.forEach(doc => {
    const data = doc.data();
    if (data.asignacionCajaId && !validAsigIds.has(data.asignacionCajaId)) {
      orphans.liberacionesDock.push({ id: doc.id, asignacionCajaId: data.asignacionCajaId });
    }
  });
  console.log(`- Encontrados ${orphans.liberacionesDock.length} registros huérfanos.`);

  // 4. Verificar sellos
  console.log("Verificando sellos...");
  const sellosSnap = await db.collection('sellos').get();
  sellosSnap.forEach(doc => {
    const data = doc.data();
    if (data.asignacionCajaId && !validAsigIds.has(data.asignacionCajaId)) {
      orphans.sellos.push({ id: doc.id, asignacionCajaId: data.asignacionCajaId });
    }
  });
  console.log(`- Encontrados ${orphans.sellos.length} registros huérfanos.`);

  // 5. Verificar historico_expo (opcional)
  // Historico_expo usa idNumber o exp_asigId
  console.log("Verificando historico_expo...");
  let historicoOrphans = 0;
  const histSnap = await db.collection('historico_expo').get();
  histSnap.forEach(doc => {
    const data = doc.data();
    if (data.idNumber && !validAsigIds.has(data.idNumber)) {
      // It might be orphaned, but historically it could be from before asignaciones existed or another process.
      historicoOrphans++;
    }
  });
  console.log(`- Encontrados ${historicoOrphans} posibles registros huérfanos en historico_expo (esto puede ser normal).`);


  console.log("\n=== RESUMEN DE HUÉRFANOS ===");
  console.log(JSON.stringify(orphans, null, 2));
}

runAudit().then(() => process.exit(0)).catch(console.error);
