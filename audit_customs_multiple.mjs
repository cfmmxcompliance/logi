import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

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

async function auditCustoms() {
    console.log("🔍 AUDITANDO REGISTROS DE ADUANAS CON 'MULTIPLE'...");

    // 1. Fetch Customs
    console.log("⬇️ Descargando Customs Clearance...");
    const customsSnap = await getDocs(collection(db, 'customs_clearance'));
    const allCustoms = customsSnap.docs.map(d => ({ ...d.data(), id: d.id }));
    const multipleRecords = allCustoms.filter(c => (c.containerNo || '').trim() === 'Multiple');

    console.log(`📊 Total de registros en Customs: ${allCustoms.length}`);
    console.log(`⚠️ Registros con 'Multiple': ${multipleRecords.length}`);

    if (multipleRecords.length === 0) {
        console.log("✅ No se requiere reparación.");
        process.exit(0);
    }

    // 2. Fetch Potential Sources (Vessel Tracking & Shipments)
    console.log("⬇️ Descargando Tracking y Shipments para cruce de datos...");
    const vesselSnap = await getDocs(collection(db, 'vessel_tracking'));
    const allVessel = vesselSnap.docs.map(d => d.data());

    // Index Vessel Tracking by BL
    const vesselByBL = new Map();
    allVessel.forEach(v => {
        const bl = (v.blNo || '').trim();
        if (bl) {
            if (!vesselByBL.has(bl)) vesselByBL.set(bl, new Set());
            if (v.containerNo && v.containerNo !== 'Multiple') {
                vesselByBL.get(bl).add(v.containerNo);
            }
        }
    });

    // 3. Simulate Repair
    let recoverable = 0;
    let unrecoverable = 0;
    let newRecordsCount = 0;

    console.log("\n🧪 SIMULACIÓN DE REPARACIÓN:");
    console.log("---------------------------------------------------");

    const sampleSize = 10;
    let shown = 0;

    for (const record of multipleRecords) {
        const bl = (record.blNo || '').trim();
        const containers = vesselByBL.get(bl);

        let status = '';
        let count = 0;

        if (containers && containers.size > 0) {
            recoverable++;
            count = containers.size;
            newRecordsCount += count;
            status = `✅ RECUPERABLE (${count} Contenedores: ${Array.from(containers).join(', ')})`;
        } else {
            unrecoverable++;
            status = `❌ NO ENCONTRADO (Se marcará como 'Bulk/LCL' o requiere revisión manual)`;
        }

        if (shown < sampleSize) {
            console.log(`BL: ${bl.padEnd(20)} | ${status}`);
            shown++;
        }
    }

    if (multipleRecords.length > sampleSize) {
        console.log(`... y ${multipleRecords.length - sampleSize} más.`);
    }

    console.log("\n📈 RESUMEN DEL ESCENARIO:");
    console.log(`- Registros 'Multiple' (Actuales): ${multipleRecords.length}`);
    console.log(`- Registros 'Hijos' que se crearán: ${newRecordsCount}`);
    console.log(`- BLs con información completa en Tracking: ${recoverable}`);
    console.log(`- BLs sin información en Tracking (Riesgo): ${unrecoverable}`);

    process.exit(0);
}

auditCustoms();
