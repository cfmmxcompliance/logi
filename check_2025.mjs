import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit, query, where, orderBy } from 'firebase/firestore';

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

async function check2025() {
    console.log("Checking 2025 dates...");
    const sn = await getDocs(collection(db, 'ds501'));
    const dates = [];
    sn.forEach(d => {
        const date = d.data().FechaPagoReal;
        if (date && date.startsWith('2025')) dates.push(date);
    });

    dates.sort();
    console.log("First 5:", dates.slice(0, 5));
    console.log("Last 5:", dates.slice(-5));
    process.exit(0);
}

check2025();
