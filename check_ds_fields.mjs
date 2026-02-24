import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, limit } from "firebase/firestore";

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

const dsCollections = [
    'ds501', 'ds502', 'ds503', 'ds504', 'ds505', 'ds506', 'ds507', 'ds508', 'ds509', 'ds510',
    'ds511', 'ds512', 'ds520', 'ds551', 'ds554', 'ds557', 'ds558', 'ds701', 'ds702', 'dsSel'
];

async function checkFields() {
    console.log("Checking DataStage Fields...");
    for (const col of dsCollections) {
        const snap = await getDocs(query(collection(db, col), limit(1)));
        if (!snap.empty) {
            const data = snap.docs[0].data();
            const hasDate = 'FechaPagoReal' in data || 'fec_pago' in data || 'c9' in data; // c9 is often date in some
            console.log(`${col}: Has FechaPagoReal? ${'FechaPagoReal' in data}. Fields: ${Object.keys(data).slice(0, 5)}`);
        } else {
            console.log(`${col}: Empty`);
        }
    }
    process.exit(0);
}

checkFields().catch(console.error);
