import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, getCountFromServer } from 'firebase/firestore';

const firebaseConfig = { apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU", projectId: "logimaster-cfmoto" };
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkR8() {
    try {
        const snap = await getCountFromServer(collection(db, 'rule_8ths'));
        console.log(`Documentos en rule_8ths: ${snap.data().count}`);
        
        // Let's also check if they are in some other collection just in case
        const snap2 = await getDocs(collection(db, 'rule_8ths'));
        if (snap2.docs.length > 0) {
            console.log("Muestra de un documento:", snap2.docs[0].id, snap2.docs[0].data());
        }
    } catch (e) {
        console.error("Error:", e);
    }
}
checkR8().then(() => process.exit(0));
