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

async function debugAnalytics() {
    const queryStart = "2026-01-01";
    const queryEnd = "2026-01-31 23:59:59";

    console.log(`Debugging with range: ${queryStart} to ${queryEnd}`);

    let q504 = query(collection(db, 'ds504'));
    if (queryStart) q504 = query(q504, where('FechaPagoReal', '>=', queryStart));
    if (queryEnd) q504 = query(q504, where('FechaPagoReal', '<=', queryEnd));

    const snap504 = await getDocs(q504);

    let containerCount = 0;
    let containerTypes = {};

    snap504.docs.forEach(doc => {
        const d = doc.data();
        let type = (d.TipoContenedor || d.c5 || 'OTRO').toString();
        if (type === '22') type = '56';
        containerTypes[type] = (containerTypes[type] || 0) + 1;
        containerCount++;
    });

    console.log(`Resulting containerCount: ${containerCount}`);
    console.log("Resulting containerTypes:", containerTypes);

    process.exit(0);
}

debugAnalytics().catch(console.error);
