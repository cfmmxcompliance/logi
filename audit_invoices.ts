
// Audit Invoices Script
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';

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

async function audit() {
    console.log("--- AUDITING COMMERCIAL INVOICES TIMELINE ---");

    try {
        const colRef = collection(db, 'commercial_invoices');

        // 1. Get MOST RECENTLY updated items
        const qRecent = query(colRef, orderBy('updatedAt', 'desc'), limit(5)); // Assuming 'updatedAt' exists
        // Note: If 'updatedAt' is missing, we might need a different strategy.

        const snap = await getDocs(colRef);
        console.log(`Total Records: ${snap.size}`);

        const timestamps: string[] = [];

        snap.forEach(doc => {
            const d = doc.data();
            const time = d.updatedAt || d.date || "Unknown"; // Fallback to Invoice Date if no system update time
            timestamps.push(`${time} [${d.invoiceNo}]`);
        });

        timestamps.sort().reverse(); // Sort desc

        console.log("--- LATEST 10 MODIFICATIONS ---");
        timestamps.slice(0, 10).forEach(t => console.log(t));

    } catch (e) {
        console.error("AUDIT ERROR:", e);
    }
    console.log("---------------------------------------------");
    process.exit();
}

audit();
