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
    console.log("Inspecting ds551 (Partidas)...");
    const q = query(collection(db, 'ds551'), limit(1));
    const snap = await getDocs(q);

    if (snap.empty) {
        console.log("ds551 is empty.");
    } else {
        snap.forEach(d => {
            console.log(JSON.stringify(d.data(), null, 2));
        });
    }
    process.exit(0);
}

check().catch(console.error);
