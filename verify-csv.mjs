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

const TARGET_DATE = '2026-01-24';

async function verify() {
    console.log(`🔎 Simulando generación de CSV para ${TARGET_DATE}...`);

    // 1. Fetch All (Mimic Browser Load)
    console.log("⬇️ Descargando inventario (puede tardar)...");
    const partsRef = collection(db, 'parts');
    const snap = await getDocs(partsRef);
    const allParts = [];
    snap.forEach(d => allParts.push(d.data()));
    console.log(`📊 Inventario Total: ${allParts.length}`);

    // 2. Filter Logic (Strict Date Match)
    const filtered = allParts.filter(p => p.UPDATE_TIME && p.UPDATE_TIME.startsWith(TARGET_DATE));

    console.log(`✅ Items Filtrados (CSV Output): ${filtered.length}`);

    if (filtered.length === 0) {
        console.error("❌ ERROR: El CSV saldría vacío.");
        process.exit(1);
    }

    // 3. Check Content Quality
    const sample = filtered[0];
    const columns = Object.keys(sample);
    console.log("\n--- Muestra del CSV ---");
    console.log(`PART_NUMBER: ${sample.PART_NUMBER}`);
    console.log(`UPDATE_TIME: ${sample.UPDATE_TIME}`);
    console.log(`DESCRIPTION_EN: ${sample.DESCRIPTION_EN || '(VACIO)'}`);
    console.log(`Campos totales: ${columns.length}`);

    if (!sample.PART_NUMBER) console.error("⚠️ ALERTA: PART_NUMBER está vacío en la muestra.");

    console.log("\nCONCLUSIÓN: La lógica de fecha funciona.");
    process.exit(0);
}

verify();
