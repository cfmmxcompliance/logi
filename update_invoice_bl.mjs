import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where, doc, updateDoc, writeBatch, limit } from "firebase/firestore";

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

const BL_VALUE = "SNLGSHXL6100045";
const INVOICE_NO = "25CFM170003S";

async function runUpdate() {
    console.log(`Syncing BL ${BL_VALUE} to items of invoice ${INVOICE_NO}...`);

    const ciRef = collection(db, "commercial_invoices");
    const q = query(ciRef, where("invoiceNo", "==", INVOICE_NO));
    const snap = await getDocs(q);

    console.log(`Found ${snap.size} items for invoice ${INVOICE_NO}.`);

    if (snap.size === 0) {
        console.log("No items found to update. Checking all invoices to see if it's stored differently...");
        const allSnap = await getDocs(query(ciRef, limit(300)));
        allSnap.docs.forEach(d => {
            const data = d.data();
            if (data.invoiceNo && data.invoiceNo.toLowerCase().includes("170003")) {
                console.log(`Found possible match: ${data.invoiceNo} (ID: ${d.id})`);
            }
        });
        process.exit(0);
    }

    const batch = writeBatch(db);
    snap.docs.forEach(d => {
        const itemRef = doc(db, "commercial_invoices", d.id);
        batch.update(itemRef, {
            bl: BL_VALUE,
            blNo: BL_VALUE,
            updatedAt: new Date().toISOString()
        });
    });

    await batch.commit();
    console.log(`Batch update complete. ${snap.size} items updated.`);
    process.exit(0);
}

runUpdate().catch(console.error);
