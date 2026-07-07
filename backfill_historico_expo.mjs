import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, setDoc, doc, query, where, getDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
  projectId: "logimaster-cfmoto"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function backfill() {
  console.log("Iniciando migración retroactiva a historico_expo...");
  
  // 1. Obtener todas las liberaciones
  const libSnapshot = await getDocs(collection(db, 'liberacionesCaja'));
  const liberaciones = libSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`Encontradas ${liberaciones.length} liberaciones totales.`);

  let agregados = 0;
  let yaExistentes = 0;

  for (const lib of liberaciones) {
    if (!lib.asignacionCajaId) continue;

    const expId = `exp_${lib.asignacionCajaId}`;
    
    // Verificar si ya existe en historico_expo
    const expRef = doc(db, 'historico_expo', expId);
    const expSnap = await getDoc(expRef);
    
    if (expSnap.exists()) {
      yaExistentes++;
      continue;
    }

    // Buscar el sello correspondiente
    const selloQ = query(
      collection(db, 'sellos'), 
      where('asignacionCajaId', '==', lib.asignacionCajaId)
    );
    const selloSnap = await getDocs(selloQ);
    
    let pickupDay = lib.fechaHoraRegistro || lib.fechaLiberacion || '';
    
    if (!selloSnap.empty) {
      const selloData = selloSnap.docs[0].data();
      pickupDay = selloData.fechaHoraRegistro || selloData.fechaAsignacion || pickupDay;
    }

    // Insertar en historico_expo
    const historicoRecord = {
      id: expId,
      trailer: lib.numeroCaja || '',
      pickupDayCFM: pickupDay,
      dodaUrl: '',
      entryUrl: '',
      dateRequested: '',
      crossingDate: '',
      dateReceived: '',
      daysToReceive: '',
      cfmRef: '',
      expDoda: '',
      comments: '',
      scacAndCaat: '',
      createdAt: Date.now()
    };

    await setDoc(expRef, historicoRecord);
    agregados++;
    console.log(`+ Agregado: Caja ${historicoRecord.trailer} - Sello: ${historicoRecord.pickupDayCFM}`);
  }

  console.log("=== RESUMEN ===");
  console.log(`Total liberaciones revisadas: ${liberaciones.length}`);
  console.log(`Registros agregados al histórico: ${agregados}`);
  console.log(`Registros omitidos (ya existían): ${yaExistentes}`);
  console.log("Migración completada.");
}

backfill().then(() => process.exit(0)).catch(e => {
  console.error("Error en script:", e);
  process.exit(1);
});
