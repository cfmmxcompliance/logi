const { google } = require("googleapis");
const path = require("path");
const fs = require("fs");
const AdmZip = require("adm-zip");
const os = require("os");
require("dotenv").config();

const YEAR_2025_FOLDER_ID = "1j4BbW2PnZf3cdaRzADGcSMWFv3AA6nP6";

async function run() {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN
    });

    const drive = google.drive({ version: "v3", auth: oauth2Client });

    console.log("🚀 Starting Recursive ZIP Extraction Process (USING USER ACCOUNT)...");

    try {
        // 1. Find POR ACOMODAR folder ID
        console.log(`🔍 Searching for "POR ACOMODAR" in 2025...`);
        const searchResp = await drive.files.list({
            q: `'${YEAR_2025_FOLDER_ID}' in parents and name = 'POR ACOMODAR' and trashed = false`,
            fields: 'files(id, name)'
        });

        if (searchResp.data.files.length === 0) {
            console.error("❌ 'POR ACOMODAR' folder not found.");
            return;
        }

        const porAcomodarId = searchResp.data.files[0].id;
        console.log(`✅ Found POR ACOMODAR ID: ${porAcomodarId}`);

        // 2. Start recursive processing
        await processFolder(drive, porAcomodarId, "POR ACOMODAR");
        console.log("\n🏁 Extraction process finished!");

    } catch (error) {
        console.error("🔥 Global Error:", error.message);
        if (error.response) console.error("Details:", error.response.data);
    }
}

async function processFolder(drive, folderId, folderName) {
    console.log(`\n📂 Entering Folder: ${folderName} (${folderId})`);

    const response = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'files(id, name, mimeType)',
        pageSize: 100
    });

    const items = response.data.files || [];

    for (const item of items) {
        if (item.mimeType === 'application/vnd.google-apps.folder') {
            await processFolder(drive, item.id, item.name);
        } else if (item.name.toLowerCase().endsWith('.zip')) {
            console.log(`  📦 Found ZIP: ${item.name} (${item.id})`);
            await extractZipInDrive(drive, item.id, item.name, folderId);
        }
    }
}

async function extractZipInDrive(drive, zipFileId, zipFileName, parentFolderId) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "zip-extract-"));
    const zipPath = path.join(tempDir, zipFileName);

    try {
        // A. Download ZIP with proper stream handling
        console.log(`    📥 Downloading ${zipFileName}...`);
        const dest = fs.createWriteStream(zipPath);
        const res = await drive.files.get(
            { fileId: zipFileId, alt: 'media' },
            { responseType: 'stream' }
        );

        await new Promise((resolve, reject) => {
            res.data
                .on('error', err => {
                    console.error("      Stream Error:", err.message);
                    reject(err);
                })
                .pipe(dest);
            dest.on('finish', () => resolve());
            dest.on('error', err => reject(err));
        });

        // Check file size
        const stats = fs.statSync(zipPath);
        if (stats.size < 100) {
            console.warn(`    ⚠️  File ${zipFileName} is too small (${stats.size} bytes), possibly not a valid ZIP.`);
            const content = fs.readFileSync(zipPath, 'utf8').substring(0, 100);
            console.warn(`    Snippet: ${content}`);
            return;
        }

        // B. Extract ZIP
        console.log(`    🔓 Extracting...`);
        const zip = new AdmZip(zipPath);
        const extractPath = path.join(tempDir, "extracted");
        fs.mkdirSync(extractPath);
        zip.extractAllTo(extractPath, true);

        // C. Upload Extracted Files
        const files = fs.readdirSync(extractPath);
        console.log(`    📤 Uploading ${files.length} files...`);
        for (const file of files) {
            const filePath = path.join(extractPath, file);
            const stat = fs.statSync(filePath);

            if (stat.isFile()) {
                console.log(`      + ${file}`);
                try {
                    const media = {
                        body: fs.createReadStream(filePath)
                    };
                    const fileMetadata = {
                        name: file,
                        parents: [parentFolderId]
                    };
                    await drive.files.create({
                        resource: fileMetadata,
                        media: media,
                        fields: 'id'
                    });
                } catch (uploadError) {
                    console.error(`      ❌ Error uploading ${file}:`, uploadError.message);
                }
            }
        }
    } catch (error) {
        console.error(`    ❌ Error processing ${zipFileName}:`, error.message);
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}

run();
