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

async function cleanInvoices() {
    console.log("⚡ INICIANDO LIMPIEZA DE FACTURAS DUPLICADAS...");
    const snap = await getDocs(collection(db, 'commercial_invoices'));
    const itemMap = new Map();

    snap.forEach(d => {
        const item = d.data();
        const key = `${String(item.invoiceNo).trim().toUpperCase()}|${String(item.partNo).trim().toUpperCase()}|${Number(item.unitPrice).toFixed(6)}`;
        if (!itemMap.has(key)) itemMap.set(key, []);
        itemMap.get(key).push({ id: d.id, data: item });
    });

    const toDelete = [];
    itemMap.forEach((docs, key) => {
        if (docs.length > 1) {
            // Logic: Prefer deterministic IDs or the ones with more data.
            // If ID is a UUID (length 36 approx), we prefer the deterministic one (usually shorter and pipe-separated).
            docs.sort((a, b) => {
                const isUuidA = a.id.includes('-') && a.id.length > 20;
                const isUuidB = b.id.includes('-') && b.id.length > 20;
                if (isUuidA && !isUuidB) return 1; // Put UUID at the end
                if (!isUuidA && isUuidB) return -1;
                return 0;
            });

            const [survivor, ...ghosts] = docs;
            ghosts.forEach(g => toDelete.push(g.id));
        }
    });

    if (toDelete.length === 0) {
        console.log("✅ Sistema limpio. No hay nada que borrar.");
        process.exit(0);
    }

    console.log(`🧹 Borrando ${toDelete.length} documentos duplicados...`);
    const CHUNK_SIZE = 400;
    for (let i = 0; i < toDelete.length; i += CHUNK_SIZE) {
        const chunk = toDelete.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach(id => batch.delete(doc(db, 'commercial_invoices', id)));
        await batch.commit();
        console.log(`   ✅ Progreso: ${Math.min(i + CHUNK_SIZE, toDelete.length)} / ${toDelete.length}`);
    }

    console.log("\n🚀 LIMPIEZA COMPLETADA.");
    process.exit(0);
}

cleanInvoices();
