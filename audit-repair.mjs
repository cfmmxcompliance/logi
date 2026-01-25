import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, doc, updateDoc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
    authDomain: "logimaster-cfmoto.firebaseapp.com",
    projectId: "logimaster-cfmoto",
    storageBucket: "logimaster-cfmoto.firebasestorage.app",
    messagingSenderId: "924452835722",
    appId: "1:924452835722:web:11a7eedec65ba034dc7873",
    measurementId: "G-01VXE7L5C3"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const TARGET_DATE = '2026-01-24';

async function repair() {
    console.log(`🛠️ INICIANDO REPARACIÓN EXTENDIDA para fecha: ${TARGET_DATE}`);

    // 1. Get Log
    const dailyRef = collection(db, 'daily_changes');
    const docSnap = await getDocs(query(dailyRef));

    // Filter manually
    const targetLogs = [];
    docSnap.forEach(d => {
        const data = d.data();
        const dateId = (d.id.length === 10) ? d.id : (data.timestamp || '').split('T')[0];
        if (dateId === TARGET_DATE) targetLogs.push({ id: d.id, ...data });
    });

    if (targetLogs.length === 0) {
        console.error("❌ No se encontró el Log de Cambios para esa fecha.");
        process.exit(1);
    }

    console.log(`✅ Logs Encontrados: ${targetLogs.length}`);

    // Build Map: PartKey -> Timestamp (To be precise)
    const partTimeMap = new Map();

    targetLogs.forEach(log => {
        const p = Array.isArray(log.partNumbers) ? log.partNumbers : (log.partNumber ? [log.partNumber] : []);
        p.forEach(k => {
            // If duplicate, keep the LATEST timestamp (or first? usually latest is better)
            partTimeMap.set(k, log.timestamp);
        });
    });

    console.log(`🎯 ${partTimeMap.size} piezas UNICAS identificadas en los logs.`);

    // 2. Scan and Patch Parts
    const partsRef = collection(db, 'parts');
    console.log("⬇️ Descargando inventario completo para cruce de datos...");
    const allPartsSnap = await getDocs(partsRef);
    const dbParts = [];
    allPartsSnap.forEach(d => dbParts.push({ id: d.id, ...d.data() }));
    console.log(`📊 Inventario cargado: ${dbParts.length} items.`);

    let fixedCount = 0;

    let missingItems = [];

    for (const [pKey, timestamp] of partTimeMap) {
        // MATCHING LOGIC
        const match = dbParts.find(p => p.PART_NUMBER === pKey || p.partNumber === pKey || p.id === pKey);

        if (match) {
            // PATCH
            const partRef = doc(db, 'parts', match.id);
            const updates = {
                UPDATE_TIME: timestamp || new Date().toISOString(),
                PART_NUMBER: pKey
            };

            try {
                await setDoc(partRef, updates, { merge: true });
                process.stdout.write(`.`);
                fixedCount++;
            } catch (e) {
                console.error(`\n❌ Error actualizando ${pKey}:`, e.message);
            }
        } else {
            missingItems.push(pKey);
        }
    }

    console.log(`\n\n✅ REPARACIÓN FINALIZADA.`);
    console.log(`Total procesados: ${partTimeMap.size}`);
    console.log(`Corregidos en BD: ${fixedCount}`);
    console.log(`❌ Faltantes (No encontrados en BD): ${missingItems.length}`);
    if (missingItems.length > 0) {
        console.log("---------------------------------------------------");
        console.log("🔍 LISTA DE FANTASMAS (Están en Log pero no en BD):");
        missingItems.forEach(m => console.log(`   🔸 "${m}"`));
        console.log("---------------------------------------------------");
        console.log("Posible causa: Fueron borrados, o hay un error de tipeo/espacios.");
    }
    process.exit(0);
}

repair();
