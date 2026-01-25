const admin = require("firebase-admin");
const { stringify } = require("csv-stringify/sync");
const nodemailer = require("nodemailer");

// 1. Config
const serviceAccount = require("./service-account.json");
const CONFIG = {
    SENDER_EMAIL: "cfm.mx.compliance@gmail.com",
    PASS: "cwotuqypfzygmnrh",
    RECIPIENTS: ["cfm.mx.compliance@gmail.com"],
    SUBJECT: "🧪 PRUEBA TÉCNICA - Reporte Logimaster"
};

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

async function sendTest() {
    console.log("📨 Iniciando envío de correo de prueba...");

    try {
        // Fetch historical data for Jan 24 to prove logic
        const targetDate = '2026-01-24';
        const partsSnap = await db.collection("parts").get();
        const allParts = partsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const filtered = allParts.filter(p => p.UPDATE_TIME && p.UPDATE_TIME.startsWith(targetDate));
        console.log(`📊 Piezas detectadas para adjuntar: ${filtered.length}`);

        const formatForCsv = (data) => data.map(item => {
            const row = {};
            CSV_ORDER_KEYS.forEach(key => row[key] = item[key] !== undefined ? item[key] : '');
            return row;
        });

        const fullCsv = stringify(formatForCsv(allParts.slice(0, 100)), { header: true, columns: CSV_ORDER_KEYS }); // Sample large file
        const changesCsv = stringify(formatForCsv(filtered), { header: true, columns: CSV_ORDER_KEYS });

        // Transport
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: CONFIG.SENDER_EMAIL, pass: CONFIG.PASS }
        });

        const mailOptions = {
            from: `"Logimaster Test" <${CONFIG.SENDER_EMAIL}>`,
            to: CONFIG.RECIPIENTS.join(", "),
            subject: `${CONFIG.SUBJECT} (${targetDate})`,
            text: `Hola,\n\nEsta es una prueba técnica del motor de reportes.\n\nItems detectados: ${filtered.length}\n\nSe adjunta el reporte del día 24 generado con la nueva lógica.\n\nSaludos.`,
            attachments: [
                { filename: `Logimaster_Full_SAMPLE.csv`, content: fullCsv },
                { filename: `Logimaster_Changes_REPARADOS.csv`, content: changesCsv }
            ]
        };

        await transporter.sendMail(mailOptions);
        console.log("✅ CORREO ENVIADO EXITOSAMENTE a " + CONFIG.RECIPIENTS.join(", "));
        process.exit(0);

    } catch (e) {
        console.error("❌ ERROR AL ENVIAR CORREO:", e.message);
        process.exit(1);
    }
}

sendTest();
