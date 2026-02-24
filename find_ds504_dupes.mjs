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

async function findDs504Duplicates() {
    const start = "2026-01-01";
    const end = "2026-01-31 23:59:59";

    const snap = await getDocs(query(collection(db, "ds504"),
        where("FechaPagoReal", ">=", start),
        where("FechaPagoReal", "<=", end)));

    console.log(`Total ds504 records in Jan 2026: ${snap.size}`);

    // Map content hash to list of doc IDs
    const contentMap = new Map();

    snap.docs.forEach(doc => {
        const d = doc.data();
        const content = JSON.stringify({
            p: d.Patente || d.c0,
            ped: d.Pedimento || d.c1,
            sec: d.Seccion || d.c2,
            id: d.NumContenedor || d.c3,
            type: d.TipoContenedor || d.c4
        });
        if (!contentMap.has(content)) contentMap.set(content, []);
        contentMap.get(content).push(doc.id);
    });

    console.log(`Unique logical records: ${contentMap.size}`);

    const duplicates = Array.from(contentMap.entries())
        .filter(([content, ids]) => ids.length > 1);

    console.log(`Logical records with duplicates: ${duplicates.length}`);

    if (duplicates.length > 0) {
        console.log("\nSample Duplicate IDs:");
        duplicates.slice(0, 5).forEach(([content, ids]) => {
            console.log(`Content: ${content}`);
            console.log(`  IDs: ${ids.join(", ")}`);
        });
    }

    process.exit(0);
}

findDs504Duplicates().catch(console.error);
