
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

async function check() {
    console.log("--- DATE FORMAT PROBE ---");
    try {
        const q = query(collection(db, 'parts'), limit(5));
        const snap = await getDocs(q);
        snap.docs.forEach(d => {
            const data = d.data();
            console.log(`ID: ${d.id} | UPDATE_TIME: '${data.UPDATE_TIME}' | updatedAt: '${data.updatedAt}'`);
        });
    } catch (e) {
        console.error("Probe Error:", e);
    }
    process.exit();
}
check();
