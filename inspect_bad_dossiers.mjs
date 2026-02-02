
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';

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

const TARGETS = ['0438261', '3471622'];

async function inspect() {
    console.log("🔍 INSPECTING BAD DOSSIERS...");

    // We can't query by ID directly if we don't know the exact ID (it might be auto-id or pedimento id).
    // We'll search items by numPedimento.

    const snap = await getDocs(collection(db, 'electronic_dossiers'));

    for (const d of snap.docs) {
        const p = d.data().numPedimento;
        if (TARGETS.includes(p)) {
            console.log(`\n📂 Dossier: ${p} (ID: ${d.id})`);
            const items = d.data().items || [];
            items.forEach(i => console.log(` - ${i.name}`));
        }
    }
}

inspect().catch(console.error);
