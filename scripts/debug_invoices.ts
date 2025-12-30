
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, getDoc } from "firebase/firestore";
// import { firebaseConfig } from "../services/firebaseConfig"; 

const firebaseConfig = {
    apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
    authDomain: "logimaster-cfmoto.firebaseapp.com",
    projectId: "logimaster-cfmoto",
    storageBucket: "logimaster-cfmoto.firebasestorage.app",
    messagingSenderId: "924452835722",
    appId: "1:924452835722:web:11a7eedec65ba034dc7873",
    measurementId: "G-01VXE7L5C3"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkInvoices() {
    console.log("Checking commercial_invoices...");
    const colRef = collection(db, 'commercial_invoices');
    const snap = await getDocs(colRef);

    console.log(`Total documents: ${snap.size}`);

    const corrupted: any[] = [];
    const samples: any[] = [];

    snap.forEach(doc => {
        const data = doc.data();
        if (!data.partNo && !data.item) { // Check for missing critical fields
            corrupted.push({ id: doc.id, ...data });
        }
        if (samples.length < 5) samples.push(data);
    });

    if (corrupted.length > 0) {
        console.log(`\nFound ${corrupted.length} POTENTIALLY CORRUPTED items (missing partNo/item):`);
        corrupted.slice(0, 5).forEach(c => console.log(JSON.stringify(c, null, 2)));
    } else {
        console.log("\nNo obviously corrupted items found (based on missing partNo).");
    }

    console.log("\nSample Valid Items:");
    // Print first 5 items to verify fields
    snap.docs.slice(0, 5).forEach(d => {
        const data = d.data();
        console.log(`ID: ${d.id} | Part: ${data.partNo} | Invoice: ${data.invoiceNo} | Container: ${data.containerNo}`);
    });
}

checkInvoices().catch(console.error);
