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

async function analyzeUniqueContainers() {
    const start = "2026-01-01";
    const end = "2026-01-31 23:59:59";

    console.log(`Analyzing unique containers from ${start} to ${end}...`);

    const snap = await getDocs(query(collection(db, "ds504"),
        where("FechaPagoReal", ">=", start),
        where("FechaPagoReal", "<=", end)));

    const statsByType = {}; // type -> { uniqueIds: Set, totalRows: number }

    snap.docs.forEach(doc => {
        const d = doc.data();
        const type = (d.TipoContenedor || d.c4 || "UNKNOWN").toString();
        const id = (d.NumContenedor || d.c3 || "UNKNOWN_ID_" + doc.id).toString();

        if (!statsByType[type]) {
            statsByType[type] = { uniqueIds: new Set(), totalRows: 0 };
        }
        statsByType[type].uniqueIds.add(id);
        statsByType[type].totalRows++;
    });

    console.log("\nSummary by Type:");
    const summary = Object.entries(statsByType).map(([type, stats]) => {
        return {
            type,
            uniqueCount: stats.uniqueIds.size,
            totalRows: stats.totalRows
        };
    });
    console.table(summary);

    const totalUnique = new Set();
    Object.values(statsByType).forEach(s => s.uniqueIds.forEach(id => totalUnique.add(id)));
    console.log(`\nTotal Unique Containers (All Types): ${totalUnique.size}`);

    process.exit(0);
}

analyzeUniqueContainers().catch(console.error);
