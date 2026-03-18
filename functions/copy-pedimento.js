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

    console.log("🚀 Starting verification and copy of Pedimento files...");

    try {
        await processFolders(drive);
        console.log("\n🏁 Process finished!");
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

async function processFolders(drive) {
    console.log(`🔍 Fetching DIPC folders...`);
    const dipcFolders = await listAllFiles(drive, POR_ACOMODAR_ID, "and mimeType = 'application/vnd.google-apps.folder'");
    console.log(`Found ${dipcFolders.length} DIPC folders.`);

    let copiedCount = 0;

    for (const dipc of dipcFolders) {
        const mcFolders = await listAllFiles(drive, dipc.id, "and mimeType = 'application/vnd.google-apps.folder'");

        for (const mc of mcFolders) {
            // Find EXPEDIENTE-ADUANAL inside this MC folder
            const subFolders = await listAllFiles(drive, mc.id, "and mimeType = 'application/vnd.google-apps.folder'");
            const expedienteFolder = subFolders.find(f => f.name === 'EXPEDIENTE-ADUANAL');

            if (!expedienteFolder) continue;

            const mcItems = await listAllFiles(drive, mc.id);
            const expItems = await listAllFiles(drive, expedienteFolder.id);

            // Find files containing 'A_PED' or 'PED_SIM' or specifically 'A_PED' as the user specified 'A_PED'
            const pedFiles = expItems.filter(f => f.name.includes('_PED') || f.name.includes(' A_PED'));
            if (pedFiles.length === 0) continue;

            // We only want to copy if it's not already in the parent folder!
            for (const pedFile of pedFiles) {
                const targetName = pedFile.name; // user wants exact same name
                const alreadyExists = mcItems.find(f => f.name === targetName);

                if (!alreadyExists) {
                    console.log(`  ➡️ Copying ${targetName} to root of ${mc.name}...`);
                    try {
                        await drive.files.copy({
                            fileId: pedFile.id,
                            resource: {
                                name: targetName,
                                parents: [mc.id]
                            },
                            fields: 'id'
                        });
                        copiedCount++;
                    } catch (e) {
                        console.error(`  ❌ Error copying ${targetName}:`, e.message);
                    }
                }
            }
        }
    }

    console.log(`\n🎉 Total Pedimento files successfully copied: ${copiedCount}`);
}

run();
