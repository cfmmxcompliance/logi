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

async function findMissingContainers() {
    console.log("🔍 BUSCANDO DIFERENCIAS ENTRE TRACKING Y CUSTOMS...");

    const [customsSnap, trackingSnap] = await Promise.all([
        getDocs(collection(db, 'customs_clearance')),
        getDocs(collection(db, 'vessel_tracking'))
    ]);

    // 1. Customs Containers (Clean)
    const customsContainers = new Set();
    customsSnap.forEach(d => {
        const c = (d.data().containerNo || '').trim();
        if (c && c.toLowerCase() !== 'multiple') {
            customsContainers.add(c);
        }
    });

    // 2. Tracking Containers
    const trackingContainers = new Set();
    const trackingList = [];
    trackingSnap.forEach(d => {
        const c = (d.data().containerNo || '').trim();
        if (c && c.toLowerCase() !== 'multiple') {
            trackingContainers.add(c);
            trackingList.push({ container: c, bl: d.data().blNo });
        }
    });

    console.log(`\n📊 Conteos:`);
    console.log(`- Customs (Reales): ${customsContainers.size}`);
    console.log(`- Tracking (Reales): ${trackingContainers.size}`);

    // 3. Find Missing
    const missingInCustoms = [];
    trackingList.forEach(item => {
        if (!customsContainers.has(item.container)) {
            missingInCustoms.push(item);
        }
    });

    console.log(`\n🚨 Faltantes en Customs (${missingInCustoms.length}):`);
    missingInCustoms.forEach(m => {
        console.log(`- Contenedor: ${m.container} (BL: ${m.bl})`);
    });

    process.exit(0);
}

findMissingContainers();
