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

async function verify558() {
    console.log("Inspecting ds558 records...");
    const snap = await getDocs(query(collection(db, 'ds558'), limit(5)));

    snap.forEach(d => {
        const data = d.data();
        console.log(`\nID: ${d.id}`);
        console.log(`Data keys:`, Object.keys(data).filter(k => !k.startsWith('_')));
        console.log(`Sample values:`, JSON.stringify(data, null, 2));
    });
    process.exit(0);
}

verify558();
