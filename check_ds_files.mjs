import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit, query } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
    authDomain: "logimaster-cfmoto.firebaseapp.com",
    projectId: "logimaster-cfmoto",
    storageBucket: "logimaster-cfmoto.firebasestorage.app",
    messagingSenderId: "924452835722",
    appId: "1:924452835722:web:11a7eedec65ba034dc7873"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function check() {
    console.log("Checking ds_files...");
    const q = query(collection(db, 'ds_files'), limit(5));
    const snap = await getDocs(q);

    if (snap.empty) {
        console.log("❌ ds_files is EMPTY.");
    } else {
        console.log(`✅ ds_files has ${snap.size} sample records.`);
        snap.forEach(d => console.log(d.id, d.data().fileName));
    }
    process.exit(0);
}

check().catch(console.error);
