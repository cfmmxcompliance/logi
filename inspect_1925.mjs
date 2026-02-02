
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

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

async function inspect1925() {
    console.log("🔍 INSPECTING 1925160 DOSSIER...");

    const snap = await getDocs(collection(db, 'electronic_dossiers'));
    const target = snap.docs.find(d => d.data().numPedimento.includes('1925160'));

    if (target) {
        console.log(`\n📂 Dossier: ${target.data().numPedimento}`);
        const items = target.data().items || [];
        items.forEach(i => console.log(` - ${i.name}`));
    } else {
        console.log("❌ Dossier 1925160 NOT FOUND.");
    }
    process.exit(0);
}

inspect1925().catch(console.error);
