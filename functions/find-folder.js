const { google } = require("googleapis");
const path = require("path");

const PARENT_FOLDER_ID = "1j4BbW2PnZf3cdaRzADGcSMWFv3AA6nP6"; // Folder "2025"

async function findSubFolder() {
    console.log(`🔍 Searching for "por acomodar" inside 2025 (${PARENT_FOLDER_ID})...`);

    const auth = new google.auth.GoogleAuth({
        keyFile: path.join(__dirname, "service-account.json"),
        scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    });

    const drive = google.drive({ version: "v3", auth });

    try {
        const query = `'${PARENT_FOLDER_ID}' in parents and name contains 'por acomodar' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
        const response = await drive.files.list({
            q: query,
            fields: 'files(id, name, webViewLink)',
            pageSize: 10
        });

        const folders = response.data.files;
        if (folders.length > 0) {
            console.log(`✅ Found folder(s):`);
            for (const folder of folders) {
                console.log(`- Name: ${folder.name}`);
                console.log(`  ID: ${folder.id}`);
                console.log(`  URL: ${folder.webViewLink}`);

                // List files inside "por acomodar"
                console.log(`\n  Listing contents of "${folder.name}":`);
                const contents = await drive.files.list({
                    q: `'${folder.id}' in parents and trashed = false`,
                    fields: 'files(id, name, mimeType)',
                    pageSize: 50
                });
                if (contents.data.files.length > 0) {
                    contents.data.files.forEach(f => console.log(`    * ${f.name} (${f.id})`));
                } else {
                    console.log("    (Folder is empty)");
                }
            }
        } else {
            console.log("❌ No folder named 'por acomodar' was found inside 2025.");
        }
    } catch (error) {
        console.error("🔥 Error searching Drive:", error.message);
    }
}

findSubFolder();
