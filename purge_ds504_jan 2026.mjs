import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where, writeBatch } from "firebase/firestore";

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

async function purge504() {
    const start = "2026-01-01";
    const end = "2026-01-31 23:59:59";

    console.log(`Purging Jan 2026 records from ds504...`);

    const q = query(collection(db, "ds504"), where("FechaPagoReal", ">=", start), where("FechaPagoReal", "<=", end));
    const snap = await getDocs(q);
    console.log(`Found ${snap.size} records to delete.`);

    const CHUNK_SIZE = 400;
    for (let i = 0; i < snap.docs.length; i += CHUNK_SIZE) {
        const batch = writeBatch(db);
        const chunk = snap.docs.slice(i, i + CHUNK_SIZE);
        chunk.forEach(d => batch.delete(d.ref));
        await batch.commit();
        console.log(`  Deleted batch ${i / CHUNK_SIZE + 1} (${chunk.length} items)`);
    }

    console.log("Purge complete.");
    process.exit(0);
}

purge504().catch(console.error);
