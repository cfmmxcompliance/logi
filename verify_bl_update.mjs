import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit, query, where } from 'firebase/firestore';

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

async function verifyBL() {
    console.log("🔍 VERIFICANDO CAMPO BL...");
    // Find an item that we know was updated (e.g. Container EMCU8805950 from logs)
    const q = query(collection(db, 'commercial_invoices'), where('containerNo', '==', 'EMCU8805950'), limit(1));
    const snap = await getDocs(q);

    snap.forEach(d => {
        console.log("---------------------------------------------------");
        console.log(`ID: ${d.id}`);
        console.log(`Invoice: ${d.data().invoiceNo}`);
        console.log(`Container: ${d.data().containerNo}`);
        console.log(`✅ BL FIELD: "${d.data().bl}"`); // This is what we want to check
    });

    process.exit(0);
}

verifyBL();
