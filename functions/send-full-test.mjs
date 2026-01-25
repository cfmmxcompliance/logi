import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { stringify } from 'csv-stringify/sync';
import nodemailer from 'nodemailer';

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

const CONFIG = {
    SENDER_EMAIL: "cfm.mx.compliance@gmail.com",
    PASS: "cwotuqypfzygmnrh",
    RECIPIENTS: ["jorge_melendez@outlook.com"], // UPDATED TO PRODUCTION RECIPIENT
};

const CSV_ORDER_KEYS = [
    'PART_NUMBER', 'REGIMEN', 'TypeMaterial', 'DESCRIPTION_EN', 'DESCRIPCION_ES',
    'UMC', 'UMT', 'HTSMX', 'HTSMXBASE', 'HTSMXNICO', 'IGI_DUTY', 'PROSEC', 'R8',
    'DESCRIPCION_R8', 'RRYNA_NON_DUTY_REQUIREMENTS', 'REMARKS', 'NETWEIGHT',
    'IMPORTED_OR_NOT', 'SENSIBLE', 'HTS_SerialNo', 'CLAVESAT', 'DESCRIPCION_CN',
    'MATERIAL_CN', 'MATERIAL_EN', 'FUNCTION_CN', 'FUNCTION_EN', 'COMPANY', 'ESTIMATED', 'UPDATE_TIME'
];

async function sendRealReportTest(targetDate = '2026-01-24') {
    console.log(`📡 Iniciando simulacro de reporte de las 1:00 AM para: ${CONFIG.RECIPIENTS.join(", ")}`);

    try {
        console.log("⬇️  Extrayendo datos de inventario...");
        const partsSnap = await getDocs(collection(db, "parts"));
        const allParts = partsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const dailyChanges = allParts.filter(p => p.UPDATE_TIME && p.UPDATE_TIME.startsWith(targetDate));
        console.log(`✅  ${dailyChanges.length} piezas encontradas.`);

        const formatForCsv = (data) => data.map(item => {
            const row = {};
            CSV_ORDER_KEYS.forEach(key => row[key] = item[key] !== undefined ? item[key] : '');
            return row;
        });

        console.log("📝  Generando archivos CSV (Completo - 6253+ items)...");
        const fullCsv = stringify(formatForCsv(allParts), { header: true, columns: CSV_ORDER_KEYS });
        const changesCsv = stringify(formatForCsv(dailyChanges), { header: true, columns: CSV_ORDER_KEYS });

        // Transport
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: CONFIG.SENDER_EMAIL, pass: CONFIG.PASS }
        });

        const mailOptions = {
            from: `"Logimaster Compliance" <${CONFIG.SENDER_EMAIL}>`,
            to: CONFIG.RECIPIENTS.join(", "),
            subject: `📊 REPORTE DIARIO MASTER DATA - 1:00 AM (${targetDate})`,
            text: `Este es el reporte automático de las 1:00 AM correspondiente a la actividad del día ${targetDate}.\n\nResumen:\n- Partes en sistema: ${allParts.length}\n- Cambios detectados: ${dailyChanges.length}\n\nLos archivos adjuntos incluyen la columna UPDATE_TIME y todos los registros corregidos.`,
            attachments: [
                { filename: `MasterData_Full_${targetDate}.csv`, content: fullCsv },
                { filename: `MasterData_Changes_${targetDate}.csv`, content: changesCsv }
            ]
        };

        console.log("📨  Enviando reporte con adjuntos...");
        await transporter.sendMail(mailOptions);
        console.log(`\n📧  ¡EXITO! Reporte enviado correctamente.`);
        process.exit(0);

    } catch (e) {
        console.error("\n❌ ERROR:", e.message);
        process.exit(1);
    }
}

sendRealReportTest();
