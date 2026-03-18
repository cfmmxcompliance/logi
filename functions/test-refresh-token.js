const { google } = require("googleapis");
require("dotenv").config();

async function testToken() {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN
    });

    try {
        console.log("Attempting to refresh access token...");
        const { token } = await oauth2Client.getAccessToken();
        console.log("✅ Success! Token obtained.");

        const drive = google.drive({ version: "v3", auth: oauth2Client });
        const about = await drive.about.get({ fields: 'storageQuota' });
        console.log("Quota Info:", about.data.storageQuota);
    } catch (error) {
        console.error("❌ Failed to refresh token:", error.message);
        if (error.response) {
            console.error("Details:", error.response.data);
        }
    }
}

testToken();
