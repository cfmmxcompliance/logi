
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, deleteDoc } from 'firebase/firestore';

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

async function cleanupEmpty() {
    console.log("🧹 CLEANING UP EMPTY DOSSIERS...");

    const snap = await getDocs(collection(db, 'electronic_dossiers'));
    let deletedCount = 0;

    for (const d of snap.docs) {
        const data = d.data();
        const items = data.items || [];

        if (items.length === 0) {
            console.log(`Deleting empty dossier: ${data.numPedimento} (ID: ${d.id})`);
            await deleteDoc(d.ref);
            deletedCount++;
        }
    }

    console.log(`✅ Deleted ${deletedCount} empty dossiers.`);
    process.exit(0);
}

cleanupEmpty().catch(console.error);
