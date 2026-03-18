const { google } = require("googleapis");
require("dotenv").config();

async function exchangeCode(code) {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        "http://localhost:3000" // MUST match what was used in the URL
    );

    try {
        console.log("Exchanging code for tokens...");
        const { tokens } = await oauth2Client.getToken(code);
        console.log("✅ Success! New Refresh Token:");
        console.log("------------------------------------------");
        console.log(tokens.refresh_token);
        console.log("------------------------------------------");
        console.log("\nCopy the token above and update your .env file or tell me to do it.");
    } catch (error) {
        console.error("❌ Failed to exchange code:", error.message);
        if (error.response) console.error("Detail:", error.response.data);
    }
}

const code = process.argv[2];
if (!code) {
    console.error("Usage: node exchange-code.js <AUTH_CODE>");
    process.exit(1);
}

exchangeCode(code);
