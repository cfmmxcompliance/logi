const admin = require("firebase-admin");
const { stringify } = require("csv-stringify/sync");
const path = require("path");

// 1. Init with Service Account for Local Access
const serviceAccount = require("./service-account.json");
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const CSV_ORDER_KEYS = [
    'PART_NUMBER', 'REGIMEN', 'TypeMaterial', 'DESCRIPTION_EN', 'DESCRIPCION_ES',
    'UMC', 'UMT', 'HTSMX', 'HTSMXBASE', 'HTSMXNICO', 'IGI_DUTY', 'PROSEC', 'R8',
    'DESCRIPCION_R8', 'RRYNA_NON_DUTY_REQUIREMENTS', 'REMARKS', 'NETWEIGHT',
    'IMPORTED_OR_NOT', 'SENSIBLE', 'HTS_SerialNo', 'CLAVESAT', 'DESCRIPCION_CN',
    'MATERIAL_CN', 'MATERIAL_EN', 'FUNCTION_CN', 'FUNCTION_EN', 'COMPANY', 'ESTIMATED', 'UPDATE_TIME'
];

async function dryRunReport(targetDate = '2026-01-24') {
    console.log(`🚀 INICIANDO PRUEBA LOCAL DE REPORTE (Simulando día ${targetDate})...`);

    try {
        // 1. Simular lectura de Logs (como lo haría la Cloud Function)
        const changesSnap = await db.collection("daily_changes").get();

        // Identificar IDs y fechas de los logs que coinciden con nuestro target
        const reportDates = new Set();
        const changedParts = [];
        const changedIds = [];

        changesSnap.docs.forEach(doc => {
            const data = doc.data();
            const dateId = (doc.id.length === 10) ? doc.id : (data.timestamp || '').split('T')[0];

            if (dateId === targetDate) {
                changedIds.push(doc.id);
                if (Array.isArray(data.partNumbers)) {
                    changedParts.push(...data.partNumbers);
                } else if (data.partNumber || data.PART_NUMBER) {
                    changedParts.push(data.partNumber || data.PART_NUMBER);
                }
                reportDates.add(dateId);
            }
        });

        console.log(`✅ Logs del sistema analizados para ${targetDate}.`);
        console.log(`   - Eventos de Log: ${changedIds.length}`);
        console.log(`   - Referencias de piezas: ${changedParts.length}`);

        // 2. Fetch Master Data
        console.log("⬇️ Descargando Master Data para comparativa...");
        const partsSnap = await db.collection("parts").get();
        const allParts = partsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // 3. APPLY NEW FILTER LOGIC (The one I put in index.js)
        const changedPartsSet = new Set(changedParts);
        const filteredParts = allParts.filter(p => {
            const pKey = p.PART_NUMBER || p.partNumber || p.id;
            const pDate = p.UPDATE_TIME ? p.UPDATE_TIME.split('T')[0] : null;

            // LOGICA MEJORADA: Coincidencia por ID o Coincidencia por Fecha Directa
            return changedPartsSet.has(pKey) ||
                changedIds.includes(p.id) ||
                (pDate && reportDates.has(pDate));
        });

        console.log(`\n📊 RESULTADO DEL FILTRO (Lo que iría en el CSV):`);
        console.log(`   - Piezas detectadas: ${filteredParts.length}`);

        if (filteredParts.length > 0) {
            const sample = filteredParts[0];
            console.log(`\n🧪 Muestra de datos:`);
            console.log(`   - PART_NUMBER: ${sample.PART_NUMBER}`);
            console.log(`   - UPDATE_TIME: ${sample.UPDATE_TIME || 'MISSING!'}`);

            // Test CSV CSV Header existence
            const csvCheck = stringify([sample], { header: true, columns: CSV_ORDER_KEYS });
            if (csvCheck.includes("UPDATE_TIME")) {
                console.log(`✅ Columna UPDATE_TIME verificada en el generador CSV.`);
            } else {
                console.error(`❌ ERROR: La columna UPDATE_TIME NO está en el generador CSV.`);
            }
        }

        console.log(`\n🏁 PRUEBA FINALIZADA CON ÉXITO.`);
        process.exit(0);

    } catch (e) {
        console.error("❌ FALLO CRITICO EN LA PRUEBA:", e);
        process.exit(1);
    }
}

dryRunReport();
