import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';

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
    console.log("Checking latest ds501 records...");
    const q = query(collection(db, 'ds501'), orderBy('_uploadedAt', 'desc'), limit(5));
    const snap = await getDocs(q);

    if (snap.empty) {
        console.log("No records found in ds501.");
    } else {
        snap.forEach(doc => {
            console.log(`\nID: ${doc.id}`);
            console.log(`_uploadedAt: ${doc.data()._uploadedAt}`);
            console.log(`session_id: ${doc.data().session_id}`);
            console.log(`_sourceFile: ${doc.data()._sourceFile}`);
        });
    }
    process.exit(0);
}

check().catch(console.error);
