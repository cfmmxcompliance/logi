import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, getDocs, limit } from 'firebase/firestore';

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

async function inspectDS510() {
    console.log("🔍 Inspecting DS510 sample data...");
    const q = query(collection(db, "ds510"), limit(5));
    const snap = await getDocs(q);

    if (snap.empty) {
        console.log("❌ No records found in ds510");
        return;
    }

    snap.docs.forEach((doc, i) => {
        console.log(`Document ${i + 1}:`, doc.data());
    });
}

inspectDS510();
