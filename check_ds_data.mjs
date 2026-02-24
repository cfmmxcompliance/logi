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

async function checkCollections() {
    const codes = ['516', '517', '518', '519'];
    for (const code of codes) {
        console.log(`\nChecking ds${code}...`);
        const snap = await getDocs(query(collection(db, `ds${code}`), limit(1)));
        if (snap.empty) {
            console.log(`   No records found in ds${code}.`);
        } else {
            console.log(`   Found record in ds${code}!`);
            console.log(`   Keys:`, Object.keys(snap.docs[0].data()));
        }
    }
    process.exit(0);
}

checkCollections();
