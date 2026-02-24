import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, limit } from 'firebase/firestore';

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

async function runQuery() {
    console.log("🔍 Global search in DS557 for any record where FormaPago != 0...");

    // Query globally (might still require index if mixed with range, but let's try just inequality)
    const q = query(
        collection(db, "ds557"),
        where("FormaPago", "!=", "0"),
        limit(10)
    );

    try {
        let snap = await getDocs(q);

        console.log(`✅ Loaded ${snap.size} records matching (!= "0").`);

        if (snap.size === 0) {
            console.log("Trying with numeric 0 as fallback...");
            const q2 = query(
                collection(db, "ds557"),
                where("FormaPago", "!=", 0),
                limit(10)
            );
            snap = await getDocs(q2);
            console.log(`✅ Loaded ${snap.size} records matching (!= 0).`);
        }

        snap.docs.forEach(doc => {
            const data = doc.data();
            console.log(`- Pedimento: ${data.Pedimento}, Fecha: ${data.FechaPagoReal || data.FechaValidacionPagoR}, FormaPago: ${data.FormaPago}`);
        });

    } catch (err) {
        console.error("❌ Error querying Firebase:", err);
    }
}

runQuery();
