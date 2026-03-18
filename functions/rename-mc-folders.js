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

    console.log("🚀 Starting verification and renaming of MC folders...");

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

    let renamedCount = 0;
    let deletedCount = 0;

    for (const dipc of dipcFolders) {
        const mcFolders = await listAllFiles(drive, dipc.id, "and mimeType = 'application/vnd.google-apps.folder'");

        for (const mc of mcFolders) {
            const mcItems = await listAllFiles(drive, mc.id);

            // 1. Delete mistakenly copied A_PED PDFs in the root of MC
            const incorrectlyCopiedPeds = mcItems.filter(f => f.mimeType !== 'application/vnd.google-apps.folder' && (f.name.includes('_PED.pdf') || f.name.includes(' A_PED.pdf')));

            for (const badCopy of incorrectlyCopiedPeds) {
                console.log(`  🗑️  Deleting incorrect copy: ${badCopy.name} from root of ${mc.name}`);
                try {
                    await drive.files.delete({ fileId: badCopy.id });
                    deletedCount++;
                } catch (e) {
                    console.error(`  ❌ Error deleting ${badCopy.name}:`, e.message);
                }
            }

            // 2. Rename MC folder based on the inner EXPEDIENTE-ADUANAL -> A_PED file
            const expedienteFolder = mcItems.find(f => f.name === 'EXPEDIENTE-ADUANAL' && f.mimeType === 'application/vnd.google-apps.folder');

            if (!expedienteFolder) continue;

            const expItems = await listAllFiles(drive, expedienteFolder.id);
            const pedFile = expItems.find(f => f.name.includes('_PED') || f.name.includes(' A_PED'));

            if (!pedFile) continue;

            // Strip the extension (usually .pdf)
            const targetName = pedFile.name.replace(/\.[^/.]+$/, "");

            // Only rename if it's not already named exactly this
            if (mc.name !== targetName) {
                console.log(`  📝 Renaming folder '${mc.name}' -> '${targetName}'...`);
                try {
                    await drive.files.update({
                        fileId: mc.id,
                        resource: {
                            name: targetName
                        }
                    });
                    renamedCount++;
                } catch (e) {
                    console.error(`  ❌ Error renaming ${mc.name}:`, e.message);
                }
            }
        }
    }

    console.log(`\n🎉 Total incorrect root copies deleted: ${deletedCount}`);
    console.log(`🎉 Total MC folders successfully renamed: ${renamedCount}`);
}

run();
