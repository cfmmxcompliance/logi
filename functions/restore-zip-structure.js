const { google } = require("googleapis");
const fs = require("fs");
const AdmZip = require("adm-zip");
require("dotenv").config();

const POR_ACOMODAR_ID = "1U11VTWBfMAWJ2Pr6WibseOKgie2MNko3";

async function run() {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const { token } = await oauth2Client.getAccessToken();
    const drive = google.drive({ version: "v3", auth: oauth2Client });

    console.log("🚀 Starting RESTORATION Process (REBUILDING ZIP FOLDERS)...");

    try {
        await processRestoring(drive, token);
        console.log("\n🏁 RESTORATION process finished!");
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

// Memory cache for created folders to avoid duplicate API calls
const folderCache = {};

async function getOrCreateFolder(drive, parentId, folderName) {
    const key = parentId + "_" + folderName;
    if (folderCache[key]) return folderCache[key];

    // Check if it already exists
    const res = await drive.files.list({
        q: `'${parentId}' in parents and name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id)'
    });

    if (res.data.files && res.data.files.length > 0) {
        folderCache[key] = res.data.files[0].id;
        return folderCache[key];
    }

    // Create it
    console.log(`      📁 Creating missing folder: ${folderName}`);
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

async function processRestoring(drive, token) {
    console.log(`🔍 Fetching DIPC folders...`);
    const dipcFolders = await listAllFiles(drive, POR_ACOMODAR_ID, "and mimeType = 'application/vnd.google-apps.folder'");
    console.log(`Found ${dipcFolders.length} DIPC folders.`);

    for (const dipc of dipcFolders) {
        const mcFolders = await listAllFiles(drive, dipc.id, "and mimeType = 'application/vnd.google-apps.folder'");

        for (const mc of mcFolders) {
            console.log(`\n📂 Analyzing Folder: ${mc.name}`);

            const mcItems = await listAllFiles(drive, mc.id);
            const zips = mcItems.filter(f => f.name.toLowerCase().endsWith('.zip'));

            if (zips.length === 0) {
                console.log(`  ⏩ No ZIP file found in ${mc.name}.`);
                continue;
            }

            // We will just process the first zip. 
            const zipFile = zips[0];
            console.log(`  📥 Fetching ${zipFile.name} to read structure...`);

            const url = `https://www.googleapis.com/drive/v3/files/${zipFile.id}?alt=media`;
            const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

            if (!response.ok) {
                console.log(`  ❌ Failed to download ZIP ${response.statusText}`);
                continue;
            }

            const arrayBuffer = await response.arrayBuffer();
            fs.writeFileSync('/tmp/tempzip.zip', Buffer.from(arrayBuffer));
            const zip = new AdmZip('/tmp/tempzip.zip');
            const entries = zip.getEntries();

            // Reconstruct paths mapping: filename (lowercase) -> final structural path string
            const fileMap = {};
            const mcNumberMatch = mc.name.match(/MC\d{4}-\d{2}/i);
            const mcNumber = mcNumberMatch ? mcNumberMatch[0].toLowerCase() : null;

            entries.forEach(entry => {
                if (!entry.isDirectory) {
                    const filename = entry.name.toLowerCase();
                    const fullPath = entry.entryName;

                    let parts = fullPath.split('/').filter(p => p.trim() !== '');
                    parts.pop(); // remove file name itself

                    // Remove wrapper directories (e.g. "Expense account MC...", "MC...")
                    const cleanParts = parts.filter(p => {
                        const lowerP = p.toLowerCase();
                        if (mcNumber && lowerP.includes(mcNumber)) return false;
                        if (lowerP.includes('expense')) return false;
                        return true;
                    });

                    if (cleanParts.length > 0) {
                        fileMap[filename] = cleanParts; // Array of path segments
                    }
                }
            });

            console.log(`  🗺️  Mapped ${Object.keys(fileMap).length} structural files from ZIP.`);

            // Now evaluate files currently sitting at the root of `mc.id`
            const rootFiles = mcItems.filter(f => f.mimeType !== 'application/vnd.google-apps.folder' && !f.name.toLowerCase().endsWith('.zip'));

            let movedCount = 0;
            for (const file of rootFiles) {
                const targetPathArr = fileMap[file.name.toLowerCase()];
                if (targetPathArr && targetPathArr.length > 0) {
                    // Navigate and create folders 
                    let currentTargetDirId = mc.id;
                    for (const p of targetPathArr) {
                        currentTargetDirId = await getOrCreateFolder(drive, currentTargetDirId, p);
                    }

                    // Move file into the final target folder
                    try {
                        const previousParents = file.parents.join(',');
                        await drive.files.update({
                            fileId: file.id,
                            addParents: currentTargetDirId,
                            removeParents: previousParents,
                            fields: 'id, parents'
                        });
                        console.log(`    ➡️  Moved: ${file.name} -> ${targetPathArr.join('/')}`);
                        movedCount++;
                    } catch (e) {
                        console.error(`    ❌ Error moving ${file.name}:`, e.message);
                    }
                }
            }
            console.log(`  ✅ Successfully restored path for ${movedCount} files in ${mc.name}.`);
        }
    }
}

run();
