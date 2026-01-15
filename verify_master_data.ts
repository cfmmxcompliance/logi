
// Verify Master Data Script
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

async function verify() {
    console.log("--- VERIFYING MASTER DATA (PARTS) ---");

    try {
        const colRef = collection(db, 'parts');
        const snap = await getDocs(colRef);

        console.log(`✅ TOTAL RECORDS: ${snap.size}`);

        if (snap.size > 0) {
            // Check latest update
            // Note: Sort in memory since we already fetched all (snapshot size check). 
            // Query sort is better for perf but we want exact count first.
            const docs = snap.docs;
            const latest = docs.sort((a, b) => {
                const dA = a.data().updatedAt || a.data().UPDATE_TIME || "";
                const dB = b.data().updatedAt || b.data().UPDATE_TIME || "";
                return dB.localeCompare(dA);
            })[0].data();

            console.log(`✅ LATEST UPDATE: ${latest.updatedAt || latest.UPDATE_TIME || "Unknown"}`);
            console.log(`   Sample Part: ${latest.PART_NUMBER} - ${latest.DESCRIPCION_ES}`);

            if (snap.size === 6254) {
                console.log("✨ EXACT MATCH: The 6,254 records are safe.");
            } else {
                console.log(`⚠️ COUNT MISMATCH: Found ${snap.size}, expected 6,254.`);
            }
        }

    } catch (e) {
        console.error("VERIFICATION ERROR:", e);
    }
    console.log("-------------------------------------");
    process.exit();
}

verify();
