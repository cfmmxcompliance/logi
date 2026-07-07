import { initializeApp } from 'firebase/app';
import { getFirestore, collection, limit, getDocs, query } from 'firebase/firestore';

const firebaseConfig = { apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU", projectId: "logimaster-cfmoto" };
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkQuota() {
    try {
        const q = query(collection(db, 'rule_8ths'), limit(1));
        await getDocs(q);
        console.log("QUOTA IS OK. Lectura exitosa.");
    } catch (e) {
        console.error("FIREBASE ERROR:", e.code || e.message);
    }
}
checkQuota().then(() => process.exit(0));
