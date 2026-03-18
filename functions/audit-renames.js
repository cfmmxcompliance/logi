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

    const dipcFolders = await listAllFiles(drive, POR_ACOMODAR_ID, "and mimeType = 'application/vnd.google-apps.folder'");

    let missedFolders = [];

    for (const dipc of dipcFolders) {
        const mcFolders = await listAllFiles(drive, dipc.id, "and mimeType = 'application/vnd.google-apps.folder'");
        
        for (const mc of mcFolders) {
            // Check if it's already renamed (contains ' PED')
            if (mc.name.includes('_PED') || mc.name.includes(' PED')) continue;
            
            // If it's a raw MC folder (e.g. MC0123-26) or similar
            if (mc.name.startsWith('MC') || mc.name.startsWith('RMC')) {
                 missedFolders.push({ dipcName: dipc.name, mcFolder: mc });
            }
        }
    }
    
    console.log(`\n🔍 Found ${missedFolders.length} folders that were not renamed.`);
    
    // Look closely at the first 5 missed folders to see why
    for (let i = 0; i < Math.min(5, missedFolders.length); i++) {
        const item = missedFolders[i];
        console.log(`\nInvestigating: ${item.mcFolder.name} (inside ${item.dipcName})`);
        
        const mcItems = await listAllFiles(drive, item.mcFolder.id);
        const expFolder = mcItems.find(f => f.name === 'EXPEDIENTE-ADUANAL' && f.mimeType === 'application/vnd.google-apps.folder');
        
        if (!expFolder) {
            console.log("  ⚠️ No 'EXPEDIENTE-ADUANAL' folder found.");
            // Print what exists instead
            console.log("  📂 Root contents: ", mcItems.filter(f => f.mimeType === 'application/vnd.google-apps.folder').map(f => f.name).join(", "));
            continue;
        }

        const expItems = await listAllFiles(drive, expFolder.id);
        const peds = expItems.filter(f => f.name.toLowerCase().includes('ped'));
        
        if (peds.length === 0) {
            console.log("  ⚠️ 'EXPEDIENTE-ADUANAL' exists, but NO files contain 'ped'.");
            console.log("  📄 Files inside: ", expItems.map(f => f.name).join(", "));
        } else {
            console.log("  🔍 Found potential pedimento files:");
            peds.forEach(p => console.log(`     - ${p.name}`));
        }
    }
}
run();
