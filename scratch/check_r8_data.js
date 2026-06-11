import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
    authDomain: "logimaster-cfmoto.firebaseapp.com",
    projectId: "logimaster-cfmoto"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkData() {
    const snap = await getDocs(collection(db, 'r8_rules'));
    console.log(`Found ${snap.docs.length} rules`);
    let count = 0;
    const descriptions = [];
    snap.forEach(doc => {
        const data = doc.data();
        descriptions.push(data.description);
        if (data.description === 'TAPON DEL CINTURON DE SEGIRIDAD') {
            count++;
        }
    });
    console.log(`TAPON DEL CINTURON DE SEGIRIDAD appears ${count} times.`);
    console.log("All descriptions:");
    descriptions.forEach((d, i) => console.log(`${i+1}: ${d}`));
    process.exit(0);
}

checkData();
