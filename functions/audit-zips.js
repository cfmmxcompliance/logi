const { google } = require("googleapis");
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
    const drive = google.drive({ version: "v3", auth: oauth2Client });

    console.log("🔍 Checking the 41 missed folders for unextracted ZIPs...\n");

    const dipcFolders = await listAllFiles(drive, POR_ACOMODAR_ID, "and mimeType = 'application/vnd.google-apps.folder'");

    let unextractedZipCount = 0;
    let completelyEmptyCount = 0;
    let otherIssueCount = 0;

    for (const dipc of dipcFolders) {
        const mcFolders = await listAllFiles(drive, dipc.id, "and mimeType = 'application/vnd.google-apps.folder'");
        
        for (const mc of mcFolders) {
            // Only examine the un-renamed folders
            if (mc.name.includes('_PED') || mc.name.includes(' PED') || mc.name.includes('A_PED')) continue;
            if (!mc.name.startsWith('MC') && !mc.name.startsWith('RMC')) continue;
            
            const mcItems = await listAllFiles(drive, mc.id);
            
            if (mcItems.length === 0) {
                completelyEmptyCount++;
                continue;
            }

            const zips = mcItems.filter(f => f.mimeType === 'application/zip' || f.name.toLowerCase().endsWith('.zip'));
            const subfolders = mcItems.filter(f => f.mimeType === 'application/vnd.google-apps.folder');

            // The issue the user pointed out: A ZIP exists, but no subfolders were created (unextracted)
            if (zips.length > 0 && subfolders.length === 0) {
                console.log(`⚠️ Unextracted ZIP issue in: ${mc.name}`);
                zips.forEach(z => console.log(`   - ${z.name}`));
                unextractedZipCount++;
            } else if (zips.length === 0 && subfolders.length === 0) {
                otherIssueCount++;
            }
        }
    }
    
    console.log(`\n✅ SUMMARY OF 41 MISSED FOLDERS:`);
    console.log(`- Folders with UNEXTRACTED ZIPs inside: ${unextractedZipCount}`);
    console.log(`- Folders completely EMPTY (Drive UI): ${completelyEmptyCount}`);
    console.log(`- Other structural issues: ${otherIssueCount}`);
}
run();
