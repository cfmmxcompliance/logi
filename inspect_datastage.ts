
// Inspect Data Stage Script
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

async function inspect() {
    console.log("--- INSPECTING DATA STAGE REPORTS ---");

    try {
        const colRef = collection(db, 'data_stage_reports');
        // Get most recent 5 reports
        const q = query(colRef, orderBy('createdAt', 'desc'), limit(5));
        // Note: field might be 'timestamp' or 'date', trying commonly used ones or sorting in memory if needed.
        // Let's just get all 20 since it's small.
        const snap = await getDocs(colRef);

        console.log(`Found ${snap.size} Data Stage Reports.`);

        const reports = [];
        snap.forEach(doc => {
            const data = doc.data();
            // Estimate size of 'items' or 'rows' array if it exists
            const itemCount = Array.isArray(data.items) ? data.items.length : (Array.isArray(data.rows) ? data.rows.length : 0);

            reports.push({
                id: doc.id,
                name: data.fileName || data.name || "Untitled",
                date: data.createdAt || data.timestamp || data.date || "Unknown",
                itemCount: itemCount,
                status: data.status || "N/A"
            });
        });

        // Sort by Date Descending
        reports.sort((a, b) => b.date.localeCompare(a.date));

        console.table(reports);

        const heavyReports = reports.filter(r => r.itemCount > 500);
        if (heavyReports.length > 0) {
            console.log(`\n🔥 FOUND ${heavyReports.length} REPORTS WITH > 500 ITEMS!`);
            heavyReports.forEach(r => console.log(`   -> [${r.date}] ${r.name}: ${r.itemCount} items (ID: ${r.id})`));
        } else {
            console.log("\nNo heavy reports found.");
        }

    } catch (e) {
        console.error("INSPECTION ERROR:", e);
    }
    console.log("\n-------------------------------------");
    process.exit();
}

inspect();
