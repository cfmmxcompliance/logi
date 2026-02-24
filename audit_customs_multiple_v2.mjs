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

async function auditCustomsExtended() {
    console.log("🔍 AUDITANDO REGISTROS DE ADUANAS CON 'MULTIPLE' (EXTENDIDO)...");

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
    console.log(`⚠️ Registros 'Multiple': ${multipleRecords.length}`);

    if (multipleRecords.length === 0) process.exit(0);

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

    // 3. Analyze
    let noBL = 0;
    let withBL = 0;
    let foundInVessel = 0;
    let foundInShipment = 0;
    let foundInBoth = 0;
    let notFoundAnywhere = 0;
    let totalRecoverableContainers = 0;

    console.log("\n🧪 ANÁLISIS DETALLADO:");

    multipleRecords.forEach((record, idx) => {
        const bl = (record.blNo || '').trim();

        if (!bl) {
            noBL++;
            if (idx < 5) console.log(`[${idx}] SIN BL: ID=${record.id}`);
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
            if (vesselContainers && shipmentContainers) foundInBoth++;
            else if (vesselContainers) foundInVessel++;
            else if (shipmentContainers) foundInShipment++;

            if (idx < 5) console.log(`[${idx}] BL: ${bl} -> Recuperable: ${recovered.size} contenedores (${Array.from(recovered).join(', ')})`);
        } else {
            notFoundAnywhere++;
            if (idx < 5) console.log(`[${idx}] BL: ${bl} -> ❌ No encontrado en Tracking/Shipments`);
        }
    });

    console.log("\n📈 RESUMEN DE RECUPERACIÓN:");
    console.log(`- Total 'Multiple': ${multipleRecords.length}`);
    console.log(`- Sin Número de BL: ${noBL} (Irrecuperables automáticamente)`);
    console.log(`- Con BL válido: ${withBL}`);
    console.log(`  - Encontrado en Vessel Tracking: ${foundInVessel}`);
    console.log(`  - Encontrado en Shipments: ${foundInShipment}`);
    console.log(`  - Encontrado en ambos: ${foundInBoth}`);
    console.log(`  - TOTAL RECUPERABLES: ${foundInVessel + foundInShipment + foundInBoth}`);
    console.log(`  - BL existe pero no hay tracking: ${notFoundAnywhere}`);
    console.log(`\n- Nuevos registros individuales estimados a crear: ${totalRecoverableContainers}`);

    process.exit(0);
}

auditCustomsExtended();
