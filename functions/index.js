const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { stringify } = require("csv-stringify/sync");
const { google } = require("googleapis");
const nodemailer = require("nodemailer");
const path = require("path");

admin.initializeApp();
const db = admin.firestore();

const CONFIG = {
    SENDER_EMAIL: "cfm.mx.compliance@gmail.com",
    RECIPIENTS: ["cfm.mx.compliance@gmail.com"],
    DRIVE_FOLDER_NAME: "Logimaster Daily Reports",
    EMAIL_SUBJECT: "📊 Reporte Diario Logimaster - Master Data"
};

const CSV_ORDER_KEYS = [
    'PART_NUMBER', 'REGIMEN', 'TypeMaterial', 'DESCRIPTION_EN', 'DESCRIPCION_ES',
    'UMC', 'UMT', 'HTSMX', 'HTSMXBASE', 'HTSMXNICO', 'IGI_DUTY', 'PROSEC', 'R8',
    'DESCRIPCION_R8', 'RRYNA_NON_DUTY_REQUIREMENTS', 'REMARKS', 'NETWEIGHT',
    'IMPORTED_OR_NOT', 'SENSIBLE', 'HTS_SerialNo', 'CLAVESAT', 'DESCRIPCION_CN',
    'MATERIAL_CN', 'MATERIAL_EN', 'FUNCTION_CN', 'FUNCTION_EN', 'COMPANY', 'ESTIMATED'
];

/**
 * CORE REPORT LOGIC
 */
async function runFullReportProcess() {
    let diagnostics = {
        database: "Pending",
        csv: "Pending",
        drive: "Pending",
        email: "Pending",
        changesFound: 0
    };

    try {
        // 1. DATABASE FETCH (Filter for UNREPORTED changes only)
        console.log("Fetching pending daily changes...");
        const changesSnap = await db.collection("daily_changes")
            .where("reported", "!=", true)
            .get();

        const changedIds = changesSnap.docs.map(doc => doc.id);

        const changedParts = changesSnap.docs
            .map(doc => doc.data().partNumber || doc.data().PART_NUMBER)
            .filter(pn => !!pn);

        console.log("Fetching full master data...");
        const partsSnap = await db.collection("parts").get();
        const allParts = partsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const dailyChanges = allParts.filter(p =>
            changedParts.includes(p.PART_NUMBER) ||
            changedParts.includes(p.id) ||
            changedIds.includes(p.id)
        );

        diagnostics.changesFound = dailyChanges.length;
        diagnostics.database = `OK (${allParts.length} parts total)`;

        // 2. CSV GENERATION
        const dateStr = new Date().toISOString().split('T')[0];

        const formatForCsv = (data) => {
            return data.map(item => {
                const row = {};
                CSV_ORDER_KEYS.forEach(key => {
                    row[key] = item[key] !== undefined ? item[key] : '';
                });
                return row;
            });
        };

        const fullCsv = stringify(formatForCsv(allParts), { header: true, columns: CSV_ORDER_KEYS });
        const changesCsv = stringify(formatForCsv(dailyChanges), { header: true, columns: CSV_ORDER_KEYS });
        diagnostics.csv = "OK";

        // 3. DRIVE BACKUP (REMOVED: Limitation on personal Google accounts)
        diagnostics.drive = "Entregado vía Email (Adjunto)";

        // 4. EMAIL DELIVERY (PRIORITY)
        try {
            const settingsSnap = await db.collection("audit_subscriptions").doc("daily_audit").get();
            let recipients = CONFIG.RECIPIENTS;
            if (settingsSnap.exists && settingsSnap.data().emails?.length > 0) {
                recipients = settingsSnap.data().emails;
            }

            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: CONFIG.SENDER_EMAIL,
                    pass: "cwotuqypfzygmnrh" // App Password
                }
            });

            const mailOptions = {
                from: `"Logimaster Compliance" <${CONFIG.SENDER_EMAIL}>`,
                to: CONFIG.SENDER_EMAIL,
                bcc: recipients.join(", "),
                subject: `${CONFIG.EMAIL_SUBJECT} (${dateStr})`,
                text: `Reporte automatizado de Master Data.\n\nResumen:\n- Partes en sistema: ${allParts.length}\n- Cambios detectados hoy: ${dailyChanges.length}\n- Nota: Los respaldos CSV están adjuntos a este correo.\n\nEste correo fue generado y enviado automáticamente por el servidor.`,
                attachments: [
                    { filename: `MasterData_Full_${dateStr}.csv`, content: fullCsv },
                    { filename: `MasterData_Changes_${dateStr}.csv`, content: changesCsv }
                ]
            };

            await transporter.sendMail(mailOptions);
            diagnostics.email = `OK (Sent to ${recipients.length} addresses)`;
        } catch (emailErr) {
            console.error("EMAIL_DELIVERY_FAILED:", emailErr.message);
            diagnostics.email = `Error: ${emailErr.message}`;
            throw emailErr;
        }

        // 5. UPDATE DAILY CHANGES (Flag as reported instead of deleting)
        if (changedIds.length > 0) {
            const batch = db.batch();
            const reportTime = new Date().toISOString();
            changesSnap.docs.forEach(doc => {
                batch.update(doc.ref, {
                    reported: true,
                    reportedAt: reportTime
                });
            });
            await batch.commit();
        }

        return { success: true, diagnostics };

    } catch (err) {
        console.error("PROCESS_CRITICAL_FAILURE:", err.message);
        return {
            success: false,
            error: err.message,
            diagnostics
        };
    }
}

/**
 * Cloud Functions Configuration
 */
exports.dailyMasterDataReport = onSchedule({
    schedule: "0 1 * * *", timeZone: "America/Mexico_City", memory: "512MiB"
}, async (event) => {
    return await runFullReportProcess();
});

exports.triggerManualReport = onCall({
    memory: "512MiB"
}, async (request) => {
    const result = await runFullReportProcess();
    return result;
});
