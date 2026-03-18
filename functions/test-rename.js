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
    if (mcIdRes.data.files.length === 0) return console.log("MC not found");
    const mcFolder = mcIdRes.data.files[0];

    const expRes = await drive.files.list({
        q: "name = 'EXPEDIENTE-ADUANAL' and mimeType = 'application/vnd.google-apps.folder' and '" + mcFolder.id + "' in parents and trashed = false",
        fields: 'files(id, name)'
    });
    if (expRes.data.files.length === 0) return console.log("EXPEDIENTE-ADUANAL not found");

    const filesRes = await drive.files.list({
        q: "'" + expRes.data.files[0].id + "' in parents and trashed = false",
        fields: 'files(id, name)'
    });
    
    // Find pedimento
    const pedFile = filesRes.data.files.find(f => f.name.includes('A_PED.pdf'));
    if (!pedFile) return console.log("A_PED not found");

    const newName = pedFile.name.replace('.pdf', '');
    console.log(`Will rename folder '${mcFolder.name}' to '${newName}'`);
}
run();
