const { google } = require("googleapis");
require("dotenv").config();
const fs = require("fs");
const path = require("path");

const POR_ACOMODAR_ID = "1U11VTWBfMAWJ2Pr6WibseOKgie2MNko3";

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

async function run() {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const drive = google.drive({ version: "v3", auth: oauth2Client });

    console.log("🔍 Starting EXHAUSTIVE audit of all DIPC folders...\n");

    const dipcFolders = await listAllFiles(drive, POR_ACOMODAR_ID, "and mimeType = 'application/vnd.google-apps.folder'");

    let missedFolders = [];
    let renamedCount = 0;

    for (const dipc of dipcFolders) {
        const mcFolders = await listAllFiles(drive, dipc.id, "and mimeType = 'application/vnd.google-apps.folder'");

        for (const mc of mcFolders) {
            // Check if it's already renamed (contains ' PED')
            if (mc.name.includes('_PED') || mc.name.includes(' PED') || mc.name.includes('A_PED')) {
                renamedCount++;
                continue;
            }

            // If it is a raw 'MC...' or 'RMC...' folder
            if (mc.name.startsWith('MC') || mc.name.startsWith('RMC')) {
                missedFolders.push({ dipcName: dipc.name, mcFolder: mc });
            }
        }
    }

    console.log(`✅ EXHAUSTIVE RESULTS:`);
    console.log(`- Folders successfully renamed: ${renamedCount}`);
    console.log(`- Folders MISSING rename: ${missedFolders.length}`);

    let reportStr = `EXHAUSTIVE AUDIT REPORT\n-----------------------\nTotal Renamed: ${renamedCount}\nTotal Missed: ${missedFolders.length}\n\n`;

    if (missedFolders.length > 0) {
        console.log(`\n📄 Detailed breakdown of the ${missedFolders.length} missing folders...`);
        for (const item of missedFolders) {
            console.log(`\n➡️  ${item.dipcName} / ${item.mcFolder.name}`);
            reportStr += `\n[ ${item.dipcName} / ${item.mcFolder.name} ]\n`;

            const mcItems = await listAllFiles(drive, item.mcFolder.id);
            if (mcItems.length === 0) {
                console.log("     (Folder is completely empty)");
                reportStr += `  -> Folder is completely empty.\n`;
                continue;
            }

            // Print direct contents
            const folders = mcItems.filter(f => f.mimeType === 'application/vnd.google-apps.folder').map(f => f.name).join(", ");
            const files = mcItems.filter(f => f.mimeType !== 'application/vnd.google-apps.folder').map(f => f.name).join(", ");

            if (folders) {
                console.log(`     Sub-folders: ${folders}`);
                reportStr += `  -> Sub-folders: ${folders}\n`;
            }
            if (files) {
                console.log(`     Files in root: ${files}`);
                reportStr += `  -> Files in root: ${files}\n`;
            }
        }
    }

    fs.writeFileSync(path.join(__dirname, "audit-report.txt"), reportStr);
    console.log("\n📁 Full report saved to 'functions/audit-report.txt'\n");
}
run();
