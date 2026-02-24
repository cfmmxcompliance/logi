import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where } from "firebase/firestore";

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

async function auditContainersJan2026() {
    console.log("Analyzing ds504 for Jan 2026...");

    const start = "2026-01-01";
    const end = "2026-01-31 23:59:59";

    const snap = await getDocs(query(collection(db, "ds504"),
        where("FechaPagoReal", ">=", start),
        where("FechaPagoReal", "<=", end)));

    console.log(`Total ds504 records found: ${snap.size}`);

    const containerMap = new Map(); // id -> count
    const containerRecords = [];

    snap.docs.forEach(doc => {
        const d = doc.data();
        const id = (d.NumContenedor || d.c4 || d.c3 || d.c1 || doc.id).toString();

        containerMap.set(id, (containerMap.get(id) || 0) + 1);
        containerRecords.push({
            docId: doc.id,
            containerId: id,
            pedimento: d.Pedimento || d.c2,
            patente: d.Patente || d.c1
        });
    });

    console.log(`Unique container IDs: ${containerMap.size}`);

    const duplicates = Array.from(containerMap.entries())
        .filter(([id, count]) => count > 1)
        .sort((a, b) => b[1] - a[1]);

    console.log(`\nFound ${duplicates.length} container IDs that appear in more than one record.`);

    if (duplicates.length > 0) {
        console.log("\nTop Duplicated Containers (Sample):");
        const sample = duplicates.slice(0, 10).map(([id, count]) => {
            const records = containerRecords.filter(r => r.containerId === id);
            return {
                container: id,
                occurrences: count,
                pedimentos: records.map(r => r.pedimento).join(", ")
            };
        });
        console.table(sample);
    }

    process.exit(0);
}

auditContainersJan2026().catch(console.error);
