const functions = require("firebase-functions");
const { onCall, HttpsError, onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const XLSX = require("xlsx");
const { setGlobalOptions } = require("firebase-functions/v2");
const MX_TIMEZONE = 'America/Mexico_City';
const admin = require("firebase-admin");
const { stringify } = require("csv-stringify/sync");
const { google } = require("googleapis");
const nodemailer = require("nodemailer");
const path = require("path");
require("dotenv").config(); // Load environment variables

setGlobalOptions({ region: "us-central1" });

// Set global options for v2 functions
setGlobalOptions({ region: "us-central1" });

admin.initializeApp();
const db = admin.firestore();

console.log("🚀 Functions Initialized. Env Check:", {
    hasClientId: !!process.env.GOOGLE_CLIENT_ID,
    hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
    hasRefreshToken: !!process.env.GOOGLE_REFRESH_TOKEN,
    hasEmailPass: !!process.env.EMAIL_PASSWORD
});

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
 * CLOUD FUNCTION: Save VUCEM Document to Drive (v2 with CORS)
 */
exports.saveFileToExpediente = onCall({
    cors: true,
    memory: "512MiB",
    timeoutSeconds: 120
}, async (request) => {
    const { data } = request;
    const { pedimentoNo, fileName, fileBase64, mimeType } = data;
    console.log(`[START-V2] saveFileToExpediente | Pedimento: ${pedimentoNo} | File: ${fileName} | Size: ${fileBase64?.length || 0}`);

    if (!pedimentoNo || !fileName || !fileBase64) {
        console.error("❌ [VAL_ERROR] Missing required fields");
        throw new functions.https.HttpsError("invalid-argument", "Missing required fields.");
    }

    try {
        console.log("🚙 [DRIVE_INIT] Initializing Google Drive Client...");
        const drive = getDriveClient();
        if (!drive) throw new Error("Failed to initialize Drive client object");

        console.log(`📂 [FOLDER_CHECK] Searching for folder: ${pedimentoNo} in Parent: ${CONFIG.EXPEDIENTE_FOLDER_ID}`);
        const pedimentoFolderId = await getOrCreatePedimentoFolder(drive, CONFIG.EXPEDIENTE_FOLDER_ID, pedimentoNo);
        console.log(`✅ [FOLDER_CHECK] Found/Created Folder ID: ${pedimentoFolderId}`);

        console.log("📄 [BUFFER] Converting base64 to buffer...");
        const buffer = Buffer.from(fileBase64, 'base64');
        const fileMetadata = { name: fileName, parents: [pedimentoFolderId] };
        const media = {
            mimeType: mimeType || 'application/pdf',
            body: require('stream').Readable.from(buffer)
        };

        console.log("📤 [DRIVE_UPLOAD] Sending to Drive API...");
        const file = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id, webViewLink'
        });
        console.log(`✅ [DRIVE_UPLOAD] Upload Success! File ID: ${file.data.id}`);

        console.log(`🗄️ [FIRESTORE] indexing ${pedimentoNo}...`);
        const dossierRef = db.collection("electronic_dossiers").doc(pedimentoNo);
        const dossierDoc = await dossierRef.get();
        const fileInfo = {
            name: fileName,
            driveId: file.data.id,
            url: file.data.webViewLink,
            createdAt: new Date().toISOString()
        };

        if (dossierDoc.exists) {
            const currentItems = dossierDoc.data().items || [];
            const filteredItems = currentItems.filter(it => it.name !== fileName);
            await dossierRef.update({
                items: [...filteredItems, fileInfo],
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
        console.log("✅ [FIRESTORE] Indexing complete");

        return { success: true, fileId: file.data.id, url: file.data.webViewLink };

    } catch (err) {
        console.error("🔥 [CRITICAL_ERROR] v2 failed:", err);
        const detail = err.response?.data?.error_description || err.response?.data?.error?.message || err.message || "Unknown error";
        console.error("🔥 [ERROR_DETAIL]:", detail);
        throw new functions.https.HttpsError("internal", `Server Error: ${detail}`);
    }
});

/**
 * CLOUD FUNCTION: Get File from Drive as Base64 (v2)
 */
exports.getFileFromDriveV2 = onCall({
    cors: true,
    memory: "512MiB",
    timeoutSeconds: 120
}, async (request) => {
    const { data } = request;
    const { fileId } = data;
    if (!fileId) throw new HttpsError("invalid-argument", "Missing fileId.");

    try {
        const drive = getDriveClient();
        console.log(`[V2-DOWNLOAD] Fetching fileId: ${fileId}`);
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
                console.log(`[V2-DOWNLOAD] Success. Base64 length: ${base64.length}`);
                resolve({ success: true, fileBase64: base64 });
            });
            response.data.on('error', (err) => {
                console.error("[V2-DOWNLOAD] Stream Error:", err);
                reject(new HttpsError("internal", `Stream Error: ${err.message}`));
            });
        });
    } catch (err) {
        console.error("[V2-DOWNLOAD] Crash:", err);
        throw new HttpsError("internal", `Drive API Fail: ${err.message}`);
    }
});

