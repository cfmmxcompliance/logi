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

async function inspectCollections() {
    const cols = ['ds501', 'ds510', 'ds505'];
    for (const col of cols) {
        console.log(`\n--- Inspecting ${col} ---`);
        const snap = await getDocs(query(collection(db, col), limit(2)));
        if (snap.empty) {
            console.log(`Empty collection: ${col}`);
        } else {
            snap.forEach(doc => {
                console.log(`ID: ${doc.id}`, doc.data());
            });
        }
    }
}

inspectCollections();
