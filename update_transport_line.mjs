import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
  projectId: "logimaster-cfmoto"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function backfillTransportLine() {
  console.log("Iniciando backfill de transportLine en historico_expo...");
  
  const expSnapshot = await getDocs(collection(db, 'historico_expo'));
  const records = expSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`Encontrados ${records.length} registros históricos.`);

  let actualizados = 0;
  let yaTienen = 0;
  let noEncontrado = 0;

  for (const record of records) {
    if (record.id && record.id.startsWith('exp_')) {
      const asignacionId = record.id.replace('exp_', '');
      const asigRef = doc(db, 'asignacion_cajas', asignacionId);
      const asigSnap = await getDoc(asigRef);

      const asigData = asigSnap.data() || {};
      let tLine = asigData.transportLineId || asigData.transportLine || '';

      if (asigSnap.exists() && tLine) {
        const tlDoc = await getDoc(doc(db, 'transport_lines', tLine));
        if (tlDoc.exists()) {
          tLine = tlDoc.data().nombreSubLinea || tlDoc.data().TransportLine || tLine;
        }

        await updateDoc(doc(db, 'historico_expo', record.id), {
          transportLine: tLine
        });
        actualizados++;
        console.log(`+ Actualizado: Caja ${record.trailer} -> Línea: ${tLine}`);
      } else {
        noEncontrado++;
      }
    } else {
      noEncontrado++;
    }
  }

  console.log("=== RESUMEN ===");
  console.log(`Total revisados: ${records.length}`);
  console.log(`Actualizados: ${actualizados}`);
  console.log(`Ya tenían LÍNEA: ${yaTienen}`);
  console.log(`Sin datos origen: ${noEncontrado}`);
  console.log("Backfill completado.");
}

backfillTransportLine().then(() => process.exit(0)).catch(e => {
  console.error("Error en script:", e);
  process.exit(1);
});
