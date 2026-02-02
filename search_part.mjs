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

async function searchPart(pn) {
    console.log(`🔎 Buscando PN: ${pn} (Fuzzy/Global)...`);
    const snap = await getDocs(collection(db, 'parts'));
    let found = false;
    snap.forEach(d => {
        const data = d.data();
        const docPN = (data.PART_NUMBER || '').toString().toUpperCase().trim();
        if (docPN.includes(pn.toUpperCase().trim())) {
            console.log(`✅ ENCONTRADO:`);
            console.log(`   ID: ${d.id} | PN: "${data.PART_NUMBER}" | Data:`, d.data());
            found = true;
        }
    });

    if (!found) {
        console.log("❌ NO ENCONTRADO EN TODO EL INVENTARIO.");
    }
    process.exit(0);
}

searchPart('8080-000002');
