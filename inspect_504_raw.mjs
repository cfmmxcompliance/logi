import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, limit, query } from "firebase/firestore";

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

async function inspect504() {
    console.log("Reading first 5 records from ds504...");
    const snap = await getDocs(query(collection(db, "ds504"), limit(5)));
    console.log(`Found ${snap.size} records total in collection.`);

    snap.docs.forEach(doc => {
        console.log(`\nDoc ID: ${doc.id}`);
        console.log(JSON.stringify(doc.data(), null, 2));
    });
    process.exit(0);
}

inspect504().catch(console.error);
