import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where, getCountFromServer } from "firebase/firestore";

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

async function verifyCounts() {
    const start = "2026-01-01";
    const end = "2026-01-31 23:59:59";

    console.log(`Verifying counts from ${start} to ${end}...`);

    // DS501
    const q501 = query(collection(db, "ds501"), where("FechaPagoReal", ">=", start), where("FechaPagoReal", "<=", end));
    const snap501 = await getDocs(q501);
    let impo501 = 0, expo501 = 0;
    snap501.forEach(doc => {
        const d = doc.data();
        if (d.TipoOperacion === "1" || d.c4 === "1") impo501++;
        else if (d.TipoOperacion === "2" || d.c4 === "2") expo501++;
    });

    // DSInci
    const qInci = query(collection(db, "dsInci"), where("FechaPagoReal", ">=", start), where("FechaPagoReal", "<=", end));
    const snapInci = await getCountFromServer(qInci);

    // DSInci detailed
    const snapInciFull = await getDocs(qInci);
    let impoInci = 0, expoInci = 0;
    snapInciFull.forEach(doc => {
        const d = doc.data();
        if (d.TipoOperacion === "1" || d.c12 === "1") impoInci++;
        else if (d.TipoOperacion === "2" || d.c12 === "2") expoInci++;
    });

    console.log(`--- RESULTS ---`);
    console.log(`DS501: IMPO=${impo501}, EXPO=${expo501} (Target: 367/12)`);
    console.log(`DSInci: Total=${snapInci.data().count}, IMPO=${impoInci}, EXPO=${expoInci} (Target: 61)`);

    process.exit(0);
}

verifyCounts().catch(console.error);
