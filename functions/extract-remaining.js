const { google } = require("googleapis");
const fs = require("fs");
const AdmZip = require("adm-zip");
const path = require("path");
const os = require("os");
const { PassThrough } = require('stream');
require("dotenv").config();

const POR_ACOMODAR_ID = "1U11VTWBfMAWJ2Pr6WibseOKgie2MNko3";

const PENDING_FOLDERS = [
    "MC0176-26", "MC0245-26", "MC0313-26", "MC0310-26", "MC0469-26", "MC0325-26",
    "MC0324-26", "MC0162-26", "MC0246-26", "MC0156-26", "MC0154-26", "MC0155-26",
    "MC0157-26", "MC0158-26", "MC0004-26", "MC0059-26", "MC0224-26", "MC0221-26",
    "MC0226-26", "MC0260-26", "MC0264-26", "MC0258-26", "MC0262-26", "MC0234-26",
    "MC0236-26", "MC0242-26", "MC0240-26", "MC0238-26", "MC0244-26", "MC0063-26",
    "MC0061-26", "MC0069-26", "MC0065-26", "MC0067-26", "MC0191-26"
];

async function run() {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const { token } = await oauth2Client.getAccessToken();
    const drive = google.drive({ version: "v3", auth: oauth2Client });

    console.log("🚀 Starting TARGETED EXTRACT & STRUCTURE...");

    try {
        await processExtractAndStructure(drive, token);
        console.log("\n🏁 Fix process finished!");
    } catch (error) {
        console.error("🔥 Global Error:", error.message);
    }
}

async function listAllFiles(drive, folderId, queryExtra = "") {
    let pageToken = null;
    let items = [];
    do {
        const response = await drive.files.list({
            q: `'${folderId}' in parents and trashed = false ${queryExtra}`,
            fields: 'nextPageToken, files(id, name, mimeType, parents)',
            pageToken: pageToken,
            pageSize: 1000
        });
        items = items.concat(response.data.files || []);
        pageToken = response.data.nextPageToken;
    } while (pageToken);
    return items;
}

const folderCache = {};
async function getOrCreateFolder(drive, parentId, folderName) {
    const key = parentId + "_" + folderName;
    if (folderCache[key]) return folderCache[key];

    const res = await drive.files.list({
        q: `'${parentId}' in parents and name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id)'
    });

    if (res.data.files && res.data.files.length > 0) {
        folderCache[key] = res.data.files[0].id;
        return folderCache[key];
    }

    console.log(`      📁 Creating target folder: ${folderName}`);
    const createRes = await drive.files.create({
        resource: {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentId]
        },
        fields: 'id'
    });
    folderCache[key] = createRes.data.id;
    return folderCache[key];
}

async function getDeepFileNames(drive, currentFolderId) {
    let allNames = [];
    const items = await listAllFiles(drive, currentFolderId);

    for (const item of items) {
        if (item.mimeType === 'application/vnd.google-apps.folder') {
            const subNames = await getDeepFileNames(drive, item.id);
            allNames = allNames.concat(subNames);
        } else {
            allNames.push(item.name.toLowerCase());
        }
    }
    return allNames;
}

async function processExtractAndStructure(drive, token) {
    console.log(`🔍 Fetching DIPC folders...`);
    const dipcFolders = await listAllFiles(drive, POR_ACOMODAR_ID, "and mimeType = 'application/vnd.google-apps.folder'");

    for (const dipc of dipcFolders) {
        const mcFolders = await listAllFiles(drive, dipc.id, "and mimeType = 'application/vnd.google-apps.folder'");

        for (const mc of mcFolders) {
            if (!PENDING_FOLDERS.includes(mc.name)) continue;

            const mcItems = await listAllFiles(drive, mc.id);
            const zips = mcItems.filter(f => f.name.toLowerCase().endsWith('.zip'));
            if (zips.length === 0) continue;

            const existingNames = await getDeepFileNames(drive, mc.id);
            const zipFile = zips[0];

            console.log(`\n📂 Analyzing Folder: ${mc.name}`);

            const url = `https://www.googleapis.com/drive/v3/files/${zipFile.id}?alt=media`;
            let response;
            try {
                response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
                if (!response.ok) {
                    console.log(`  ❌ Failed to download ZIP ${response.statusText} for ${mc.name}`);
                    continue;
                }
            } catch (err) {
                console.log(`  ❌ Fetch error for ${mc.name}:`, err.message);
                continue;
            }

            const arrayBuffer = await response.arrayBuffer();
            const tempZipPath = path.join(os.tmpdir(), `temp_${Math.random().toString(36).substring(7)}.zip`);
            fs.writeFileSync(tempZipPath, Buffer.from(arrayBuffer));

            const zip = new AdmZip(tempZipPath);
            const entries = zip.getEntries();

            const mcNumberMatch = mc.name.match(/MC\d{4}-\d{2}/i);
            const mcNumber = mcNumberMatch ? mcNumberMatch[0].toLowerCase() : null;

            let newlyUploaded = 0;
            for (const entry of entries) {
                if (entry.isDirectory) continue;

                const filename = entry.name.toLowerCase();
                const actualName = entry.name;

                if (entry.entryName.includes('__MACOSX') || entry.entryName.includes('.DS_Store')) continue;

                if (!existingNames.includes(filename)) {
                    const targetPathArr = entry.entryName.split('/').filter(p => p.trim() !== '');
                    targetPathArr.pop();

                    const cleanParts = targetPathArr.filter(p => {
                        const lowerP = p.toLowerCase();
                        if (mcNumber && lowerP.includes(mcNumber)) return false;
                        if (lowerP.includes('expense')) return false;
                        return true;
                    });

                    let targetFolderId = mc.id;
                    for (const p of cleanParts) {
                        targetFolderId = await getOrCreateFolder(drive, targetFolderId, p);
                    }

                    console.log(`      + Uploading MISSING file: ${actualName} -> ${cleanParts.length ? cleanParts.join('/') : 'ROOT'}`);
                    try {
                        const bufferStream = new PassThrough();
                        bufferStream.end(entry.getData());

                        await drive.files.create({
                            resource: { name: actualName, parents: [targetFolderId] },
                            media: { mimeType: 'application/octet-stream', body: bufferStream },
                            fields: 'id'
                        });
                        existingNames.push(filename);
                        newlyUploaded++;
                    } catch (e) {
                        console.error(`      ❌ Upload Error for ${actualName}:`, e.message);
                    }
                }
            }

            if (newlyUploaded === 0) {
                console.log(`  ✅ ${mc.name}: No missing files left in the ZIP.`);
            } else {
                console.log(`  🚀 ${mc.name}: Successfully extracted and structured ${newlyUploaded} missing files.`);
            }

            if (fs.existsSync(tempZipPath)) fs.unlinkSync(tempZipPath);
        }
    }
}

run();
