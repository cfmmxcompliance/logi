import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, limit } from "firebase/firestore";

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

async function peekSelection() {
    console.log("Peeking at dsSel...");
    const snap = await getDocs(query(collection(db, "dsSel"), limit(10)));
    snap.docs.forEach(doc => {
        console.log(`ID: ${doc.id}`);
        console.log(doc.data());
        console.log("---");
    });
    process.exit(0);
}

peekSelection().catch(console.error);
