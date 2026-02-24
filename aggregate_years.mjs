import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit, query, orderBy } from 'firebase/firestore';

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

async function aggregateByYear() {
    console.log("Analyzing record distribution by year...");
    const snap = await getDocs(collection(db, 'ds501'));
    const counts = {};

    snap.forEach(d => {
        const date = d.data().FechaPagoReal;
        if (date) {
            const year = date.substring(0, 4);
            counts[year] = (counts[year] || 0) + 1;
        } else {
            counts['UNKNOWN'] = (counts['UNKNOWN'] || 0) + 1;
        }
    });

    console.log("--- RESULTS ---");
    console.table(counts);
    process.exit(0);
}

aggregateByYear();
