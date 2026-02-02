
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const firebaseConfig = {
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function audit() {
    console.log("Starting Audit...");
    const snap = await getDocs(collection(db, 'electronic_dossiers'));
    const stats = {};

    snap.forEach(doc => {
        const data = doc.data();
        const p = data.numPedimento;
        if (!stats[p]) stats[p] = { docs: [], items: [] };
        stats[p].docs.push(doc.id);
        stats[p].items.push(...(data.items || []));
    });

    console.log("--- RESULTS ---");
    for (const [p, info] of Object.entries(stats)) {
        if (info.docs.length > 1 || info.items.length !== new Set(info.items.map(i => i.driveId)).size) {
            console.log(`Pedimento: ${p}`);
            console.log(`- Doc Count: ${info.docs.length} (${info.docs.join(', ')})`);
            console.log(`- Item Count: ${info.items.length}`);
            const uniqueIds = new Set(info.items.map(i => i.driveId));
            console.log(`- Unique DriveIDs: ${uniqueIds.size}`);
            if (info.items.length !== uniqueIds.size) {
                console.log("  ⚠️ HAS DUPLICATE ITEMS IN ARRAY");
            }
        }
    }
}

audit().catch(console.error);
