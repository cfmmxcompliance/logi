import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = { apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU", projectId: "logimaster-cfmoto" };
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkSub() {
    const snap = await getDocs(collection(db, 'data_stage_reports'));
    if (snap.docs.length > 0) {
        const firstId = snap.docs[0].id;
        const subSnap = await getDocs(collection(db, 'data_stage_reports', firstId, 'items'));
        console.log(`El reporte ${firstId} tiene ${subSnap.docs.length} pedimentos en la subcolección 'items'.`);
    }
}
checkSub().then(() => process.exit(0));
