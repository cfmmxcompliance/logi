import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './services/firebaseConfig.js';

async function checkTL() {
  console.log("=== Verificando transport_lines con transportLineId ARR-015 ===\n");

  // 1. Buscar ARR-015 en transport_lines
  const q = query(collection(db, 'transport_lines'), where('transportLineId', '==', 'ARR-015'));
  const snap = await getDocs(q);
  
  if (snap.empty) {
    console.log("❌ No se encontró ARR-015 en transport_lines");
  } else {
    snap.forEach(d => {
      console.log("✅ Documento encontrado:");
      console.log(JSON.stringify(d.data(), null, 2));
    });
  }

  // 2. Revisar todos los registros de hoy sin scac
  console.log("\n=== Registros 2026-07-03 sin SCAC ===");
  const todayQ = query(collection(db, 'asignacion_cajas'), where('fecha', '==', '2026-07-03'));
  const todaySnap = await getDocs(todayQ);
  let noScac = 0;
  todaySnap.forEach(d => {
    const data = d.data();
    if (!data.scac) {
      noScac++;
      console.log(`  - ID: ${d.id} | Op: ${data.numeroOperacion} | transportLineId: ${data.transportLineId} | subLinea: ${data.subLinea}`);
    }
  });
  console.log(`\nTotal sin SCAC hoy: ${noScac} de ${todaySnap.size}`);

  process.exit(0);
}

checkTL().catch(err => { console.error("Error:", err); process.exit(1); });
