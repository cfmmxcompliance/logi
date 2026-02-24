import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where, doc, writeBatch } from "firebase/firestore";

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

const BL_VALUE = "SNLGSHXL6100045";
const CONTAINERS = [
    'FCIU7301900', 'SNBU2370214', 'SNBU8282722', 'SNBU8313778', 'SNBU8323502',
    'SNBU8326646', 'SNBU8335798', 'SNBU8366715', 'SNBU8370443', 'SNBU8420539',
    'SNBU8478320', 'SNBU8486259', 'TIIU6315904', 'TXGU4029150', 'UETU5598181'
];

async function bulkUpdate() {
    console.log(`Starting bulk update for BL: ${BL_VALUE}...`);
    const ciRef = collection(db, "commercial_invoices");
    const batch = writeBatch(db);
    let totalUpdated = 0;

    const CHUNK_SIZE = 10;
    for (let i = 0; i < CONTAINERS.length; i += CHUNK_SIZE) {
        const chunk = CONTAINERS.slice(i, i + CHUNK_SIZE);
        const q = query(ciRef, where("containerNo", "in", chunk));
        const snap = await getDocs(q);

        console.log(`Chunk ${i / CHUNK_SIZE + 1}: Found ${snap.size} invoice items.`);
        snap.docs.forEach(d => {
            const itemRef = doc(db, "commercial_invoices", d.id);
            batch.update(itemRef, {
                blNo: BL_VALUE,
                bl: BL_VALUE,
                updatedAt: new Date().toISOString()
            });
            totalUpdated++;
        });
    }

    if (totalUpdated > 0) {
        await batch.commit();
        console.log(`Successfully updated ${totalUpdated} invoice items with BL ${BL_VALUE}.`);
    } else {
        console.log("No invoice items found to update.");
    }

    process.exit(0);
}

bulkUpdate().catch(console.error);
