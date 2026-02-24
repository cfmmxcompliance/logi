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

async function auditJan2026() {
    console.log("Auditing Pedimentos for Jan 2026 (2026-01-01 to 2026-01-31)...");

    const start = "2026-01-01";
    const end = "2026-01-31";

    let ds501_impo = 0;
    let ds501_expo = 0;
    let ds701_impo = 0;
    let ds701_expo = 0;

    // Audit DS501
    const snap501 = await getDocs(query(collection(db, "ds501"),
        where("FechaPagoReal", ">=", start),
        where("FechaPagoReal", "<=", end)));

    snap501.docs.forEach(doc => {
        const d = doc.data();
        const op = d.TipoOperacion || d.c4 || '1';
        if (op === '1') ds501_impo++;
        else if (op === '2') ds501_expo++;
    });

    // Audit DS701
    const snap701 = await getDocs(query(collection(db, "ds701"),
        where("FechaPagoReal", ">=", start),
        where("FechaPagoReal", "<=", end)));

    snap701.docs.forEach(doc => {
        const d = doc.data();
        const op = d.TipoOperacion || d.c4 || '1';
        if (op === '1') ds701_impo++;
        else if (op === '2') ds701_expo++;
    });

    console.log(`DS501: IMPO=${ds501_impo}, EXPO=${ds501_expo}`);
    console.log(`DS701: IMPO=${ds701_impo}, EXPO=${ds701_expo}`);
    console.log(`--- TOTALS ---`);
    console.log(`IMPO Total: ${ds501_impo + ds701_impo}`);
    console.log(`EXPO Total: ${ds501_expo + ds701_expo}`);

    process.exit(0);
}

auditJan2026().catch(console.error);
