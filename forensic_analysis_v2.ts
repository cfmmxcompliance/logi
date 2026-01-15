
// Forensic Analysis Script V2
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, limit, doc, getDoc } from 'firebase/firestore';

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

async function analyze() {
    console.log("--- FORENSIC DATA ANALYSIS V2 ---");

    // 1. Inspect the single Draft DEEPER
    try {
        console.log("\n1. INSPECTING 'data_stage_drafts'...");
        const draftsCol = collection(db, 'data_stage_drafts');
        const draftSnap = await getDocs(draftsCol);
        if (!draftSnap.empty) {
            const draft = draftSnap.docs[0].data();
            console.log(`   ID: ${draftSnap.docs[0].id}`);

            if (draft.records && Array.isArray(draft.records)) {
                console.log(`   🔥 FOUND 'records' array: ${draft.records.length} entries.`);
                if (draft.records.length > 0) {
                    console.log("   First Record Sample:", JSON.stringify(draft.records[0], null, 2));
                }
            } else {
                console.log("   'records' field is not an array or missing.");
            }
        }
    } catch (e) {
        console.error("Draft Error:", e.message);
    }

    // 2. Inspect Customs Clearance (The 3920 items) - DUMP ALL KEYS
    try {
        console.log("\n2. INSPECTING 'customs_clearance' (FULL DUMP of 1 item)...");
        const custCol = collection(db, 'customs_clearance');
        const q = query(custCol, limit(1));
        const custSnap = await getDocs(q);

        custSnap.forEach((d) => {
            console.log(`\n   --- Item [ID: ${d.id}] ---`);
            console.log(JSON.stringify(d.data(), null, 2));
        });
    } catch (e) {
        console.error("Customs Error:", e.message);
    }

    console.log("\n------------------------------");
    process.exit();
}

analyze();
