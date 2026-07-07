import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where, doc, getDoc, updateDoc } from 'firebase/firestore';

async function main() {
    const firebaseConfig = {
      apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
      projectId: "logimaster-cfmoto"
    };
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);

    const fecha = '2026-06-18';

    const libSnap = await getDocs(query(
        collection(db, 'liberacionesCaja'),
        where('fechaLiberacion', '>=', fecha),
        where('fechaLiberacion', '<=', fecha)
    ));
    const libs = libSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const asigSnap = await getDocs(query(collection(db, 'asignacion_cajas'), where('fecha', '==', fecha)));
    const asigMap = new Map();
    asigSnap.docs.forEach(d => asigMap.set(d.id, { id: d.id, ...d.data() }));

    const tlSnap = await getDocs(collection(db, 'transport_lines'));
    const tlMap = new Map();
    tlSnap.docs.forEach(d => tlMap.set(d.id, d.data()));

    const closedLibs = libs.filter(l => asigMap.has(l.asignacionCajaId));
    console.log(`Cierres del ${fecha}: ${closedLibs.length}`);

    let fixed = 0;
    for (const lib of closedLibs) {
        const expId = `exp_${lib.asignacionCajaId}`;
        const asig = asigMap.get(lib.asignacionCajaId);
        const tId = asig?.transportLineId || '';
        
        let nombreSubLinea = '';
        if (tId && tlMap.has(tId)) {
            nombreSubLinea = tlMap.get(tId).nombreSubLinea || '';
        }
        if (!nombreSubLinea) continue;

        try {
            const histRef = doc(db, 'historico_expo', expId);
            const histDoc = await getDoc(histRef);
            if (histDoc.exists()) {
                const current = histDoc.data().team || '';
                if (current !== nombreSubLinea) {
                    await updateDoc(histRef, { team: nombreSubLinea });
                    console.log(`  ${asig?.numeroCaja} | team: "${current}" -> "${nombreSubLinea}"`);
                    fixed++;
                }
            }
        } catch (e) {
            console.warn(`  Error: ${e.message}`);
        }
    }

    console.log(`\nTotal actualizados: ${fixed}`);
    process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
