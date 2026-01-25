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

const CSV_ORDER_KEYS = [
    'PART_NUMBER', 'REGIMEN', 'TypeMaterial', 'DESCRIPTION_EN', 'DESCRIPCION_ES',
    'UMC', 'UMT', 'HTSMX', 'HTSMXBASE', 'HTSMXNICO', 'IGI_DUTY', 'PROSEC', 'R8',
    'DESCRIPCION_R8', 'RRYNA_NON_DUTY_REQUIREMENTS', 'REMARKS', 'NETWEIGHT',
    'IMPORTED_OR_NOT', 'SENSIBLE', 'HTS_SerialNo', 'CLAVESAT', 'DESCRIPCION_CN',
    'MATERIAL_CN', 'MATERIAL_EN', 'FUNCTION_CN', 'FUNCTION_EN', 'COMPANY', 'ESTIMATED', 'UPDATE_TIME'
];

async function verifyCloudLogic(targetDate = '2026-01-24') {
    console.log(`🔎 VALIDANDO LOGICA DE NUBE (Filtro por Fecha: ${targetDate})...`);

    try {
        // 1. Simular lectura de logs
        const changesSnap = await getDocs(collection(db, "daily_changes"));
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

        console.log(`✅ Logs identificados: ${changedIds.length}`);

        // 2. Fetch Master Data
        console.log("⬇️ Descargando Master Data...");
        const partsSnap = await getDocs(collection(db, "parts"));
        const allParts = partsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // 3. APPLY THE NEW INDEX.JS LOGIC
        const changedPartsSet = new Set(changedParts);
        const dailyChanges = allParts.filter(p => {
            const pKey = p.PART_NUMBER || p.partNumber || p.id;
            const pDate = p.UPDATE_TIME ? p.UPDATE_TIME.split('T')[0] : null;

            // Replicamos la logica de index.js linea 74 (aprox)
            return changedPartsSet.has(pKey) ||
                changedIds.includes(p.id) ||
                (pDate && reportDates.has(pDate));
        });

        console.log(`\n📊 RESULTADO ESTIMADO DEL CORREO:`);
        console.log(`   - Piezas que se adjuntarán: ${dailyChanges.length}`);

        if (dailyChanges.length === 866) {
            console.log(`🚀 PERFECTO: La lógica capturó exactamente las 866 piezas reparadas.`);
        } else {
            console.warn(`⚠️ ATENCIÓN: Capturó ${dailyChanges.length} piezas. (Esperábamos 866).`);
        }

        const sample = dailyChanges[0];
        console.log(`\n📌 Muestra de lo que saldría en el correo:`);
        console.log(`   - PN: ${sample.PART_NUMBER}`);
        console.log(`   - Hora: ${sample.UPDATE_TIME}`);

        process.exit(0);

    } catch (e) {
        console.error("❌ Error en la prueba:", e.message);
        process.exit(1);
    }
}

verifyCloudLogic();
