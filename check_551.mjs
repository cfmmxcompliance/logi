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

async function check551() {
    console.log("Checking ds551 years...");
    // Scan a few records to see if we have 2026 dates
    // ds551 doesn't always have date? 
    // Wait, nuclear_fix added _uploadedAt?
    // Let's check _uploadedAt for recent uploads.

    const snap = await getDocs(query(collection(db, 'ds551'), limit(50)));
    let found2026 = 0;

    snap.forEach(d => {
        const data = d.data();
        if (data._uploadedAt && data._uploadedAt.startsWith('2026')) {
            found2026++;
        }
    });

    console.log(`Found ${found2026} records with recent _uploadedAt (2026) out of 50 sampled.`);
    process.exit(0);
}

check551();
