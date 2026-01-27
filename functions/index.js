const functions = require("firebase-functions");
const MX_TIMEZONE = 'America/Mexico_City';
const admin = require("firebase-admin");
const { stringify } = require("csv-stringify/sync");
const { google } = require("googleapis");
const nodemailer = require("nodemailer");
const path = require("path");
require("dotenv").config(); // Load environment variables

admin.initializeApp();
const db = admin.firestore();

function getMXDate(isoString) {
    if (!isoString) return null;
    try {
        return new Date(isoString).toLocaleDateString('en-CA', { timeZone: MX_TIMEZONE });
    } catch (e) {
        return null;
    }
}

const CONFIG = {
    SENDER_EMAIL: "cfm.mx.compliance@gmail.com",
    RECIPIENTS: ["cfm.mx.compliance@gmail.com"],
    DRIVE_FOLDER_NAME: "Logimaster Daily Reports",
    EXPEDIENTE_FOLDER_ID: "1C0ZqlwV0KMKoD2TziEoXeu_X5E_0UXZw",
    EMAIL_SUBJECT: "📊 Reporte Diario Logimaster - Master Data"
};

/**
 * GOOGLE DRIVE CLIENT SETUP
 */
function getDriveClient() {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        "http://localhost:3000"
    );

    oauth2Client.setCredentials({
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN
    });

    return google.drive({ version: "v3", auth: oauth2Client });
}


const CSV_ORDER_KEYS = [
    'PART_NUMBER', 'REGIMEN', 'TypeMaterial', 'DESCRIPTION_EN', 'DESCRIPCION_ES',
    'UMC', 'UMT', 'HTSMX', 'HTSMXBASE', 'HTSMXNICO', 'IGI_DUTY', 'PROSEC', 'R8',
    'DESCRIPCION_R8', 'RRYNA_NON_DUTY_REQUIREMENTS', 'REMARKS', 'NETWEIGHT',
    'IMPORTED_OR_NOT', 'SENSIBLE', 'HTS_SerialNo', 'CLAVESAT', 'DESCRIPCION_CN',
    'MATERIAL_CN', 'MATERIAL_EN', 'FUNCTION_CN', 'FUNCTION_EN', 'COMPANY', 'ESTIMATED', 'UPDATE_TIME'
];

/**
 * CORE REPORT LOGIC
 */
