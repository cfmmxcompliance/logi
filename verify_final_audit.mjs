import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, limit, getDocs } from 'firebase/firestore';

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

async function verifyFinal() {
    console.log("🔍 FINAL INTEGRITY CHECK");

    const collections = ['ds501', 'ds551', 'ds506'];

    for (const col of collections) {
        const q = query(collection(db, col), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) {
            console.log(`\n📄 Sample from ${col}:`);
            console.log(JSON.stringify(snap.docs[0].data(), null, 2));
        } else {
            console.log(`\n❌ ${col} is empty!`);
        }
    }
}

verifyFinal().catch(console.error);
