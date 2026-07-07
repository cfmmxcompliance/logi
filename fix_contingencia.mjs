import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, deleteDoc, doc, query, where } from 'firebase/firestore';

async function main() {
    const app = initializeApp({ apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU", projectId: "logimaster-cfmoto" });
    const db = getFirestore(app);

    // Find TL017 caja 241139 on 2026-06-23
    const q = query(collection(db, 'asignacion_cajas'), where('fecha', '==', '2026-06-23'));
    const snap = await getDocs(q);
    let asigId = null;
    snap.docs.forEach(d => {
        const data = d.data();
        if (data.numeroCaja === '241139' || data.numeroOperacion === 'TL017') {
            asigId = d.id;
            console.log(`Asignación: ${d.id} | Caja: ${data.numeroCaja} | Op: ${data.numeroOperacion}`);
        }
    });
    if (!asigId) { console.log('No encontrada'); process.exit(1); }

    // Delete liberacionesCaja
    const libQ = query(collection(db, 'liberacionesCaja'), where('asignacionCajaId', '==', asigId));
    const libSnap = await getDocs(libQ);
    for (const l of libSnap.docs) {
        await deleteDoc(doc(db, 'liberacionesCaja', l.id));
        console.log(`🗑️ Eliminada liberacionCaja: ${l.id}`);
    }

    // Delete liberacionesDock
    const dockQ = query(collection(db, 'liberacionesDock'), where('asignacionCajaId', '==', asigId));
    const dockSnap = await getDocs(dockQ);
    for (const l of dockSnap.docs) {
        await deleteDoc(doc(db, 'liberacionesDock', l.id));
        console.log(`🗑️ Eliminada liberacionDock: ${l.id}`);
    }

    console.log(`\n✅ Liberaciones eliminadas para caja 241139 / TL017`);
    process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
