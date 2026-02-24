import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where } from "firebase/firestore";

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

async function auditSelectionJan2026() {
    console.log("Auditing dsSel for Jan 2026...");

    const start = "2026-01-01";
    const end = "2026-01-31 23:59:59";

    const snap = await getDocs(query(collection(db, "dsSel"),
        where("FechaPagoReal", ">=", start),
        where("FechaPagoReal", "<=", end)));

    console.log(`Total dsSel records in Jan 2026: ${snap.size}`);

    const stats = {}; // { semaforo: { op: count } }

    snap.docs.forEach(doc => {
        const d = doc.data();
        const sem = d.SemaforoFiscal || d.c7 || "UNKNOWN";
        const op = d.TipoOperacion || d.c9 || "1";

        if (!stats[sem]) stats[sem] = {};
        stats[sem][op] = (stats[sem][op] || 0) + 1;
    });

    console.log("Breakdown by Semaforo and Operation Type:");
    console.table(stats);

    // Also check for 'c3' (Remesa) which the user mentioned 61
    let countRemesaImpo = 0;
    snap.docs.forEach(doc => {
        const d = doc.data();
        const op = d.TipoOperacion || d.c9 || "1";
        const remesa = parseInt(d.ConsecutivoRemesa || d.c3 || "0");
        if (op === "1" && remesa > 0) countRemesaImpo++;
    });
    console.log(`Total Impo Remesas (c3 > 0): ${countRemesaImpo}`);

    process.exit(0);
}

auditSelectionJan2026().catch(console.error);