/**
 * CLOUD FUNCTION: Manual Trigger for Report (v1)
 */
exports.triggerManualReport = functions.https.onCall(async (data, context) => {
    return await runFullReportProcess(data?.date);
});

/**
 * CLOUD FUNCTION v2: Save File To Drive with explicit CORS and 512MiB memory
 */
exports.saveFileToDriveV2 = onCall({
    cors: true,
    memory: "512MiB",
    timeoutSeconds: 120
}, async (request) => {
    const { data } = request;
    const { pedimentoNo, fileName, fileBase64, mimeType } = data;

    console.log(`[V2-START] Pedimento: ${pedimentoNo} | File: ${fileName}`);

    if (!pedimentoNo || !fileName || !fileBase64) {
        throw new functions.https.HttpsError("invalid-argument", "Missing data.");
    }

    try {
        const drive = getDriveClient();
        console.log("🚙 Drive Client Ready. checking folder...");

        const folderId = await getOrCreatePedimentoFolder(drive, CONFIG.EXPEDIENTE_FOLDER_ID, pedimentoNo);

        console.log("📤 Uploading...");
        const buffer = Buffer.from(fileBase64, 'base64');
        const fileMetadata = { name: fileName, parents: [folderId] };
        const media = {
            mimeType: mimeType || 'application/pdf',
            body: require('stream').Readable.from(buffer)
        };

        const file = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id, webViewLink'
        });

        console.log("✅ Drive Success. Indexing in Firestore...");
        const dossierRef = db.collection("electronic_dossiers").doc(pedimentoNo);
        const dossierDoc = await dossierRef.get();
        const fileInfo = {
            name: fileName,
            driveId: file.data.id,
            url: file.data.webViewLink,
            createdAt: new Date().toISOString()
        };

        if (dossierDoc.exists) {
            const currentItems = dossierDoc.data().items || [];
            const filteredItems = currentItems.filter(it => it.name !== fileName);
            await dossierRef.update({
                items: [...filteredItems, fileInfo],
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
        console.error("🔥 Error v2:", err);
        throw new functions.https.HttpsError("internal", err.message);
    }
});

/**
 * CLOUD FUNCTION: Save BPM Photo to strict Drive Folder
 */
exports.saveBpmPhotoToDrive = onCall({
    cors: true,
    memory: "512MiB",
    timeoutSeconds: 120
}, async (request) => {
    const { data } = request;
    const { fileName, fileBase64, mimeType } = data;
    const BPM_FOLDER_ID = "1XfTr7XBk01ORHDjClLrXYPYXqqp3S7sy";

    console.log(`[BPM-PHOTO] Uploading: ${fileName}`);

    if (!fileName || !fileBase64) {
        throw new functions.https.HttpsError("invalid-argument", "Missing file data.");
    }

    try {
        const drive = getDriveClient();
        const buffer = Buffer.from(fileBase64, 'base64');
        const fileMetadata = { name: fileName, parents: [BPM_FOLDER_ID] };
        const media = {
            mimeType: mimeType || 'image/jpeg',
            body: require('stream').Readable.from(buffer)
        };

        const file = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id, webViewLink'
        });

        console.log(`✅ [BPM-PHOTO] Success. Drive File ID: ${file.data.id}`);
        return { success: true, fileId: file.data.id, url: file.data.webViewLink };
    } catch (err) {
        console.error("🔥 [BPM-PHOTO] Error:", err);
        throw new functions.https.HttpsError("internal", err.message);
    }
});

