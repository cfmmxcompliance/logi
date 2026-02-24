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

async function checkSpecialCollections() {
    const list = ['dsSel', 'dsInci', 'dsResumen', 'dsIncis', 'dsInci.asc', 'dsSel.asc'];
    for (const name of list) {
        try {
            const snap = await getDocs(query(collection(db, name), limit(1)));
            if (!snap.empty) {
                console.log(`✅ Found collection: ${name}`);
            } else {
                console.log(`❌ No data in: ${name}`);
            }
        } catch (e) {
            console.log(`❌ Error checking ${name}: ${e.message}`);
        }
    }
    process.exit(0);
}

checkSpecialCollections();
