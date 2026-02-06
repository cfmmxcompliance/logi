
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where, limit } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
    authDomain: "logimaster-cfmoto.firebaseapp.com",
    projectId: "logimaster-cfmoto",
    storageBucket: "logimaster-cfmoto.firebasestorage.app",
    messagingSenderId: "924452835722",
    appId: "1:924452835722:web:11a7eedec65ba034dc7873"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function search() {
    const TERM = "WHSU20666";
    console.log(`Searching DEEP for "${TERM}"...`);

    // 1. Check 'shipments' (Shipment Plan) - Check 'containers' ARRAY
    console.log("\n--- Checking 'shipments' (array-contains) ---");
    try {
        const q = query(collection(db, 'shipments'), where('containers', 'array-contains', TERM));
        const snap = await getDocs(q);
        if (!snap.empty) {
            console.log(`FOUND in Shipment Plan! ID: ${snap.docs[0].id}`);
            console.log(JSON.stringify(snap.docs[0].data(), null, 2));
        } else {
            console.log("Not found in Shipments (Exact). checking brute force...");
            // Brute force check first 100 shipments
            const q2 = query(collection(db, 'shipments'), limit(100));
            const snap2 = await getDocs(q2);
            let found = false;
            snap2.forEach(d => {
                const data = d.data();
                const str = JSON.stringify(data);
                if (str.includes("WHSU") && str.includes("20666")) {
                    console.log(`FOUND FUZZY MATCH in Shipment ${d.id}`);
                    console.log(data);
                    found = true;
                }
            });
            if (!found) console.log("Not found in Shipments (Fuzzy).");
        }
    } catch (e) { console.error("Error Shipments:", e); }

    // 2. Check 'customs_clearance'
    console.log("\n--- Checking 'customs_clearance' ---");
    try {
        const q = query(collection(db, 'customs_clearance'), where('containerNo', '==', TERM));
        const snap = await getDocs(q);
        if (!snap.empty) {
            console.log(`FOUND in Customs! ID: ${snap.docs[0].id}`);
            console.log(JSON.stringify(snap.docs[0].data(), null, 2));
        } else {
            console.log("Not found in Customs.");
        }
    } catch (e) { console.error("Error Customs:", e); }

    process.exit(0);
}

search().catch(console.error);
