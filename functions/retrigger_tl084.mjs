// retrigger_tl084.mjs
// Toca el doc de TL084 (limpia layoutFileId) para que autoFillLayout se re-dispare.
// El function detecta cfmRef/vehiculos vacíos y re-procesa aunque layoutUrl no haya cambiado.
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';

// Leer config desde archivo local (no se expone en pantalla)
const cfg = JSON.parse(readFileSync('../.firebase-config.json', 'utf8'));
const app = initializeApp(cfg);
const db  = getFirestore(app);

async function main() {
  console.log('🔍 Buscando TL084 del 2026-07-07...');
  const q = query(
    collection(db, 'asignacion_cajas'),
    where('numeroOperacion', '==', 'TL084'),
    where('fecha', '==', '2026-07-07')
  );
  const snap = await getDocs(q);
  if (snap.empty) {
    // Buscar sin filtro de fecha por si el campo se guarda distinto
    console.log('  No encontrado con fecha exacta, buscando solo por número...');
    const q2 = query(collection(db, 'asignacion_cajas'), where('numeroOperacion', '==', 'TL084'));
    const snap2 = await getDocs(q2);
    if (snap2.empty) { console.log('❌ TL084 no encontrado en Firestore.'); process.exit(1); }
    snap2.forEach(d => console.log('  Encontrado:', d.id, '| fecha:', d.data().fecha));
    snap = snap2;
  }

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    console.log(`\n📋 Doc: ${docSnap.id}`);
    console.log(`   cfmRef: ${data.cfmRef || 'VACÍO ← necesita llenarse'}`);
    console.log(`   vehiculos: ${data.vehiculos || 'VACÍO ← necesita llenarse'}`);
    console.log(`   layoutUrl: ${data.layoutUrl ? 'SÍ tiene' : 'NO tiene ← sin layout no puede procesarse'}`);

    if (!data.layoutUrl) {
      console.log('⚠️  Sin layoutUrl — el autoFillLayout no puede correr. Sube el layout primero.');
      continue;
    }

    // Limpiar layoutFileId para forzar re-extracción del fileId desde la URL
    console.log('  ⚙️  Tocando layoutFileId para forzar re-proceso...');
    await updateDoc(docSnap.ref, { layoutFileId: '' });
    // Esperar un segundo y restaurar el campo (el trigger se dispara al limpiar)
    await new Promise(r => setTimeout(r, 1000));
    // El function ya se disparó con layoutFileId vacío y cfmRef/vehiculos vacíos
    // Basta con ese write para que el function detecte missingFields=true y procese
    console.log('  ✅ Documento tocado — autoFillLayout se re-disparará en segundos.');
  }

  console.log('\n⏳ Espera ~10s y verifica en la app que CFM REF y VEHICLES aparezcan.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
