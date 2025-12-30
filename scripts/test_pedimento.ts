
import { geminiService } from '../services/geminiService';
import * as fs from 'fs';
import * as path from 'path';

const testFile = '5005237 A1.pdf';
const filePath = path.join(process.cwd(), testFile);

async function runTest() {
    // Load .env.local manually
    const envPath = path.join(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
        console.log("Loading .env.local...");
        const envConfig = fs.readFileSync(envPath, 'utf-8');
        envConfig.split('\n').forEach(line => {
            const parts = line.split('=');
            if (parts.length >= 2) {
                const key = parts[0].trim();
                const val = parts.slice(1).join('=').trim();
                process.env[key] = val;
            }
        });
        // Map VITE var to process.env.API_KEY for geminiService
        if (process.env.VITE_GEMINI_API_KEY) {
            process.env.API_KEY = process.env.VITE_GEMINI_API_KEY;
        }
    } else {
        console.warn(".env.local not found!");
    }

    try {
        console.log(`Reading file: ${filePath}`);
        if (!fs.existsSync(filePath)) {
            console.error("File not found!");
            return;
        }

        const fileBuffer = fs.readFileSync(filePath);
        const base64Data = fileBuffer.toString('base64');

        console.log("Sending to Gemini for Extraction...");
        // Mock import.meta for the service if it tries to access it
        // The service implementation handles process.env fallback, so this should match.
        const result = await geminiService.extractPedimento(base64Data, 'application/pdf');

        console.log("---------------- EXTRACTION RESULT ----------------");
        console.log(JSON.stringify(result, null, 2));
        console.log("---------------------------------------------------");

    } catch (error) {
        console.error("Test Failed:", error);
    }
}

runTest();
