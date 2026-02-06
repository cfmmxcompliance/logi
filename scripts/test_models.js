import { GoogleGenAI } from "@google/genai";
import fs from 'fs';
import path from 'path';

async function main() {
    // 1. Load API Key (Quick & Dirty from .env or .env.local)
    let apiKey = process.env.VITE_GEMINI_API_KEY;

    if (!apiKey) {
        const envFiles = ['.env.local', '.env'];
        for (const file of envFiles) {
            if (fs.existsSync(file)) {
                const content = fs.readFileSync(file, 'utf8');
                const match = content.match(/VITE_GEMINI_API_KEY=(.*)/);
                if (match && match[1]) {
                    apiKey = match[1].trim();
                    console.log(`Loaded API Key from ${file}`);
                    break;
                }
            }
        }
    }

    if (!apiKey) {
        console.error("❌ CRITICAL: Could not find VITE_GEMINI_API_KEY in .env or .env.local");
        process.exit(1);
    }

    // 2. Initialize Client
    const client = new GoogleGenAI({ apiKey });

    // 3. Test Models
    const modelsToTest = [
        "gemini-2.0-flash",
        "gemini-2.0-flash-lite-preview-02-05",
        "gemini-2.0-pro-exp-02-05",
        "gemini-2.0-flash-thinking-exp-01-21",
        "gemini-2.0-flash-exp",
        "gemini-2.0-flash"
    ];

    console.log("\n🧪 Testing Available Gemini Models...\n");

    for (const model of modelsToTest) {
        process.stdout.write(`Testing [ ${model} ] ... `);
        try {
            const response = await client.models.generateContent({
                model: model,
                contents: { parts: [{ text: "Hello" }] }
            });
            console.log(`✅ OK (Response received)`);
        } catch (e) {
            console.log(`❌ FAILED`);
            console.log(`   Reason: ${e.message.split('\n')[0]}`); // Print first line of error
        }
    }
}

main();
