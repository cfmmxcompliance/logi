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

async function checkMaxDate() {
    console.log("Checking max date...");
    // Try to sort by FechaPagoReal desc
    try {
        const q = query(collection(db, 'ds501'), orderBy('FechaPagoReal', 'desc'), limit(5));
        const snap = await getDocs(q);

        if (snap.empty) {
            console.log("No docs found.");
        } else {
            snap.forEach(d => {
                console.log("📅 FechaPagoReal:", d.data().FechaPagoReal);
            });
        }
    } catch (e) {
        console.error("Sort index might be missing. Scanning 100 randomly...");
        const snap = await getDocs(query(collection(db, 'ds501'), limit(100)));
        snap.forEach(d => {
            const date = d.data().FechaPagoReal;
            if (date && date.startsWith('2026')) console.log("Found 2026:", date);
        });
        console.log("Scan complete.");
    }
    process.exit(0);
}

checkMaxDate();
