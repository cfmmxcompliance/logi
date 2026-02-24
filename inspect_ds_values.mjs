import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit, query, where } from 'firebase/firestore';

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

async function inspectValues() {
    console.log("Inspecting ds516 values...");
    const snap = await getDocs(query(collection(db, 'ds516'), limit(5)));

    snap.forEach(d => {
        const data = d.data();
        console.log(`\nID: ${d.id}`);
        console.log(`Is Schema Example: ${data._isSchemaExample}`);
        console.log(`Keys with values:`);
        Object.keys(data).forEach(k => {
            if (k.startsWith('campo_')) {
                console.log(`  ${k}: ${data[k]}`);
            }
        });
    });
    process.exit(0);
}

inspectValues();
