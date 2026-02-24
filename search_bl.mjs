import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where } from "firebase/firestore";

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

const BL_TO_SEARCH = "SNLGSHXL6100045";

async function search() {
    console.log(`Searching for BL: ${BL_TO_SEARCH}...`);

    // Search in vessel_tracking
    const vtRef = collection(db, "vessel_tracking");
    const q1 = query(vtRef, where("blNo", "==", BL_TO_SEARCH));
    const snap1 = await getDocs(q1);

    console.log(`Vessel Tracking Matches: ${snap1.size}`);
    snap1.docs.forEach(doc => {
        console.log("VT Record:", doc.id, doc.data());
    });

    // Search in commercial_invoices (if it's stored there)
    const ciRef = collection(db, "commercial_invoices");
    const q2 = query(ciRef, where("bl", "==", BL_TO_SEARCH)); // Check 'bl' field
    const snap2 = await getDocs(q2);

    console.log(`Commercial Invoices Matches (bl): ${snap2.size}`);
    snap2.docs.forEach(doc => {
        console.log("CI Record (bl):", doc.id, doc.data().invoiceNo);
    });

    const q3 = query(ciRef, where("blNo", "==", BL_TO_SEARCH)); // Check 'blNo' field
    const snap3 = await getDocs(q3);

    console.log(`Commercial Invoices Matches (blNo): ${snap3.size}`);
    snap3.docs.forEach(doc => {
        console.log("CI Record (blNo):", doc.id, doc.data().invoiceNo);
    });

    process.exit(0);
}

search().catch(console.error);
