const { google } = require("googleapis");
require("dotenv").config();

async function run() {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const drive = google.drive({ version: "v3", auth: oauth2Client });

    const mcIdRes = await drive.files.list({
        q: "name = 'MC0351-26' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
        fields: 'files(id, name)'
    });
    
    if (mcIdRes.data.files.length === 0) return console.log("Not found");
    const mcId = mcIdRes.data.files[0].id;
    
    const expRes = await drive.files.list({
        q: `name = 'EXPEDIENTE-ADUANAL' and mimeType = 'application/vnd.google-apps.folder' and '${mcId}' in parents and trashed = false`,
        fields: 'files(id, name)'
    });
    if (expRes.data.files.length === 0) return console.log("EXP not found");
    const expId = expRes.data.files[0].id;

    const filesRes = await drive.files.list({
        q: `'${expId}' in parents and trashed = false`,
        fields: 'files(id, name)'
    });
    
    console.log("Files in EXPEDIENTE-ADUANAL:");
    filesRes.data.files.forEach(f => console.log(" - " + f.name));
}
run();