async function runFullReportProcess(targetDateString = null) {
    let diagnostics = {
        database: "Pending",
        csv: "Pending",
        drive: "Pending",
        email: "Pending",
        changesFound: 0,
        reportDate: ""
    };

    try {
        // 1. Determine Target Date (Yesterday by default)
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        const dateStr = targetDateString || yesterday.toLocaleDateString('en-CA', { timeZone: MX_TIMEZONE });
        diagnostics.reportDate = dateStr;

        console.log(`Generating report for date: ${dateStr}`);

        // 2. Fetch changes ONLY for that specific date
        // We look for docs where timestamp starts with the date OR the ID is the date
        const changesSnap = await db.collection("daily_changes")
            .get();

        const changesDocs = changesSnap.docs.filter(doc => {
            const data = doc.data();
            // If ID is YYYY-MM-DD (length 10), use it directly as it's already MX-Local from frontend
            // Otherwise, convert the UTC timestamp to MX date
            const docDate = (doc.id.length === 10) ? doc.id : getMXDate(data.timestamp);
            return docDate === dateStr;
        });

        const changedIds = changesDocs.map(doc => doc.id);
        const changedParts = changesDocs
            .flatMap(doc => {
                const data = doc.data();
                if (Array.isArray(data.partNumbers)) return data.partNumbers;
                return [data.partNumber || data.PART_NUMBER];
            })
            .filter(pn => !!pn);

        console.log("Fetching full master data...");
        const partsSnap = await db.collection("parts").get();
        const allParts = partsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const changedPartsSet = new Set(changedParts);
        const dailyChanges = allParts.filter(p => {
            const pKey = p.PART_NUMBER || p.partNumber || p.id;
            // Crucial fix: convert UTC UPDATE_TIME to MX date before comparison
            const pDate = getMXDate(p.UPDATE_TIME);

            return changedPartsSet.has(pKey) || (pDate === dateStr);
        });

        diagnostics.changesFound = dailyChanges.length;
        diagnostics.database = `OK (${allParts.length} parts total)`;

        const reportDateStr = dateStr;

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
        diagnostics.drive = "Entregado vía Email (Adjunto)";

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
                    pass: process.env.EMAIL_PASSWORD
                }
            });

            const mailOptions = {
                from: `"Logimaster Compliance" <${CONFIG.SENDER_EMAIL}>`,
                to: CONFIG.SENDER_EMAIL,
                bcc: recipients.join(", "),
                subject: `${CONFIG.EMAIL_SUBJECT} (${reportDateStr})`,
                text: `Reporte automatizado de Master Data.\n\nResumen:\n- Partes en sistema: ${allParts.length}\n- Cambios detectados hoy: ${dailyChanges.length}\n- Nota: Los respaldos CSV están adjuntos a este correo.\n\nEste correo fue generado y enviado automáticamente por el servidor.`,
                attachments: [
                    { filename: `MasterData_Full_${reportDateStr}.csv`, content: fullCsv },
                    { filename: `MasterData_Changes_${reportDateStr}.csv`, content: changesCsv }
                ]
            };

            await transporter.sendMail(mailOptions);
            diagnostics.email = `OK (Sent to ${recipients.length} addresses)`;

            // 3. Save official completion record for this DATE (Used by UI to show status)
            await db.collection("daily_reports").doc(reportDateStr).set({
                id: reportDateStr,
                timestamp: new Date().toISOString(),
                changesCount: dailyChanges.length,
                totalParts: allParts.length,
                status: 'COMPLETED',
                recipients: recipients
            });

        } catch (emailErr) {
            console.error("EMAIL_DELIVERY_FAILED:", emailErr.message);
            diagnostics.email = `Error: ${emailErr.message}`;
            throw emailErr;
        }

        // Keep this for legacy / technical log visibility, though report logic now uses Date
        if (changedIds.length > 0) {
            const batch = db.batch();
            const reportTime = new Date().toISOString();
            changesDocs.forEach(doc => {
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
 * DRIVE HELPER: Ensure pedimento folder exists
 */
async function getOrCreatePedimentoFolder(drive, parentId, pedimentoNo) {
    const query = `'${parentId}' in parents and name = '${pedimentoNo}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const response = await drive.files.list({ q: query, fields: 'files(id, name)' });

    if (response.data.files.length > 0) {
        return response.data.files[0].id;
    }

    const folderMetadata = {
        name: pedimentoNo,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId]
    };

    const folder = await drive.files.create({
        resource: folderMetadata,
        fields: 'id'
    });

    return folder.data.id;
}

/**
 * CLOUD FUNCTION: Save VUCEM Document to Drive (v1)
 */
exports.saveFileToExpediente = functions.https.onCall(async (data, context) => {
    const { pedimentoNo, fileName, fileBase64, mimeType } = data;

    if (!pedimentoNo || !fileName || !fileBase64) {
        throw new functions.https.HttpsError("invalid-argument", "Missing required fields.");
    }

    try {
        const drive = getDriveClient();
        const pedimentoFolderId = await getOrCreatePedimentoFolder(drive, CONFIG.EXPEDIENTE_FOLDER_ID, pedimentoNo);

        const buffer = Buffer.from(fileBase64, 'base64');
        const fileMetadata = { name: fileName, parents: [pedimentoFolderId] };
        const media = {
            mimeType: mimeType || 'application/pdf',
            body: require('stream').Readable.from(buffer)
        };

        const file = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id, webViewLink'
        });

        const dossierRef = db.collection("electronic_dossiers").doc(pedimentoNo);
        const dossierDoc = await dossierRef.get();
        const fileInfo = {
            name: fileName,
            driveId: file.data.id,
            url: file.data.webViewLink,
            createdAt: new Date().toISOString()
        };

        if (dossierDoc.exists) {
            await dossierRef.update({
                items: admin.firestore.FieldValue.arrayUnion(fileInfo),
                lastUpdate: new Date().toISOString()
            });
        } else {
            await dossierRef.set({
                numPedimento: pedimentoNo,
                items: [fileInfo],
                createdAt: new Date().toISOString(),
                lastUpdate: new Date().toISOString()
            });
        }

        return { success: true, fileId: file.data.id, url: file.data.webViewLink };

    } catch (err) {
        console.error("DRIVE_UPLOAD_ERROR:", err);
        throw new functions.https.HttpsError("internal", err.message);
    }
});

/**
 * CLOUD FUNCTION: Get File from Drive as Base64 (v1)
 */
exports.getFileFromDrive = functions.https.onCall(async (data, context) => {
    const { fileId } = data;
    if (!fileId) throw new functions.https.HttpsError("invalid-argument", "Missing fileId.");

    try {
        const drive = getDriveClient();
        const response = await drive.files.get({
            fileId: fileId,
            alt: 'media'
        }, { responseType: 'stream' });

        return new Promise((resolve, reject) => {
            const chunks = [];
            response.data.on('data', (chunk) => chunks.push(chunk));
            response.data.on('end', () => {
                const buffer = Buffer.concat(chunks);
                const base64 = buffer.toString('base64');
                resolve({ success: true, fileBase64: base64 });
            });
            response.data.on('error', (err) => {
                reject(new functions.https.HttpsError("internal", `Stream Error: ${err.message}`));
            });
        });
    } catch (err) {
        console.error("DRIVE_DOWNLOAD_ERROR:", err.message);
        throw new functions.https.HttpsError("aborted", `Drive API Fail: ${err.message}`);
    }
});

/**
 * CLOUD FUNCTION: Manual Trigger for Report (v1)
 */
exports.triggerManualReport = functions.https.onCall(async (data, context) => {
    return await runFullReportProcess(data?.date);
});

/**
 * CLOUD FUNCTION: Scheduled Daily Report (1:00 AM Mexico City)
 * Uses v1 (legacy) to avoid EventArc/PubSub identity issues
 */
exports.dailyReportLogimaster = functions
    .pubsub.schedule("0 1 * * *")
    .timeZone(MX_TIMEZONE)
    .onRun(async (context) => {
        console.log("Running scheduled daily report...");
        return await runFullReportProcess();
    });
