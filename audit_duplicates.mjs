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

async function checkDuplicates() {
    console.log("🔍 Auditando Firestore en busca de duplicados...");
    const snap = await getDocs(collection(db, 'parts'));
    const pnMap = new Map(); // PN -> List of IDs

    snap.forEach(d => {
        const data = d.data();
        const pn = (data.PART_NUMBER || '').toString().toUpperCase().trim();
        if (!pnMap.has(pn)) pnMap.set(pn, []);
        pnMap.get(pn).push(d.id);
    });

    let duplicatesFound = 0;
    pnMap.forEach((ids, pn) => {
        if (ids.length > 1) {
            console.log(`❌ DUPLICADO: ${pn} (${ids.length} veces) -> IDs: ${ids.join(', ')}`);
            duplicatesFound++;
        }
    });

    console.log(`\n📊 Total de Números de Parte únicos: ${pnMap.size}`);
    console.log(`📊 Total de Documentos: ${snap.size}`);
    console.log(`📊 Grupos de Duplicados encontrados: ${duplicatesFound}`);

    process.exit(0);
}

checkDuplicates();
