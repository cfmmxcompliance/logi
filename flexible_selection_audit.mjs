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

async function flexibleSelectionAudit() {
    console.log("Flexible Auditing dsSel...");

    // Fetch ALL records in dsSel
    const snap = await getDocs(collection(db, "dsSel"));
    console.log(`Total records in dsSel: ${snap.size}`);

    let totalJan = 0;
    let counts = {
        impo: 0,
        expo: 0
    };
    let semaforsImpo = {};
    let semaforsExpo = {};

    snap.docs.forEach(doc => {
        const d = doc.data();
        const date = d.FechaPagoReal || d.c6 || "";
        const op = d.TipoOperacion || d.c9 || "1";
        const sem = d.SemaforoFiscal || d.c7 || "UNKNOWN";

        if (date.startsWith("2026-01") || date.startsWith("202601")) {
            totalJan++;
            if (op === "1") {
                counts.impo++;
                semaforsImpo[sem] = (semaforsImpo[sem] || 0) + 1;
            } else {
                counts.expo++;
                semaforsExpo[sem] = (semaforsExpo[sem] || 0) + 1;
            }
        }
    });

    console.log(`Found ${totalJan} records for Jan 2026 in dsSel`);
    console.log(`IMPO: ${counts.impo}, EXPO: ${counts.expo}`);
    console.log("Semaforos IMPO:", semaforsImpo);
    console.log("Semaforos EXPO:", semaforsExpo);

    process.exit(0);
}

flexibleSelectionAudit().catch(console.error);
