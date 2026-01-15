
// Forensic Analysis Script
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
    console.log("--- FORENSIC DATA ANALYSIS ---");

    // 1. Inspect the single Draft
    try {
        console.log("\n1. INSPECTING 'data_stage_drafts' (1 Record)...");
        const draftsCol = collection(db, 'data_stage_drafts');
        const draftSnap = await getDocs(draftsCol);
        if (!draftSnap.empty) {
            const draft = draftSnap.docs[0].data();
            console.log(`   ID: ${draftSnap.docs[0].id}`);
            console.log(`   Keys: ${Object.keys(draft).join(', ')}`);
            if (draft.items && Array.isArray(draft.items)) {
                console.log(`   Contains 'items' array: ${draft.items.length} entries.`);
            } else if (draft.data && Array.isArray(draft.data)) {
                console.log(`   Contains 'data' array: ${draft.data.length} entries.`);
            } else {
                console.log("   Structure unknown (no obvious array).");
            }
        }
    } catch (e) {
        console.error("Draft Error:", e.message);
    }

    // 2. Inspect Customs Clearance (The 3920 items)
    try {
        console.log("\n2. INSPECTING 'customs_clearance' (Sample of 3920 items)...");
        const custCol = collection(db, 'customs_clearance');
        const q = query(custCol, limit(3));
        const custSnap = await getDocs(q);

        custSnap.forEach((d, i) => {
            console.log(`\n   --- Item ${i + 1} ---`);
            // Print only relevant fields to identify if it's actually an Invoice Item
            const data = d.data();
            console.log(`   PartNo: ${data.partNo || data.PART_NUMBER || 'N/A'}`);
            console.log(`   Desc:   ${data.spanishDescription || data.description || 'N/A'}`);
            console.log(`   InvNo:  ${data.invoiceNo || 'N/A'}`);
            console.log(`   Qty:    ${data.qty || 'N/A'}`);
        });
    } catch (e) {
        console.error("Customs Error:", e.message);
    }

    console.log("\n------------------------------");
    process.exit();
}

analyze();
