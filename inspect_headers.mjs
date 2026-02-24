import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit, query } from 'firebase/firestore';
import dotenv from 'dotenv';
dotenv.config();

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

const COLLECTIONS = ['ds505', 'ds509', 'ds510'];

async function inspect() {
    console.log("🔍 Inspecting Data Stage Collections...");

    for (const colName of COLLECTIONS) {
        console.log(`\n📂 Collection: ${colName}`);
        try {
            const q = query(collection(db, colName), limit(1));
            const snap = await getDocs(q);

            if (snap.empty) {
                console.log("   (Empty Collection)");
                continue;
            }

            const doc = snap.docs[0];
            const data = doc.data();
            const keys = Object.keys(data).sort();

            // Filter out system keys if too many, or just show all
            console.log(`   Keys (${keys.length}):`, keys.join(', '));

            // Check for potential matches for generic fields like "ValorEUR"
            const potentialMatches = keys.filter(k => k.toLowerCase().includes('valor') || k.toLowerCase().includes('eur'));
            if (potentialMatches.length) console.log(`   👉 Potential Value Matches: ${potentialMatches.join(', ')}`);

        } catch (e) {
            console.error(`   ❌ Error: ${e.message}`);
        }
    }
    process.exit(0);
}

inspect();