/**
 * CLOUD FUNCTION: Delete File from Drive (v2)
 */
exports.deleteFileFromDriveV2 = onCall({
    cors: true,
    memory: "128MiB",
    timeoutSeconds: 30
}, async (request) => {
    const { data } = request;
    const { fileId } = data;
    if (!fileId) throw new HttpsError("invalid-argument", "Missing fileId.");

    try {
        const drive = getDriveClient();
        console.log(`[V2-DELETE] Deleting fileId: ${fileId}`);
        await drive.files.delete({ fileId: fileId });
        return { success: true };
    } catch (err) {
        console.error("[V2-DELETE] Error:", err.message);
        // We return success even if not found to allow cleanup to proceed
        if (err.code === 404) return { success: true, warning: 'File not found' };
        throw new HttpsError("internal", `Drive Delete Fail: ${err.message}`);
    }
});

/**
 * CLOUD FUNCTION: Daily Report Scheduler
 * Runs every day at 6:00 AM Mexico City time
 */
exports.dailyReportSchedule = onSchedule({
    schedule: "every day 01:00",
    timeZone: MX_TIMEZONE,
    retryCount: 3,
    memory: "512MiB"
}, async (event) => {
    console.log("⏰ Daily Report Triggered via Schedule");
    await runFullReportProcess();
});

/**
 * CLOUD FUNCTION: Send Master Data Publication Email
 */
exports.sendPublicationEmail = onCall({
    cors: true,
    memory: "256MiB",
    timeoutSeconds: 30
}, async (request) => {
    const { data } = request;
    const { items } = data;

    if (!items || !items.length) {
        throw new functions.https.HttpsError("invalid-argument", "No items provided.");
    }

    try {
        const htsRef = items[0].HTS_SerialNo || "Variados";
        
        const tableRows = items.map(p => `
            <tr>
                <td style="padding: 8px; border: 1px solid #ddd;">${p.PART_NUMBER || ''}</td>
                <td style="padding: 8px; border: 1px solid #ddd;">${p.REGIMEN || ''}</td>
                <td style="padding: 8px; border: 1px solid #ddd;">${p.DESCRIPCION_ES || ''}</td>
                <td style="padding: 8px; border: 1px solid #ddd;">${p.UMC || ''}</td>
                <td style="padding: 8px; border: 1px solid #ddd;">${p.HTSMX || ''}</td>
                <td style="padding: 8px; border: 1px solid #ddd;">${p.HTS_SerialNo || ''}</td>
                <td style="padding: 8px; border: 1px solid #ddd;">${p.CLAVESAT || ''}</td>
            </tr>
        `).join('');

        const htmlBody = `
            <div style="font-family: Arial, sans-serif; color: #333;">
                <h2 style="color: #4F46E5;">Alerta: Nuevos ítems agregados a Base de Datos</h2>
                <p>Se han publicado formalmente los siguientes ${items.length} registros en el Master Data:</p>
                <table style="border-collapse: collapse; width: 100%; font-size: 13px;">
                    <thead style="background-color: #f1f5f9; text-align: left; color: #1e293b;">
                        <tr>
                            <th style="padding: 10px 8px; border: 1px solid #ddd;">PART_NUMBER</th>
                            <th style="padding: 10px 8px; border: 1px solid #ddd;">REGIMEN</th>
                            <th style="padding: 10px 8px; border: 1px solid #ddd;">DESCRIPCION_ES</th>
                            <th style="padding: 10px 8px; border: 1px solid #ddd;">UMC</th>
                            <th style="padding: 10px 8px; border: 1px solid #ddd;">HTSMX</th>
                            <th style="padding: 10px 8px; border: 1px solid #ddd;">HTS_SerialNo</th>
                            <th style="padding: 10px 8px; border: 1px solid #ddd;">CLAVESAT</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>
                <p style="margin-top: 25px; font-size: 12px; color: #94a3b8;">
                    <strong>Logimaster Compliance Engine</strong><br/>
                    Este reporte fue generado y despachado automáticamente de forma transaccional.
                </p>
            </div>
        `;

        // Fetch dynamic subscriptions from Firebase
        const settingsSnap = await db.collection("audit_subscriptions").doc("daily_audit").get();
        let dbRecipients = [];
        if (settingsSnap.exists && settingsSnap.data().emails?.length > 0) {
            dbRecipients = settingsSnap.data().emails;
        }

        // Merge Core Recipients + DB Subscribers smoothly (avoid duplicates)
        const combinedRecipients = Array.from(new Set([
            "jorge.melendez@cfmoto.com", 
            "jesus.hernandez@cfmoto.com",
            ...dbRecipients
        ]));

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: CONFIG.SENDER_EMAIL,
                pass: process.env.EMAIL_PASSWORD
            }
        });

        const mailOptions = {
            from: `"Logimaster Database" <${CONFIG.SENDER_EMAIL}>`,
            to: combinedRecipients.join(', '),
            cc: CONFIG.SENDER_EMAIL,
            subject: `Alerta: Nuevos items agregados a la Base de Datos - HTS Ref: ${htsRef}`,
            html: htmlBody
        };

        await transporter.sendMail(mailOptions);
        console.log(`✅ Publication email sent manually via UI for ${items.length} items.`);

        return { success: true };
    } catch (err) {
        console.error("🔥 Error sending publication email:", err);
        throw new functions.https.HttpsError("internal", err.message);
    }
});

