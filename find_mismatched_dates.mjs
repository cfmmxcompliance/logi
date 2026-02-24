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

async function findMismatchedDates() {
    console.log("Finding mismatched dates in ds501 for Jan 2026...");

    const snap = await getDocs(collection(db, "ds501"));
    const standardRangeMatch = (d) => d >= "2026-01-01" && d <= "2026-01-31";

    const results = [];

    snap.docs.forEach(doc => {
        const data = doc.data();
        const date = data.FechaPagoReal || data.c9 || "";
        const op = data.TipoOperacion || data.c4 || "1";

        const isFlexibleJan = date.startsWith("2026-01") || date.startsWith("202601") || date.includes("/01/2026");

        if (isFlexibleJan && !standardRangeMatch(date)) {
            results.push({
                id: doc.id,
                date: date,
                op: op,
                patente: data.Patente || data.c1,
                pedimento: data.Pedimento || data.c2
            });
        }
    });

    console.log(`Found ${results.length} mismatched records.`);
    console.table(results);
    process.exit(0);
}

findMismatchedDates().catch(console.error);
