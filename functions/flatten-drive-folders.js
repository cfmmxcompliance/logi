const { google } = require("googleapis");
require("dotenv").config();

const POR_ACOMODAR_ID = "1U11VTWBfMAWJ2Pr6WibseOKgie2MNko3";

async function run() {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const drive = google.drive({ version: "v3", auth: oauth2Client });

    console.log("🚀 Starting SAFE Flattening Process (MOVING FILES ONLY)...");

    try {
        await processFlattening(drive);
        console.log("\n🏁 SAFE Flattening process finished!");
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

// Recursively find all non-folder, non-zip files under a folder
async function findDeepFiles(drive, currentFolderId, mcFolderId, results = []) {
    const items = await listAllFiles(drive, currentFolderId);

    for (const item of items) {
        if (item.mimeType === 'application/vnd.google-apps.folder') {
            await findDeepFiles(drive, item.id, mcFolderId, results);
        } else {
            // Ignore ZIPs in this phase, we just want to move the extracted content
            if (!item.name.toLowerCase().endsWith('.zip')) {
                // Only act if the file is NOT already sitting strictly inside the MC folder
                if (item.parents && item.parents[0] !== mcFolderId) {
                    results.push(item);
                }
            }
        }
    }
    return results;
}

async function processFlattening(drive) {
    // 1. Get all 51 DIPC folders
    console.log(`🔍 Fetching DIPC folders...`);
    const dipcFolders = await listAllFiles(drive, POR_ACOMODAR_ID, "and mimeType = 'application/vnd.google-apps.folder'");
    console.log(`Found ${dipcFolders.length} DIPC folders.`);

    for (const dipc of dipcFolders) {
        // 2. Get MC folders inside DIPC
        const mcFolders = await listAllFiles(drive, dipc.id, "and mimeType = 'application/vnd.google-apps.folder'");

        for (const mc of mcFolders) {
            console.log(`\n📂 Analyzing Folder: ${mc.name} (inside ${dipc.name})`);

            // 3. Find all files buried inside subdirectories of this MC folder
            const filesToMove = await findDeepFiles(drive, mc.id, mc.id);

            if (filesToMove.length === 0) {
                console.log(`  ✅ All files are already at the root level.`);
                continue;
            }

            console.log(`  ➡️ Found ${filesToMove.length} files buried in subfolders. Flattening them...`);

            // 4. Move files to the root of the MC folder
            let movedCount = 0;
            for (const file of filesToMove) {
                try {
                    const previousParents = file.parents.join(',');
                    await drive.files.update({
                        fileId: file.id,
                        addParents: mc.id,
                        removeParents: previousParents,
                        fields: 'id, parents'
                    });
                    console.log(`    Moved: ${file.name}`);
                    movedCount++;
                } catch (e) {
                    console.error(`    ❌ Error moving ${file.name}:`, e.message);
                }
            }
            console.log(`  ✅ Successfully moved ${movedCount} files to the root of ${mc.name}.`);
        }
    }
}

run();
