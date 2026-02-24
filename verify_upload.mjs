import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, limit, getCountFromServer, where, orderBy } from 'firebase/firestore';

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

async function verify() {
    console.log("🔍 Sampling Data for Verification...");

    // Read 20 documents from ds551 to see _sourceFile values
    try {
        const ds551Ref = collection(db, 'ds551');
        const q = query(ds551Ref, limit(20));
        const snap = await getDocs(q);

        const sources = new Set();
        snap.forEach(doc => {
            const data = doc.data();
            if (data._sourceFile) {
                sources.add(data._sourceFile);
            }
        });

        console.log("Sample Source Files:");
        sources.forEach(s => console.log(` - ${s}`));

        // Check if looks like 1406426
        let alienCount = 0;
        sources.forEach(s => {
            if (!s.includes('1406426')) alienCount++;
        });

        if (alienCount > 0) {
            console.log("❌ POTENTIAL MIXED DATA! Some files do not match current batch ID.");
        } else {
            console.log("✅ Sample looks clean (all match 1406426).");
        }

    } catch (e) {
        console.log("Error checking aliens:", e.message);
    }

    process.exit(0);
}

verify();
