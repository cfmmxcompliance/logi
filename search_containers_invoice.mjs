import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where, limit } from "firebase/firestore";

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

const CONTAINERS = [
    'FCIU7301900', 'SNBU2370214', 'SNBU8282722', 'SNBU8313778', 'SNBU8323502',
    'SNBU8326646', 'SNBU8335798', 'SNBU8366715', 'SNBU8370443', 'SNBU8420539',
    'SNBU8478320', 'SNBU8486259', 'TIIU6315904', 'TXGU4029150', 'UETU5598181'
];

async function searchByContainer() {
    console.log("Searching commercial_invoices by container numbers...");
    const ciRef = collection(db, "commercial_invoices");

    // We'll search in chunks for the 'containerNo' field
    const CHUNK_SIZE = 10;
    for (let i = 0; i < CONTAINERS.length; i += CHUNK_SIZE) {
        const chunk = CONTAINERS.slice(i, i + CHUNK_SIZE);
        const q = query(ciRef, where("containerNo", "in", chunk));
        const snap = await getDocs(q);

        console.log(`Chunk ${i / CHUNK_SIZE + 1}: Found ${snap.size} matches.`);
        snap.docs.forEach(doc => {
            const data = doc.data();
            console.log(`  [MATCH] ID: ${doc.id}, Invoice: ${data.invoiceNo}, Container: ${data.containerNo}`);
        });
    }

    process.exit(0);
}

searchByContainer().catch(console.error);
