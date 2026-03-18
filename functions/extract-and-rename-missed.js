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

async function run() {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const { token } = await oauth2Client.getAccessToken();
    const drive = google.drive({ version: "v3", auth: oauth2Client });

    console.log("🚀 Starting extraction and rename of the final 40 missed anomalous ZIPs...");

    const dipcFolders = await listAllFiles(drive, POR_ACOMODAR_ID, "and mimeType = 'application/vnd.google-apps.folder'");

    for (const dipc of dipcFolders) {
        const mcFolders = await listAllFiles(drive, dipc.id, "and mimeType = 'application/vnd.google-apps.folder'");
        
        for (const mc of mcFolders) {
            if (mc.name.includes('_PED') || mc.name.includes(' PED') || mc.name.includes('A_PED')) continue;
            if (!mc.name.startsWith('MC') && !mc.name.startsWith('RMC')) continue;
            
            const mcItems = await listAllFiles(drive, mc.id);
            const zips = mcItems.filter(f => f.mimeType === 'application/zip' || f.name.toLowerCase().endsWith('.zip'));
            const subfolders = mcItems.filter(f => f.mimeType === 'application/vnd.google-apps.folder');

            // Find anomalous nested 'Expense Account...zip' that were unextracted
            if (zips.length > 0 && subfolders.length === 0) {
                console.log(`\n📂 Drilling into Anomalous Folder: ${mc.name}`);
                
                const expZips = zips.filter(z => z.name.toLowerCase().includes('expense'));
                if(expZips.length === 0) continue;
                
                const zipFile = expZips[0];
                console.log(`  Downloading nested ZIP: ${zipFile.name}...`);

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
                const tempZipPath = path.join(os.tmpdir(), `temp_${Math.random().toString(36).substring(7)}.zip`);
                fs.writeFileSync(tempZipPath, Buffer.from(arrayBuffer));
                
                const zip = new AdmZip(tempZipPath);
                const entries = zip.getEntries();
                
                let newlyUploaded = 0;
                let foundPedimentoName = null;

                for (const entry of entries) {
                    if (entry.isDirectory) continue;
                    
                    const actualName = entry.name;
                    if (entry.entryName.includes('__MACOSX') || entry.entryName.includes('.DS_Store')) continue;

                    // Detect pedimento signature while extracting
                    if (actualName.includes('_PED') || actualName.includes(' A_PED')) {
                        foundPedimentoName = actualName.replace(/\.[^/.]+$/, "");
                    }

                    const targetPathArr = entry.entryName.split('/').filter(p => p.trim() !== '');
                    targetPathArr.pop();

                    const cleanParts = targetPathArr.filter(p => {
                        const lowerP = p.toLowerCase();
                        if (lowerP.includes('mc') && lowerP.includes('-26')) return false; // scrub base names
                        if (lowerP.includes('expense')) return false;
                        return true;
                    });

                    let targetFolderId = mc.id;
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

                if (fs.existsSync(tempZipPath)) fs.unlinkSync(tempZipPath);
                console.log(`  ✅ Successfully extracted ${newlyUploaded} missing files from nested ZIP.`);

                // Immediately rename if we found a pedimento
                if (foundPedimentoName) {
                    console.log(`  📝 Renaming parent folder natively to: ${foundPedimentoName}...`);
                    try {
                        await drive.files.update({
                            fileId: mc.id,
                            resource: { name: foundPedimentoName }
                        });
                        console.log("  ✅ Rename complete!");
                    } catch(e) { console.log("  ❌ Rename error:", e.message); }
                }

            }
        }
    }
}
run();
