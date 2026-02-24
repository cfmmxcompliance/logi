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

async function finalAuditJan2026() {
    console.log("Final inclusive audit for Jan 2026...");

    const start = "2026-01-01";
    const end = "2026-01-31 23:59:59";

    let ds501_impo = 0;
    let ds501_expo = 0;

    const snap501 = await getDocs(query(collection(db, "ds501"),
        where("FechaPagoReal", ">=", start),
        where("FechaPagoReal", "<=", end)));

    snap501.docs.forEach(doc => {
        const d = doc.data();
        const op = d.TipoOperacion || d.c4 || '1';
        if (op === '1') ds501_impo++;
        else if (op === '2') ds501_expo++;
    });

    console.log(`DS501 Results: IMPO=${ds501_impo}, EXPO=${ds501_expo}`);
    process.exit(0);
}

finalAuditJan2026().catch(console.error);
