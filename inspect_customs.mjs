import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

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

async function inspectRecord() {
    const id = "000ed206-08fd-4a90-807e-71ae5802549b";
    console.log(`🔍 Inspeccionando registro: ${id}`);
    const snap = await getDoc(doc(db, 'customs_clearance', id));

    if (snap.exists()) {
        console.log(JSON.stringify(snap.data(), null, 2));
    } else {
        console.log("❌ No existe.");
    }
    process.exit(0);
}

inspectRecord();
