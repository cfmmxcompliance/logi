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

async function backfillBL() {
    console.log("🛠️ INICIANDO BACKFILL DE BL (Modo Seguro - Solo Datos)...");

    // 1. Fetch Tracking Data (Source of Truth)
    console.log("⬇️ Descargando Tracking...");
    const trackingSnap = await getDocs(collection(db, 'vessel_tracking'));
    const containerToBL = new Map();

    trackingSnap.forEach(d => {
        const data = d.data();
        const container = (data.containerNo || '').trim().toUpperCase();
        const bl = (data.blNo || '').trim();
        // Map Container -> BL
        if (container && bl) {
            containerToBL.set(container, bl);
        }
    });
    console.log(`✅ Mapa creado: ${containerToBL.size} Contenedores vinculados a BLs.`);

    // 2. Fetch Invoices to Update
    console.log("⬇️ Descargando Facturas Comerciales...");

    // Debugging: Log first 5 entries from map
    let i = 0;
    for (const [key, value] of containerToBL) {
        if (i < 5) console.log(`🔍 MAP Sample: "${key}" -> "${value}"`);
        i++;
    }

    const invoicesSnap = await getDocs(collection(db, 'commercial_invoices'));
    console.log(`📊 Total de Items en Facturas: ${invoicesSnap.size}`);

    // Debugging: Log first 5 entries from invoices
    i = 0;

    // 3. Prepare Updates
    let batch = writeBatch(db);
    let updateCount = 0;
    let batchSize = 0;
    const TOTAL_BATCH_LIMIT = 450;

    for (const d of invoicesSnap.docs) {
        const item = d.data();
        // Use Container Number from Invoice Item
        const container = (item.containerNo || '').trim().toUpperCase();

        if (i < 5) {
            console.log(`🔍 INV Sample: Container "${container}" (Matches: ${containerToBL.has(container)})`);
            i++;
        }

        // If we have a match in tracking map
        if (containerToBL.has(container)) {
            const bl = containerToBL.get(container);

            // Log matches to confirm we are finding some
            console.log(`✅ MATCH: Invoice "${item.invoiceNo}" (Container "${container}") linked to BL "${bl}"`);

            // Optimization: Only update if missing or different
            if (item.bl !== bl) {
                const ref = doc(db, 'commercial_invoices', d.id);
                // Non-destructive update: Merge { bl: ... }
                batch.update(ref, { bl: bl });

                updateCount++;
                batchSize++;

                // Commit if batch full
                if (batchSize >= TOTAL_BATCH_LIMIT) {
                    console.log(`💾 Guardando lote de ${batchSize}...`);
                    await batch.commit();
                    batch = writeBatch(db);
                    batchSize = 0;
                }
            }
        }
    }

    // Final Commit
    if (batchSize > 0) {
        console.log(`💾 Guardando lote final de ${batchSize}...`);
        await batch.commit();
    }

    console.log(`\n🚀 PROCESO COMPLETADO.`);
    console.log(`✨ Total de Ítems Actualizados con BL: ${updateCount}`);

    process.exit(0);
}

backfillBL();
