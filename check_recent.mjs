import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit, query, orderBy, where } from 'firebase/firestore';

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

async function checkRecentUploads() {
    console.log("Checking recently uploaded documents...");
    // Try to sort by _uploadedAt desc
    try {
        const q = query(collection(db, 'ds501'), orderBy('_uploadedAt', 'desc'), limit(5));
        const snap = await getDocs(q);

        if (snap.empty) {
            console.log("No docs found.");
        } else {
            snap.forEach(d => {
                const data = d.data();
                console.log(`📅 Uploaded: ${data._uploadedAt} | FechaPagoReal: ${data.FechaPagoReal}`);
            });
        }
    } catch (e) {
        console.error("Index missing for _uploadedAt? ", e.message);
        // Fallback: Just query for any document with _uploadedAt > some recent timestamp?
        // Actually, just notify user about missing index if needed.
        // But likely indexes exist for _uploadedAt.
    }
    process.exit(0);
}

checkRecentUploads();
