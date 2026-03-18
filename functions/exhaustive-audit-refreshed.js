const { google } = require("googleapis");
const fs = require("fs");
require("dotenv").config();

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
    const { token } = await oauth2Client.getAccessToken(); // Fresh Token
    const drive = google.drive({ version: "v3", auth: oauth2Client });

    console.log("🚀 Running Final Audit on all MC folders in Drive...");
    let reportStr = "=== EXHAUSTIVE AUDIT REPORT ===\n\n";

    const dipcFolders = await listAllFiles(drive, POR_ACOMODAR_ID, "and mimeType = 'application/vnd.google-apps.folder'");
    let countRenamed = 0;
    let countMissed = 0;
    let missedFolders = [];

    for (const dipc of dipcFolders) {
        console.log(`Checking DIPC: ${dipc.name}`);
        const mcFolders = await listAllFiles(drive, dipc.id, "and mimeType = 'application/vnd.google-apps.folder'");

        for (const mc of mcFolders) {
            if (!mc.name.startsWith('MC') && !mc.name.startsWith('RMC')) continue;

            if (mc.name.includes('_PED') || mc.name.includes(' PED') || mc.name.includes(' A_PED') || mc.name.includes('SIM.pdf') ) {
                countRenamed++;
            } else {
                countMissed++;
                
                // Inspect contents deeply to see why exactly this failed
                console.log(`  ❌ MISSED: ${mc.name}. Inspecting contents...`);
                let contentsDesc = "";
                const mcContents = await listAllFiles(drive, mc.id);
                
                if (mcContents.length === 0) {
                    contentsDesc = "[EMPTY FOLDER]";
                } else {
                     for (const item of mcContents) {
                         contentsDesc += `\n      - ${item.name} (${item.mimeType === 'application/vnd.google-apps.folder' ? 'Folder' : 'File'})`;
                         
                         // Drill down 1 level into EXPEDIENTE if it exists to see if the pedigree PDF is there natively
                         if (item.mimeType === 'application/vnd.google-apps.folder' && item.name.includes('EXPEDIENTE')) {
                              const expContents = await listAllFiles(drive, item.id);
                              contentsDesc += `\n         --> Contains ${expContents.length} files`;
                              const ped = expContents.find(f => f.name.includes('_PED') || f.name.includes('PED_SIM'));
                              if (ped) contentsDesc += `\n         --> ⚠️ FOUND HIDDEN PEDIMENTO: ${ped.name}`;
                         }
                         
                         if (item.mimeType === 'application/zip') {
                              contentsDesc += `\n         --> ⚠️ CONTAINS UNEXTRACTED ZIP`;
                         }
                     }
                }
                
                missedFolders.push({
                    name: mc.name,
                    parent: dipc.name,
                    contents: contentsDesc
                });
            }
        }
    }

    reportStr += `TOTAL RENAMED (SUCCESS): ${countRenamed}\n`;
    reportStr += `TOTAL UNRENAMED (FAILED): ${countMissed}\n\n`;

    if (countMissed > 0) {
        reportStr += `=== DETAILS OF UNRENAMED FOLDERS ===\n\n`;
        for (const miss of missedFolders) {
            reportStr += `Folder: ${miss.name} (inside ${miss.parent})\n`;
            reportStr += `Contents: ${miss.contents}\n`;
            reportStr += `--------------------------------------------------\n`;
        }
    }

    fs.writeFileSync("audit-report-final.txt", reportStr);
    console.log(`✅ Audit complete! ${countRenamed} converted, ${countMissed} missed.`);
    console.log("Full details saved to: audit-report-final.txt");
}

run().catch(console.error);
