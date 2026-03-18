const { google } = require("googleapis");
const path = require("path");
const fs = require("fs");
const AdmZip = require("adm-zip");
const os = require("os");
require("dotenv").config();

const YEAR_2025_FOLDER_ID = "1j4BbW2PnZf3cdaRzADGcSMWFv3AA6nP6";
const POR_ACOMODAR_ID = "1U11VTWBfMAWJ2Pr6WibseOKgie2MNko3";

const getAllFiles = function (dirPath, arrayOfFiles) {
    const files = fs.readdirSync(dirPath);
    arrayOfFiles = arrayOfFiles || [];
    files.forEach(function (file) {
        if (fs.statSync(path.join(dirPath, file)).isDirectory()) {
            arrayOfFiles = getAllFiles(path.join(dirPath, file), arrayOfFiles);
        } else {
            arrayOfFiles.push(path.join(dirPath, file));
        }
    });
    return arrayOfFiles;
};

async function run() {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const drive = google.drive({ version: "v3", auth: oauth2Client });

    console.log("🚀 Starting verification and fix of nested ZIP extractions...");

    try {
        await checkFolder(drive, POR_ACOMODAR_ID, "POR ACOMODAR");
        console.log("\n🏁 Fix process finished!");
    } catch (error) {
        console.error("🔥 Global Error:", error.message);
    }
}

async function checkFolder(drive, folderId, folderName) {
    let pageToken = null;
    let items = [];
    do {
        const response = await drive.files.list({
            q: `'${folderId}' in parents and trashed = false`,
            fields: 'nextPageToken, files(id, name, mimeType)',
            pageToken: pageToken,
            pageSize: 1000
        });
        items = items.concat(response.data.files || []);
        pageToken = response.data.nextPageToken;
    } while (pageToken);

    // If this is an MC folder (leaf directory typically), let's check its contents
    const zips = items.filter(f => f.name.toLowerCase().endsWith('.zip'));
    const others = items.filter(f => !f.name.toLowerCase().endsWith('.zip') && f.mimeType !== 'application/vnd.google-apps.folder');
    const subfolders = items.filter(f => f.mimeType === 'application/vnd.google-apps.folder');

    // If we have ZIPs but almost no extracted files, this folder is suspicious and might need re-extraction.
    // Instead of trusting 'others' blindly, let's just do a thorough extraction, but skip files that ALREADY exist in Drive!

    for (const item of subfolders) {
        await checkFolder(drive, item.id, item.name);
    }

    if (zips.length > 0) {
        // Evaluate if this folder is completely missing extractions
        if (others.length === 0) {
            console.log(`\n📂 Found incomplete folder: ${folderName}`);
            for (const zip of zips) {
                console.log(`  📦 Re-extracting ZIP: ${zip.name}`);
                await extractAndUploadMissing(drive, zip.id, zip.name, folderId, items.map(i => i.name));
            }
        }
    }
}

async function extractAndUploadMissing(drive, zipFileId, zipFileName, parentFolderId, existingFileNames) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "zip-extract-"));
    const zipPath = path.join(tempDir, zipFileName);

    try {
        console.log(`    📥 Downloading ${zipFileName}...`);
        const dest = fs.createWriteStream(zipPath);
        const res = await drive.files.get(
            { fileId: zipFileId, alt: 'media' },
            { responseType: 'stream' }
        );

        await new Promise((resolve, reject) => {
            res.data
                .on('error', err => reject(err))
                .pipe(dest);
            dest.on('finish', () => resolve());
            dest.on('error', err => reject(err));
        });

        const stats = fs.statSync(zipPath);
        if (stats.size < 100) return;

        console.log(`    🔓 Extracting...`);
        const zip = new AdmZip(zipPath);
        const extractPath = path.join(tempDir, "extracted");
        fs.mkdirSync(extractPath);
        zip.extractAllTo(extractPath, true);

        const allExtractedFiles = getAllFiles(extractPath);
        console.log(`    📤 Found ${allExtractedFiles.length} files deep inside ZIP.`);

        let uploaded = 0;
        for (const filePath of allExtractedFiles) {
            // Ignore macOS metadata files
            if (filePath.includes('__MACOSX') || filePath.includes('.DS_Store')) continue;

            const file = path.basename(filePath);

            if (existingFileNames.includes(file)) {
                // console.log(`      ⏩ Skipping ${file} (already exists)`);
                continue;
            }

            console.log(`      + Uploading ${file}`);
            try {
                const media = { body: fs.createReadStream(filePath) };
                const fileMetadata = { name: file, parents: [parentFolderId] };
                await drive.files.create({
                    resource: fileMetadata,
                    media: media,
                    fields: 'id'
                });
                existingFileNames.push(file); // add to avoid uploading duplicates in same run if multiple zips
                uploaded++;
            } catch (uploadError) {
                console.error(`      ❌ Error uploading ${file}:`, uploadError.message);
            }
        }
        if (uploaded === 0) console.log(`    ✨ No new files needed uploading.`);
    } catch (error) {
        console.error(`    ❌ Error processing ${zipFileName}:`, error.message);
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}

run();
