import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, writeBatch, doc } from 'firebase/firestore';

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

async function repairCustoms() {
    console.log("🛠️ INICIANDO REPARACIÓN DE ADUANAS (Target: 7 Registros)...");

    // 1. Fetch Data
    const [customsSnap, vesselSnap, shipmentsSnap] = await Promise.all([
        getDocs(collection(db, 'customs_clearance')),
        getDocs(collection(db, 'vessel_tracking')),
        getDocs(collection(db, 'shipments'))
    ]);

    const allCustoms = customsSnap.docs.map(d => ({ ...d.data(), id: d.id }));

    // Filter Target Records: 'Multiple' AND NOT 'DataStage'
    const targetRecords = allCustoms.filter(c =>
        (c.containerNo || '').trim().toLowerCase() === 'multiple' &&
        (c.proformaRevisionBy || '') !== 'DataStage'
    );

    console.log(`🎯 Registros Objetivo: ${targetRecords.length}`);

    // Build Indexes
    const vesselIndex = new Map();
    vesselSnap.docs.forEach(d => {
        const data = d.data();
        const bl = (data.blNo || '').trim();
        if (bl && data.containerNo && data.containerNo !== 'Multiple') {
            if (!vesselIndex.has(bl)) vesselIndex.set(bl, new Set());
            vesselIndex.get(bl).add(data.containerNo);
        }
    });

    const shipmentIndex = new Map();
    shipmentsSnap.docs.forEach(d => {
        const data = d.data();
        const bl = (data.blNo || '').trim();
        if (bl && Array.isArray(data.containers)) {
            if (!shipmentIndex.has(bl)) shipmentIndex.set(bl, new Set());
            data.containers.forEach(c => shipmentIndex.get(bl).add(c));
        }
    });

    // 2. Prepare Batch
    const batch = writeBatch(db);
    let repairCount = 0;
    let newItemsCount = 0;

    targetRecords.forEach(record => {
        const bl = (record.blNo || '').trim();
        if (!bl) return;

        const recovered = new Set();
        const vC = vesselIndex.get(bl);
        const sC = shipmentIndex.get(bl);
        if (vC) vC.forEach(c => recovered.add(c));
        if (sC) sC.forEach(c => recovered.add(c));

        if (recovered.size > 0) {
            console.log(`✅ Reparando BL: ${bl} -> Creando ${recovered.size} hijos.`);

            // Create New Items
            recovered.forEach(containerNo => {
                const safeContainer = containerNo.replace(/\//g, '-');
                const newId = `${bl}-${safeContainer}-${record.clavePedimento || 'A1'}`;
                const newRef = doc(db, 'customs_clearance', newId);
                batch.set(newRef, {
                    ...record,
                    id: newId,
                    containerNo: containerNo, // Keep original slash in data
                    updatedAt: new Date().toISOString()
                });
                newItemsCount++;
            });

            // Delete Original "Multiple"
            const oldRef = doc(db, 'customs_clearance', record.id);
            batch.delete(oldRef);
            repairCount++;
        } else {
            console.log(`⚠️ BL: ${bl} -> No se encontró tracking. Se omite.`);
        }
    });

    if (repairCount > 0) {
        await batch.commit();
        console.log(`\n🚀 ÉXITO: Se repararon ${repairCount} registros padres.`);
        console.log(`✨ Se crearon ${newItemsCount} nuevos registros individuales.`);
    } else {
        console.log("\n⚠️ No se encontraron registros reparables en este momento.");
    }

    process.exit(0);
}

repairCustoms();
