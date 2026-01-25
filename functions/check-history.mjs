import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

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

async function checkHistory() {
    console.log(`🔎 ANALIZANDO HISTORIAL DE AUDITORÍA...`);
    try {
        const changesSnap = await getDocs(collection(db, "daily_changes"));
        const history = {};

        changesSnap.docs.forEach(doc => {
            const data = doc.data();
            const dateId = (doc.id.length === 10) ? doc.id : (data.timestamp || '').split('T')[0];
            if (!history[dateId]) history[dateId] = 0;
            history[dateId] += (data.count || (Array.isArray(data.partNumbers) ? data.partNumbers.length : 1));
        });

        console.log("\n--- HISTORIAL DE EVENTOS POR DÍA ---");
        Object.entries(history)
            .sort((a, b) => b[0].localeCompare(a[0]))
            .slice(0, 7)
            .forEach(([date, count]) => {
                console.log(`📅 ${date}: ${count} cambios registrados.`);
            });

        process.exit(0);
    } catch (e) {
        console.error("❌ Error:", e.message);
        process.exit(1);
    }
}

checkHistory();
