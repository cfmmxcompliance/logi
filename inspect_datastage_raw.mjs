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

async function inspectDataStage() {
    console.log("🔍 INSPECCIONANDO DATA STAGE REPORTS...");

    const q = query(collection(db, 'data_stage_reports'), limit(5));
    const snap = await getDocs(q);

    snap.forEach(d => {
        console.log(`\n📄 ID: ${d.id}`);
        console.log(JSON.stringify(d.data(), null, 2));
    });

    process.exit(0);
}

inspectDataStage();
