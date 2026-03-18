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

    console.log("🚀 Attempting to rename the 49 structural anomaly folders...");

    const dipcFolders = await listAllFiles(drive, POR_ACOMODAR_ID, "and mimeType = 'application/vnd.google-apps.folder'");

    let renamedCount = 0;

    for (const dipc of dipcFolders) {
        const mcFolders = await listAllFiles(drive, dipc.id, "and mimeType = 'application/vnd.google-apps.folder'");
        
        for (const mc of mcFolders) {
            // Skip already renamed 
            if (mc.name.includes('_PED') || mc.name.includes(' PED')) continue;
            if (!mc.name.startsWith('MC') && !mc.name.startsWith('RMC')) continue;
            
            // It's a missed folder. Let's look for ANY pedimento file within its entire sub-tree or DIPC level
            // For instances like MC0473-26 which contains MC0340-26 (which has the pedimento)
            
            console.log(`\n🔍 Analyzing missed folder: ${mc.name}`);
            const allItems = await getDeepFiles(drive, mc.id);
            const pedFiles = allItems.filter(f => f.name.includes('_PED') || f.name.includes(' A_PED'));

            if (pedFiles.length > 0) {
                const targetName = pedFiles[0].name.replace(/\.[^/.]+$/, "");
                console.log(`  ➡️ Found internal pedimento: ${targetName}`);
                try {
                    await drive.files.update({
                        fileId: mc.id,
                        resource: { name: targetName }
                    });
                    renamedCount++;
                    console.log(`  ✅ Successfully renamed!`);
                } catch(e) { console.error("  ❌ Error:", e.message); }
                continue;
            }

            // If absolutely no pedimento is found inside, look horizontally at sibling folders that DO have a pedimento
            // Usually, these empty folders belong to a multi-container shipment relying on the main folder's pedimento
            const siblingPeds = mcFolders.filter(f => f.name.includes('_PED') || f.name.includes(' PED'));
            if (siblingPeds.length > 0) {
                 // The sibling name IS the pedimento string!
                 // E.g. Sibling is "MC0123-26 D-3471166400123 A_PED"
                 // This folder is "MC0124-26" -> we rename it "MC0124-26 D-3471166400123 A_PED"
                 
                 const baseSig = siblingPeds[0].name.split(' ').slice(1).join(' '); // "D-347..."
                 const customTarget = `${mc.name} ${baseSig}`;
                 
                 console.log(`  ➡️ Borrowing sibling pedimento signature: ${baseSig}`);
                 try {
                    await drive.files.update({
                        fileId: mc.id,
                        resource: { name: customTarget }
                    });
                    renamedCount++;
                    console.log(`  ✅ Successfully renamed to: ${customTarget}`);
                } catch(e) { console.error("  ❌ Error:", e.message); }
            } else {
                 console.log(`  ❌ CRITICAL: No pedimento found internally OR in siblings for ${mc.name}.`);
            }
        }
    }
    console.log(`\n🎉 Total creatively renamed folders: ${renamedCount}`);
}

async function getDeepFiles(drive, folderId) {
    let all = [];
    const items = await listAllFiles(drive, folderId);
    for (const item of items) {
        if (item.mimeType === 'application/vnd.google-apps.folder') {
            const children = await getDeepFiles(drive, item.id);
            all = all.concat(children);
        } else {
            all.push(item);
        }
    }
    return all;
}

run();
