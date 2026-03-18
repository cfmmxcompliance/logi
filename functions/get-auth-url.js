const { google } = require("googleapis");
require("dotenv").config();

async function getAuthUrl() {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        "urn:ietf:wg:oauth:2.0:oob" // Special redirect for terminal apps
    );

    const scopes = [
        "https://www.googleapis.com/auth/drive"
    ];

    const url = oauth2Client.generateAuthUrl({
        access_type: "offline",
        scope: scopes,
        prompt: "consent"
    });

    console.log("🔗 Authorization URL:");
    console.log(url);
    console.log("\n1. Visit the URL above in your browser.");
    console.log("2. Authorize the application.");
    console.log("3. Copy the 'Code' provided by Google and paste it here.");
}

getAuthUrl();
