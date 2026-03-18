const { google } = require("googleapis");
const fs = require("fs");
const AdmZip = require("adm-zip");
const path = require("path");
const os = require("os");
const { PassThrough } = require('stream');
require("dotenv").config();

const POR_ACOMODAR_ID = "1U11VTWBfMAWJ2Pr6WibseOKgie2MNko3";

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

    const createRes = await drive.files.create({
        resource: { name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
        fields: 'id'
    });
    folderCache[key] = createRes.data.id;
    return folderCache[key];
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

// Recursively process ZIP contents in memory to gracefully handle Inception zips
async function processZipLayer(drive, mcId, mcName, zipBuffer, depth = 1) {
    const tempZipPath = path.join(os.tmpdir(), `temp_layer_${depth}_${Math.random().toString(36).substring(7)}.zip`);
    fs.writeFileSync(tempZipPath, zipBuffer);
    
    let newlyUploaded = 0;
    let foundPedimentoName = null;
    
    try {
        const zip = new AdmZip(tempZipPath);
        const entries = zip.getEntries();
        
        for (const entry of entries) {
            if (entry.isDirectory) continue;
            
            const actualName = entry.name;
            if (entry.entryName.includes('__MACOSX') || entry.entryName.includes('.DS_Store')) continue;
            
            // DEEP INCEPTION: If a zipped file is itself a zip, infinitely explode it
            if (actualName.toLowerCase().endsWith('.zip')) {
                console.log(`      ⚠️ Found nested Inception ZIP: ${actualName}... Digging deeper (Level ${depth+1})`);
                const innerResult = await processZipLayer(drive, mcId, mcName, entry.getData(), depth + 1);
                newlyUploaded += innerResult.newlyUploaded;
                if (innerResult.foundPedimentoName) foundPedimentoName = innerResult.foundPedimentoName;
                continue;
            }

            if (actualName.includes('_PED') || actualName.includes(' A_PED') || actualName.includes('SIM.pdf')) {
                foundPedimentoName = actualName.replace(/\.[^/.]+$/, "");
                if(foundPedimentoName.includes('SIM')) foundPedimentoName = mcName + " " + foundPedimentoName;
            }

            const targetPathArr = entry.entryName.split('/').filter(p => p.trim() !== '');
            targetPathArr.pop();

            const cleanParts = targetPathArr.filter(p => {
                const lowerP = p.toLowerCase();
                if (lowerP.includes('mc') && lowerP.includes('-26')) return false; 
                if (lowerP.includes('expense')) return false;
                if (lowerP.includes('factura')) return false;
                return true;
            });

            let targetFolderId = mcId;
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
                newlyUploaded++;
            } catch (e) {
                 console.error(`      ❌ Upload Error:`, e.message);
            }
        }
    } catch (err) {
        console.error(`  ❌ Failed to parse ZIP layer ${depth}:`, err.message);
    }
    
    if (fs.existsSync(tempZipPath)) fs.unlinkSync(tempZipPath);
    return { newlyUploaded, foundPedimentoName };
}

async function run() {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const { token } = await oauth2Client.getAccessToken(); // Fresh Token
    const drive = google.drive({ version: "v3", auth: oauth2Client });

    console.log("🚀 Extracting FINAL 13 edge cases (with recursive Inception ZIP handling)...");

    const targets = [
        "MC0341-26", "MC0472-26", "MC0482-26", "MC0484-26", 
        "MC0098-26", "MC0185-26", "MC0409-26", "MC0411-26",
        "MC0413-26", "MC0415-26", "MC0419-26", "MC0219-26"
    ];

    const dipcFolders = await listAllFiles(drive, POR_ACOMODAR_ID, "and mimeType = 'application/vnd.google-apps.folder'");

    for (const dipc of dipcFolders) {
        const mcFolders = await listAllFiles(drive, dipc.id, "and mimeType = 'application/vnd.google-apps.folder'");
        
        for (const mc of mcFolders) {
            
            // Allow matching base folder names, ignoring spaces
            let isTarget = false;
            for(let t of targets) {
                if(mc.name.includes(t)) {
                    isTarget = true;
                    break;
                }
            }
            if(!isTarget) continue;
            
            console.log(`\n📂 Analyzing Targeted Anomaly: ${mc.name}`);
            
            const mcItems = await listAllFiles(drive, mc.id);
            const zips = mcItems.filter(f => f.mimeType === 'application/zip' || f.name.toLowerCase().endsWith('.zip'));

            if (zips.length > 0) {
                // Find ANY zip that has "expense" regardless of capitalization or typos
                const expZips = zips.filter(z => z.name.toLowerCase().includes('expense') || z.name.toLowerCase().includes('accoun'));
                if(expZips.length === 0) continue;
                
                const zipFile = expZips[0];
                console.log(`  Downloading surface ZIP: ${zipFile.name}...`);

                const url = `https://www.googleapis.com/drive/v3/files/${zipFile.id}?alt=media`;
                let response;
                try {
                    response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
                    if (!response.ok) {
                        console.log(`  ❌ Failed to download ZIP ${response.statusText}`);
                        continue;
                    }
                } catch (err) { continue; }

                const arrayBuffer = await response.arrayBuffer();
                
                // Explode recursively
                const { newlyUploaded, foundPedimentoName } = await processZipLayer(drive, mc.id, mc.name, Buffer.from(arrayBuffer));

                console.log(`  ✅ Successfully extracted ${newlyUploaded} missing files from deep inception ZIP layers.`);

                if (foundPedimentoName) {
                    console.log(`  📝 Renaming parent folder natively to: ${foundPedimentoName}...`);
                    try {
                        await drive.files.update({
                            fileId: mc.id,
                            resource: { name: foundPedimentoName }
                        });
                        console.log("  ✅ Rename complete!");
                    } catch(e) { console.log("  ❌ Rename error:", e.message); }
                } else {
                    console.log(`  ❌ Could not find an internal A_PED or PED_SIM file inside any ZIP layer!`);
                }
            }
        }
    }
}
run();
