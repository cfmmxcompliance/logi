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

async function auditCustomsFiltered() {
    console.log("🔍 AUDITANDO ADUANAS CON 'MULTIPLE' (Filtrado por DataStage)...");

    // 1. Fetch Data
    console.log("⬇️ Descargando colecciones...");
    const [customsSnap, vesselSnap, shipmentsSnap] = await Promise.all([
        getDocs(collection(db, 'customs_clearance')),
        getDocs(collection(db, 'vessel_tracking')),
        getDocs(collection(db, 'shipments'))
    ]);

    const allCustoms = customsSnap.docs.map(d => ({ ...d.data(), id: d.id }));
    const multipleRecords = allCustoms.filter(c => (c.containerNo || '').trim().toLowerCase() === 'multiple');

    console.log(`📊 Total Customs: ${allCustoms.length}`);
    console.log(`⚠️ Total 'Multiple': ${multipleRecords.length}`);

    // FILTER OUT DATASTAGE
    const cleanRecords = multipleRecords.filter(c => (c.proformaRevisionBy || '') !== 'DataStage');
    const ignoredRecords = multipleRecords.length - cleanRecords.length;

    console.log(`🚫 Ignorados (DataStage): ${ignoredRecords}`);
    console.log(`✅ Registros a Analizar: ${cleanRecords.length}`);

    if (cleanRecords.length === 0) {
        console.log("No hay registros relevantes para analizar.");
        process.exit(0);
    }

    // 2. Build Indexes
    const vesselIndex = new Map();
    vesselSnap.docs.forEach(d => {
        const data = d.data();
        const bl = (data.blNo || '').trim();
        if (bl) {
            if (!vesselIndex.has(bl)) vesselIndex.set(bl, new Set());
            if (data.containerNo && data.containerNo !== 'Multiple') vesselIndex.get(bl).add(data.containerNo);
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

    // 3. Analyze Clean Records
    let noBL = 0;
    let withBL = 0;
    let totalRecoverableContainers = 0;
    let recoverableRecords = 0;

    console.log("\n🧪 ANÁLISIS DE REGISTROS RELEVANTES:");

    cleanRecords.forEach((record, idx) => {
        const bl = (record.blNo || '').trim();

        if (!bl) {
            noBL++;
            return;
        }

        withBL++;
        const vesselContainers = vesselIndex.get(bl);
        const shipmentContainers = shipmentIndex.get(bl);

        let recovered = new Set();
        if (vesselContainers) vesselContainers.forEach(c => recovered.add(c));
        if (shipmentContainers) shipmentContainers.forEach(c => recovered.add(c));

        if (recovered.size > 0) {
            totalRecoverableContainers += recovered.size;
            recoverableRecords++;
            if (idx < 5) console.log(`[${idx}] BL: ${bl} -> Recuperable: ${recovered.size} contenedores.`);
        } else {
            if (idx < 5) console.log(`[${idx}] BL: ${bl} -> ❌ No encontrado en Tracking`);
        }
    });

    console.log("\n📈 RESUMEN FINAL (Excluyendo DataStage):");
    console.log(`- Registros 'Multiple' Relevantes: ${cleanRecords.length}`);
    console.log(`- Sin BL (Irrecuperables): ${noBL}`);
    console.log(`- Con BL y Tracking (Recuperables): ${recoverableRecords}`);
    console.log(`- Con BL pero sin Tracking: ${withBL - recoverableRecords}`);
    console.log(`\n- Nuevos registros individuales a crear: ${totalRecoverableContainers}`);

    process.exit(0);
}

auditCustomsFiltered();