// WMS Floor App REST API
const wmsApi = require('./wmsApi');
exports.api = onRequest({ cors: true, memory: "256MiB" }, wmsApi);

// ── AUTO-FILL: cfmRef + vehiculos al guardar layoutUrl ────────────────────────
// Se activa automáticamente cuando se escribe en asignacion_cajas.
// Lee el archivo de Drive vía GAS y extrae cfmRef (nombre) y vehiculos (D27).
exports.autoFillLayout = onDocumentWritten(
  { document: 'asignacion_cajas/{docId}', region: 'us-central1', memory: '256MiB' },
  async (event) => {
    const after = event.data.after;
    if (!after.exists) return null;
    const data = after.data();
    if (!data.layoutUrl) return null;
    if (data.cfmRef && data.vehiculos) return null; // ya completo

    // Procesar si: layoutUrl cambió  O  si aún faltan cfmRef/vehiculos (reintento)
    const before = event.data.before;
    const beforeData = before.exists ? before.data() : {};
    const urlUnchanged = beforeData.layoutUrl === data.layoutUrl;
    const missingFields = !data.cfmRef || !data.vehiculos;
    if (urlUnchanged && !missingFields) return null;

    // Extraer fileId de la URL o del campo guardado
    const url = data.layoutUrl || '';
    let fileId = data.layoutFileId || '';
    if (!fileId) {
      const parts = url.split('/d/');
      if (parts.length > 1) fileId = parts[1].split(/[/?#]/)[0];
      else { const m = url.match(/[?&]id=([\w-]+)/); fileId = m ? m[1] : ''; }
    }
    if (!fileId) { console.warn('autoFillLayout: sin fileId para', event.params.docId); return null; }

    // Llamar al GAS readFile — hasta 3 intentos con backoff
    const GAS_READ = 'https://script.google.com/macros/s/AKfycbzX3ctF0kOxbw2M4uHbkPp8gsIy-EMQX64M5IEzMHTQs0gUxR-7BOx9BMe2RVEFKeWh/exec';
    let json = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const resp = await fetch(`${GAS_READ}?action=readFile&fileId=${fileId}`);
        const text = await resp.text();
        if (text.trim().startsWith('<')) {
          throw new Error(`GAS devolvió HTML en intento ${attempt}: ${text.substring(0, 80)}`);
        }
        json = JSON.parse(text);
        break; // éxito
      } catch (e) {
        console.warn(`autoFillLayout GAS intento ${attempt}/3 fallido (${event.params.docId}):`, e.message);
        if (attempt < 3) await new Promise(r => setTimeout(r, 2000 * attempt));
      }
    }
    if (!json) { console.error(`autoFillLayout GAS error (todos los reintentos fallaron) para ${event.params.docId}`); return null; }

    const updates = {};
    if (!data.cfmRef && json.name) {
      const raw = json.name.replace(/\.[^/.]+$/, '');
      const pi = raw.toUpperCase().indexOf('LAY OUT CCP_');
      if (pi !== -1) updates.cfmRef = raw.substring(pi + 12).trim();
    }
    if (!data.vehiculos && json.content) {
      try {
        const wb = XLSX.read(json.content, { type: 'base64' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const v = sheet['D27']?.v;
        if (v !== undefined) updates.vehiculos = String(v).trim();
      } catch (e) { console.warn('autoFillLayout XLSX error:', e.message); }
    }
    if (!data.layoutFileId && fileId) updates.layoutFileId = fileId;

    if (Object.keys(updates).length > 0) {
      await after.ref.update(updates);
      console.log(`✓ autoFillLayout ${event.params.docId}:`, JSON.stringify(updates));
    }
    return null;
  }
);

// ── BACKFILL HTTP: reprocesa docs con layoutUrl pero sin cfmRef/vehiculos ───────
// Llamar: GET https://.../backfillMissingFields?token=BACKFILL_SECRET&fecha=2026-07-07
exports.backfillMissingFields = onRequest(
  { region: 'us-central1', memory: '512MiB', timeoutSeconds: 300 },
  async (req, res) => {
    // Validar token secreto
    const secret = process.env.BACKFILL_SECRET || 'cfmoto-backfill-2026';
    if (req.query.token !== secret) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const db = admin.firestore();
    const GAS_READ = 'https://script.google.com/macros/s/AKfycbzX3ctF0kOxbw2M4uHbkPp8gsIy-EMQX64M5IEzMHTQs0gUxR-7BOx9BMe2RVEFKeWh/exec';
    const fecha = req.query.fecha || null;

    let q = db.collection('asignacion_cajas').where('layoutUrl', '!=', '');
    if (fecha) q = db.collection('asignacion_cajas').where('fecha', '==', fecha);

    const snap = await q.get();
    const candidates = snap.docs.filter(d => {
      const data = d.data();
      return data.layoutUrl && (!data.cfmRef || !data.vehiculos);
    });

    console.log(`backfillMissingFields: ${candidates.length} docs a procesar (fecha=${fecha || 'todas'})`);
    const results = [];

    for (const docSnap of candidates) {
      const data = docSnap.data();
      const docId = docSnap.id;
      const url = data.layoutUrl || '';
      let fileId = data.layoutFileId || '';
      if (!fileId) {
        const parts = url.split('/d/');
        if (parts.length > 1) fileId = parts[1].split(/[/?#]/)[0];
        else { const m = url.match(/[?&]id=([\w-]+)/); fileId = m ? m[1] : ''; }
      }
      if (!fileId) { results.push({ docId, status: 'sin fileId' }); continue; }

      let json = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const resp = await fetch(`${GAS_READ}?action=readFile&fileId=${fileId}`);
          const text = await resp.text();
          if (text.trim().startsWith('<')) throw new Error('HTML response');
          json = JSON.parse(text);
          break;
        } catch (e) {
          if (attempt < 3) await new Promise(r => setTimeout(r, 2000 * attempt));
        }
      }
      if (!json) { results.push({ docId, status: 'GAS error' }); continue; }

      const updates = {};
      if (!data.cfmRef && json.name) {
        const raw = json.name.replace(/\.[^/.]+$/, '');
        const pi = raw.toUpperCase().indexOf('LAY OUT CCP_');
        if (pi !== -1) updates.cfmRef = raw.substring(pi + 12).trim();
      }
      if (!data.vehiculos && json.content) {
        try {
          const wb = XLSX.read(json.content, { type: 'base64' });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const v = sheet['D27']?.v;
          if (v !== undefined) updates.vehiculos = String(v).trim();
        } catch (_) {}
      }
      if (!data.layoutFileId && fileId) updates.layoutFileId = fileId;

      if (Object.keys(updates).length > 0) {
        await docSnap.ref.update(updates);
        results.push({ docId, status: 'ok', updates });
        console.log(`✓ backfill ${docId}:`, JSON.stringify(updates));
      } else {
        results.push({ docId, status: 'sin cambios' });
      }
    }

    res.json({ processed: candidates.length, results });
  }
);
