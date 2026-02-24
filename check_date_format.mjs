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
    console.log("Checking fechaEntrada in ds501...");
    const q = query(collection(db, 'ds501'), limit(10));
    const snap = await getDocs(q);

    snap.forEach(d => {
        const data = d.data();
        console.log(`ID: ${d.id}, fechaEntrada: '${data.fechaEntrada}', typeof: ${typeof data.fechaEntrada}`);
    });
    process.exit(0);
}

check().catch(console.error);
