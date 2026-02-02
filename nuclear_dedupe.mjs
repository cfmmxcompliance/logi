import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, writeBatch } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
    authDomain: "logimaster-cfmoto.firebaseapp.com",
    projectId: "logimaster-cfmoto",
    storageBucket: "logimaster-cfmoto.firebasestorage.app",
    messagingSenderId: "924452835722",
    appId: "1:924452835722:web:11a7eedec65ba034dc7873",
    measurementId: "G-01VXE7L5C3"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function nuclearDedupe() {
    console.log("⚡ INICIANDO EXTERMINIO NUCLEAR DE DUPLICADOS...");
    const snap = await getDocs(collection(db, 'parts'));
    const pnMap = new Map(); // PN -> List of {id, data}

    snap.forEach(d => {
        const data = d.data();
        const pn = (data.PART_NUMBER || '').toString().toUpperCase().trim();
        if (!pnMap.has(pn)) pnMap.set(pn, []);
        pnMap.get(pn).push({ id: d.id, data });
    });

    const toDelete = [];
    pnMap.forEach((docs, pn) => {
        if (docs.length > 1) {
            // Keep the one with most fields or most recent (fallback to first)
            docs.sort((a, b) => {
                const fieldsA = Object.keys(a.data).length;
                const fieldsB = Object.keys(b.data).length;
                return fieldsB - fieldsA; // More fields first
            });

            const [survivor, ...ghosts] = docs;
            console.log(`   [Target] PN: ${pn} | Survivor: ${survivor.id} | Deleting ${ghosts.length} ghosts.`);
            ghosts.forEach(g => toDelete.push(g.id));
        }
    });

    if (toDelete.length === 0) {
        console.log("✅ No se encontraron duplicados. El sistema está limpio.");
        process.exit(0);
    }

    console.log(`🧹 Borrando ${toDelete.length} documentos duplicados...`);
    const CHUNK_SIZE = 400;
    for (let i = 0; i < toDelete.length; i += CHUNK_SIZE) {
        const chunk = toDelete.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach(id => batch.delete(doc(db, 'parts', id)));
        await batch.commit();
        console.log(`   ✅ Progreso: ${Math.min(i + CHUNK_SIZE, toDelete.length)} / ${toDelete.length}`);
    }

    console.log("\n🚀 EXTERMINIO COMPLETADO. FIREBASE ES AHORA ÚNICO POR NÚMERO DE PARTE.");
    process.exit(0);
}

nuclearDedupe();
