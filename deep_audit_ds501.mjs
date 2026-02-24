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

async function deepAuditJan2026() {
    console.log("Deep Auditing ds501...");

    // Fetch ALL records in ds501 to check for formatting issues
    const snap = await getDocs(collection(db, "ds501"));
    console.log(`Total records in ds501: ${snap.size}`);

    let countImpoJan = 0;
    let countExpoJan = 0;
    let weirdDates = [];

    snap.docs.forEach(doc => {
        const d = doc.data();
        const dateRaw = d.FechaPagoReal || d.c9 || "";
        const op = d.TipoOperacion || d.c4 || '1';

        // Match 2026-01 or 202601
        if (dateRaw.startsWith("2026-01") || dateRaw.startsWith("202601") || dateRaw.includes("/01/2026")) {
            if (op === '1') countImpoJan++;
            else if (op === '2') countExpoJan++;
            else console.log(`Unknown OP: ${op} in ${doc.id}`);
        } else if (dateRaw.includes("2026")) {
            weirdDates.push({ id: doc.id, date: dateRaw, op: op });
        }
    });

    console.log(`Found with flexible date matching: IMPO=${countImpoJan}, EXPO=${countExpoJan}`);
    if (weirdDates.length > 0) {
        console.log("Other 2026 dates found:");
        console.table(weirdDates.slice(0, 20));
    }

    process.exit(0);
}

deepAuditJan2026().catch(console.error);
