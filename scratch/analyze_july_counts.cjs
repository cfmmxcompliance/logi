const admin = require("firebase-admin");
const serviceAccount = require("../functions/service-account.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function analyze() {
  const snapshot = await db.collection("asignacion_cajas")
    .where("fecha", ">=", "2026-07-01")
    .where("fecha", "<=", "2026-07-31")
    .get();

  const libSnap = await db.collection("liberaciones").get();
  const liberaciones = libSnap.docs.map(d => d.data());

  let total = snapshot.docs.length;
  let cerrado = 0;
  let cancelado = 0;
  let pendientes = 0;
  let enProceso = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const dockVal = String(data.dockArribo || "").trim().toUpperCase();
    
    const isCanceled = ['RECHAZADO', 'DROP', 'NO SHOW', 'CANCELED', 'CANCELADO'].includes(dockVal);
    const hasLib = !!liberaciones.find(l => l.asignacionCajaId === doc.id);
    const isLive = !hasLib && !!data.arribo;

    if (isCanceled) cancelado++;
    else if (hasLib) cerrado++;
    else if (isLive) enProceso++;
    else pendientes++;
  }

  console.log(`Total: ${total}`);
  console.log(`Cerrado: ${cerrado}`);
  console.log(`Cancelado: ${cancelado}`);
  console.log(`En Proceso: ${enProceso}`);
  console.log(`Pendientes: ${pendientes}`);
  
  // Also compute the KPI box "Liberadas"
  let releasedKPI = 0;
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const dockVal = String(data.dockArribo || "").trim().toUpperCase();
    if (['RECHAZADO', 'DROP', 'NO SHOW', 'CANCELED', 'CANCELADO'].includes(dockVal) || !!liberaciones.find(l => l.asignacionCajaId === doc.id)) {
      releasedKPI++;
    }
  }
  console.log(`KPI Liberadas: ${releasedKPI}`);
}

analyze().catch(console.error).finally(() => process.exit(0));
