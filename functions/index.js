const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const MX_TIMEZONE = 'America/Mexico_City';
const admin = require("firebase-admin");
const { stringify } = require("csv-stringify/sync");
const { google } = require("googleapis");
const nodemailer = require("nodemailer");
const path = require("path");
require("dotenv").config(); // Load environment variables

admin.initializeApp();
const db = admin.firestore();

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
            .flatMap(doc => {
                const data = doc.data();
                // Support both legacy single field and new array field
                if (Array.isArray(data.partNumbers)) return data.partNumbers;
                return [data.partNumber || data.PART_NUMBER];
            })
            .filter(pn => !!pn);

        console.log("Fetching full master data...");
        const partsSnap = await db.collection("parts").get();
        const allParts = partsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Match by ID list OR by Date found in logs
        const changedPartsSet = new Set(changedParts);
        const reportDates = new Set(
            changesSnap.docs.map(doc => {
                const data = doc.data();
                return (doc.id.length === 10) ? doc.id : (data.timestamp || '').split('T')[0];
            }).filter(d => !!d)
        );

        const dailyChanges = allParts.filter(p => {
            const pKey = p.PART_NUMBER || p.partNumber || p.id;
            const pDate = p.UPDATE_TIME ? p.UPDATE_TIME.split('T')[0] : null;

            return changedPartsSet.has(pKey) ||
                changedIds.includes(p.id) ||
                (pDate && reportDates.has(pDate));
        });

        diagnostics.changesFound = dailyChanges.length;
        diagnostics.database = `OK (${allParts.length} parts total)`;

        // 2. CSV GENERATION
        // Smart Date: If reporting historical changes, name the file after the event date, not today.
        // Default to Mexico City "Today" if no changes found
        let reportDateStr = new Date().toLocaleDateString('en-CA', { timeZone: MX_TIMEZONE }); // YYYY-MM-DD

        if (dailyChanges.length > 0) {
            // Find the most relevant date from the changes (e.g., the date of the first change)
            const changeId = changedIds[0]; // e.g. "system_yesterday_..." or ISO date
            // If ID is a date string or timestamp, try to parse it. 
            // However, better to rely on `daily_changes` docs data if available in scope.
            // We have `changesSnap`. Let's peek at the first doc.
            const firstChange = changesSnap.docs[0].data();
            if (firstChange && firstChange.timestamp) {
                // Convert the change timestamp to MX Date
                reportDateStr = new Date(firstChange.timestamp).toLocaleDateString('en-CA', { timeZone: MX_TIMEZONE });
            }
        }

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
                    pass: process.env.EMAIL_PASSWORD // App Password
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
 * CLOUD FUNCTION: Save VUCEM Document to Drive
 */
exports.saveFileToExpediente = onCall({
    memory: "512MiB"
}, async (request) => {
    const { pedimentoNo, fileName, fileBase64, mimeType } = request.data;

    if (!pedimentoNo || !fileName || !fileBase64) {
        throw new HttpsError("invalid-argument", "Missing required fields.");
    }

    try {
        const drive = getDriveClient();

        // 1. Get or create pedimento subfolder
        const pedimentoFolderId = await getOrCreatePedimentoFolder(drive, CONFIG.EXPEDIENTE_FOLDER_ID, pedimentoNo);

        // 2. Upload file
        const buffer = Buffer.from(fileBase64, 'base64');
        const fileMetadata = {
            name: fileName,
            parents: [pedimentoFolderId]
        };
        const media = {
            mimeType: mimeType || 'application/pdf',
            body: require('stream').Readable.from(buffer)
        };

        const file = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id, webViewLink'
        });

        // 3. Register in Firestore (Metadata tracking)
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
        throw new HttpsError("internal", err.message);
    }
});
/**
 * CLOUD FUNCTION: Get File from Drive as Base64
 */
exports.getFileFromDrive = onCall({
    memory: "512MiB"
}, async (request) => {
    const { fileId } = request.data;
    if (!fileId) throw new HttpsError("invalid-argument", "Missing fileId.");

    try {
        console.log(`Attempting to download file: ${fileId}`);
        const drive = getDriveClient();

        // Using stream for better binary handling in Node.js
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
                console.log(`File ${fileId} downloaded and converted to base64. Size: ${buffer.length} bytes`);
                resolve({ success: true, fileBase64: base64 });
            });
            response.data.on('error', (err) => {
                console.error("Stream Error:", err);
                reject(new HttpsError("internal", `Stream Error: ${err.message}`));
            });
        });
    } catch (err) {
        console.error("DRIVE_DOWNLOAD_ERROR:", err.message);
        // Map common Drive errors to better messages
        const msg = err.errors ? JSON.stringify(err.errors) : err.message;
        throw new HttpsError("aborted", `Drive API Fail: ${msg} (ID: ${fileId})`);
    }
});

/**
 * CLOUD FUNCTION: Manual Trigger for Report
 */
exports.triggerManualReport = onCall({
    memory: "512MiB",
    timeoutSeconds: 300
}, async (request) => {
    return await runFullReportProcess();
});

/**
 * CLOUD FUNCTION: Scheduled Daily Report (1:00 AM Mexico City)
 */
exports.dailyReportLogimaster = onSchedule({
    schedule: "0 1 * * *",
    timeZone: MX_TIMEZONE,
    memory: "512MiB",
    timeoutSeconds: 300
}, async (event) => {
    console.log("Running scheduled daily report...");
    return await runFullReportProcess();
});
