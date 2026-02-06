
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

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
    const TERM = "DRYU9550150";
    console.log(`Searching for "${TERM}" across ALL logical collections...`);

    // 1. Check commercial_invoices (Items)
    console.log("\n--- Checking 'commercial_invoices' (ITEMS) ---");
    try {
        const q = query(collection(db, 'commercial_invoices'), where('containerNo', '==', TERM));
        const itemsSnapshot = await getDocs(q);

        if (itemsSnapshot.empty) {
            console.log("No items found matching containerNo == " + TERM);
        } else {
            console.log(`FOUND ${itemsSnapshot.size} items in Commercial Invoices!`);
            console.log(itemsSnapshot.docs[0].data());
        }
    } catch (error) {
        console.error("Error querying commercial_invoices:", error);
    }

    // 2. Check 'equipment_tracking' (containerNo)
    console.log("\n--- Checking 'equipment_tracking' ---");
    try {
        const q = query(collection(db, 'equipment_tracking'), where('containerNo', '==', TERM));
        const snap = await getDocs(q);
        if (!snap.empty) {
            console.log(`FOUND in Equipment! ID: ${snap.docs[0].id}`);
            console.log(JSON.stringify(snap.docs[0].data(), null, 2));
        } else {
            console.log("Not found in Equipment.");
        }
    } catch (e) { console.error("Error Equip:", e); }

    // 3. Check 'vessel_tracking' (containerNo)
    console.log("\n--- Checking 'vessel_tracking' ---");
    try {
        const q = query(collection(db, 'vessel_tracking'), where('containerNo', '==', TERM));
        const snap = await getDocs(q);
        if (!snap.empty) {
            console.log(`FOUND in Vessel Tracking! ID: ${snap.docs[0].id}`);
            console.log(JSON.stringify(snap.docs[0].data(), null, 2));
        } else {
            console.log("Not found in Vessel Tracking.");
        }
    } catch (e) { console.error("Error Vessel:", e); }

    process.exit(0);
}

search().catch(console.error);
