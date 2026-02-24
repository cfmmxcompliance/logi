import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, limit } from 'firebase/firestore';

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
    console.log("Checking ds501 records...");
    const q = query(collection(db, 'ds501'), limit(5));
    const snap = await getDocs(q);

    if (snap.empty) {
        console.log("❌ ds501 is EMPTY.");
    } else {
        console.log(`✅ ds501 has data. Found ${snap.size} sample records.`);
        snap.forEach(doc => {
            console.log(` - ID: ${doc.id}`);
            console.log(` - _sourceFile: ${doc.data()._sourceFile}`);
        });
    }
    process.exit(0);
}

check().catch(console.error);
