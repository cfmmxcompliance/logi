import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';

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

async function verifyCount() {
    console.log("🔢 Fetching ALL DS510 records for January 2026 for local verification...");

    // We only query by date (range) which only requires a single-field index (already exists for ordering)
    const q = query(
        collection(db, "ds510"),
        where("FechaPagoReal", ">=", "2026-01-01"),
        where("FechaPagoReal", "<=", "2026-01-31 23:59:59")
    );

    const snap = await getDocs(q);
    console.log(`📡 Total records found in January 2026: ${snap.size}`);

    const filtered = snap.docs.filter(doc => {
        const data = doc.data();
        // Check both '1' and 1
        return String(data.TipoPedimento) === '1' || data.TipoPedimento === 1;
    });

    console.log(`🎯 Records with TipoPedimento == 1: ${filtered.length}`);

    // Debug: first 5 records
    console.log("\nSample of matched records (First 5):");
    filtered.slice(0, 5).forEach(doc => {
        const d = doc.data();
        console.log(`- Pedimento: ${d.Pedimento}, Tipo: ${d.TipoPedimento}, Fecha: ${d.FechaPagoReal}`);
    });
}

verifyCount();
