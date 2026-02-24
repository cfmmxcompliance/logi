import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';

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

async function simulateAppQuery() {
    console.log("🚀 Simulating exact app query for DS510 (Jan 2026)...");

    // The app uses these exact parameters
    const startDate = "2026-01-01";
    const endDate = "2026-01-31";
    const dateField = "FechaPagoReal";

    const q = query(
        collection(db, "ds510"),
        where(dateField, ">=", startDate),
        where(dateField, "<=", endDate),
        orderBy(dateField, "desc"),
        limit(100)
    );

    try {
        const snap = await getDocs(q);
        console.log(`📡 Firebase returned: ${snap.size} docs`);

        if (snap.size > 0) {
            console.log(`- Newest record date: ${snap.docs[0].data()[dateField]}`);
            console.log(`- Oldest record in batch date: ${snap.docs[snap.docs.length - 1].data()[dateField]}`);
        }

    } catch (err) {
        console.error("❌ Query Failed:", err);
    }
}

simulateAppQuery();
