import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where, limit } from "firebase/firestore";

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

const SEARCH_STR = "170003";
const COLLECTIONS = [
    "commercial_invoices",
    "vessel_tracking",
    "equipment_tracking",
    "customs_clearance",
    "pre_alerts",
    "shipments",
    "logs",
    "daily_changes"
];

async function deepSearch() {
    console.log(`Deep searching for "${SEARCH_STR}" in all collections...`);

    for (const colName of COLLECTIONS) {
        process.stdout.write(`Checking ${colName}... `);
        const snap = await getDocs(query(collection(db, colName), limit(1000)));
        let matchCount = 0;
        snap.docs.forEach(doc => {
            const dataStr = JSON.stringify(doc.data()).toLowerCase();
            if (dataStr.includes(SEARCH_STR.toLowerCase())) {
                if (matchCount === 0) console.log("");
                console.log(`  [MATCH] ${colName} ID: ${doc.id}`);
                matchCount++;
            }
        });
        if (matchCount === 0) console.log("No matches.");
        else console.log(`  Total matches in ${colName}: ${matchCount}`);
    }

    process.exit(0);
}

deepSearch().catch(console.error);
