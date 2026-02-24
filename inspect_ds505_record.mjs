import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit, query } from 'firebase/firestore';

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
    console.log("Inspecting ds505 record for 'columns' metadata...");
    const snap = await getDocs(query(collection(db, 'ds505'), limit(1)));

    if (snap.empty) {
        console.log("No records in ds505.");
    } else {
        const d = snap.docs[0].data();
        console.log("Record Keys:", Object.keys(d));
        console.log("Has 'columns'?", !!d.columns);
        if (d.columns) console.log("Columns:", d.columns);
        console.log("Has '_sourceFile'?", !!d._sourceFile);
    }
    process.exit(0);
}

inspect();
