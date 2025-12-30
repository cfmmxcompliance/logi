
import { geminiService } from '../services/geminiService';
import * as fs from 'fs';
import * as path from 'path';

// Load Env
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf-8');
    envConfig.split('\n').forEach(line => {
        const parts = line.split('=');
        if (parts.length >= 2) process.env[parts[0].trim()] = parts.slice(1).join('=').trim();
    });
}
if (process.env.VITE_GEMINI_API_KEY) process.env.API_KEY = process.env.VITE_GEMINI_API_KEY;

async function runSingleTarget() {
    const fileName = '5005524 IN.pdf';
    console.log(`Processing ${fileName} with refined column logic...`);
    const fileBuffer = fs.readFileSync(path.join(process.cwd(), fileName));
    const base64Data = fileBuffer.toString('base64');

    try {
        const result = await geminiService.extractPedimento(base64Data, 'application/pdf');

        // Print Item 1 for quick verification
        if (result.items && result.items.length > 0) {
            console.log("Item 1 Result:", JSON.stringify(result.items[0], null, 2));
        } else {
            console.log("No items found.");
        }

        // Save result
        fs.writeFileSync('5005524_refined_result.json', JSON.stringify(result, null, 2));

    } catch (e) {
        console.error("Extraction failed:", e);
    }
}

runSingleTarget();
