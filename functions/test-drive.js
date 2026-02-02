const admin = require("firebase-admin");
const { google } = require("googleapis");
require("dotenv").config();

// Initialize admin with service account
const serviceAccount = require("./service-account.json");
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const CONFIG = {
    DRIVE_FOLDER_NAME: "Logimaster Daily Reports",
    EXPEDIENTE_FOLDER_ID: "1C0ZqlwV0KMKoD2TziEoXeu_X5E_0UXZw",
};

function getDriveClient() {
    console.log("🚙 Initializing OAuth2 Client...");
    console.log("Checking ENV:", {
        clientId: !!process.env.GOOGLE_CLIENT_ID,
        clientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
        refreshToken: !!process.env.GOOGLE_REFRESH_TOKEN
    });

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

async function getOrCreatePedimentoFolder(drive, parentId, pedimentoNo) {
    console.log(`📂 Searching for folder: ${pedimentoNo} in Parent: ${parentId}`);
    const query = `'${parentId}' in parents and name = '${pedimentoNo}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const response = await drive.files.list({ q: query, fields: 'files(id, name)' });

    if (response.data.files && response.data.files.length > 0) {
        console.log(`✅ Found folder: ${response.data.files[0].id}`);
        return response.data.files[0].id;
    }

    console.log(`🆕 Creating folder: ${pedimentoNo}`);
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

async function testUpload() {
    const pedimentoNo = "TEST_P_12345";
    const fileName = "test_upload.txt";
    const fileBase64 = Buffer.from("Hello Logimaster Test Upload").toString('base64');

    try {
        const drive = getDriveClient();
        const folderId = await getOrCreatePedimentoFolder(drive, CONFIG.EXPEDIENTE_FOLDER_ID, pedimentoNo);

        console.log("📤 Uploading file...");
        const buffer = Buffer.from(fileBase64, 'base64');
        const fileMetadata = { name: fileName, parents: [folderId] };
        const media = {
            mimeType: 'text/plain',
            body: require('stream').Readable.from(buffer)
        };

        const file = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id, webViewLink'
        });

        console.log("✅ Success! File ID:", file.data.id);
        console.log("🔗 Web View Link:", file.data.webViewLink);
        process.exit(0);
    } catch (err) {
        console.error("🔥 FAILED:", err.message);
        if (err.response) {
            console.error("Detail:", err.response.data);
        }
        process.exit(1);
    }
}

testUpload();
