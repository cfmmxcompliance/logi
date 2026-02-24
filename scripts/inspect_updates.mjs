
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';

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

async function inspect() {
    console.log("🔍 Fetching 5 most recently updated parts...");
    const q = query(collection(db, 'parts'), orderBy('UPDATE_TIME', 'desc'), limit(5));
    const snap = await getDocs(q);

    snap.docs.forEach(d => {
        console.log(`ID: ${d.id} | Updated: ${d.data().UPDATE_TIME}`);
    });
    process.exit(0);
}

inspect().catch(console.error);
