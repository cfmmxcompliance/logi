const { google } = require("googleapis");
const path = require("path");

const DEEP_FOLDER_ID = "1zm3SQGzuxPa1GvNxD7Nu19XtVB5MYC2F"; // MC0409-26

async function listDeepFolder() {
    const keyPath = path.join(__dirname, "service-account.json");
    const auth = new google.auth.GoogleAuth({
        keyFile: keyPath,
        scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    });

    try {
        const authClient = await auth.getClient();
        const drive = google.drive({ version: "v3", auth: authClient });

        console.log(`🔍 Listing ALL items in DEEP folder (${DEEP_FOLDER_ID})...`);
        const response = await drive.files.list({
            q: `'${DEEP_FOLDER_ID}' in parents and trashed = false`,
            fields: 'files(id, name, mimeType)',
            pageSize: 50
        });

        const files = response.data.files;
        if (files.length > 0) {
            console.log(`Found ${files.length} items:`);
            files.forEach(f => {
                console.log(`- ${f.name} (${f.id}) [${f.mimeType}]`);
            });
        } else {
            console.log("No items found in this folder.");
        }
    } catch (error) {
        console.error("🔥 Error:", error.message);
    }
}

listDeepFolder();
