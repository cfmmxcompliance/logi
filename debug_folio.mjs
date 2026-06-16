import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

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

async function debugFolio() {
    console.log("Fetching folio 1931R825034636 from balanceR8...");
    const snapB = await getDocs(query(collection(db, 'balanceR8'), where('folio', '==', '1931R825034636')));
    snapB.forEach(d => console.log("balanceR8:", JSON.stringify(d.data(), null, 2)));

    console.log("Fetching folio 1931R825034636 from r8Detalle...");
    const snapD = await getDocs(query(collection(db, 'r8Detalle'), where('numeroRegla8va', '==', '1931R825034636')));
    snapD.forEach(d => console.log("r8Detalle:", JSON.stringify(d.data(), null, 2)));

    process.exit(0);
}

debugFolio();
