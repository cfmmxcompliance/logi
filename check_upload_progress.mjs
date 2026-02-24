import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where, count } from 'firebase/firestore';

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

async function checkProgress() {
    // Check ds501 count for new file
    // We kow new file has ~715 records in ds501.
    // We can't easily distinguish them without sourceFile query if not indexed?
    // But manual_process_zip adds _sourceFile.

    try {
        const q = query(collection(db, 'ds501'), where('_sourceFile', '==', '1798546_501.asc'));
        const snap = await getDocs(q);
        console.log(`ds501 (1798546): ${snap.size} / 715`);

        // Check ds551
        const q2 = query(collection(db, 'ds551'), where('_sourceFile', '==', '1798546_551.asc'));
        const snap2 = await getDocs(q2);
        console.log(`ds551 (1798546): ${snap2.size} / ???`);

    } catch (e) {
        console.log("Error checking progress:", e.message);
    }
    process.exit(0);
}

checkProgress();
