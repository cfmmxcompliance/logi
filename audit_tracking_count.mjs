import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, getCountFromServer } from 'firebase/firestore';

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

async function countTracking() {
    console.log("🔍 CONTANDO CONTENEDORES EN TRACKING...");

    // Efficient Count
    const coll = collection(db, 'vessel_tracking');
    const snapshot = await getCountFromServer(coll);
    console.log(`📊 Total de Contenedores en Tracking: ${snapshot.data().count}`);

    // Detailed Scan (Optional, for integrity check)
    // const snap = await getDocs(coll);
    // console.log(`   (Verificado por descarga: ${snap.size})`);

    process.exit(0);
}

countTracking();
