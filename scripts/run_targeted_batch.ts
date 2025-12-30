
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

async function runTargetedBatch() {
    // Re-run on 5005524 and 5005541 to verify calculated fields
    const targetFiles = ['5005524 IN.pdf', '5005541 IN.pdf'];
    const results = [];

    for (const fileName of targetFiles) {
        const filePath = path.join(process.cwd(), fileName);
        if (!fs.existsSync(filePath)) {
            console.warn(`File not found: ${fileName}`);
            continue;
        }

        console.log(`Processing ${fileName}...`);
        const fileBuffer = fs.readFileSync(filePath);
        const base64Data = fileBuffer.toString('base64');

        try {
            const result = await geminiService.extractPedimento(base64Data, 'application/pdf');
            results.push({
                "0": result,
                "fileName": fileName
            });
            console.log(`Success: ${fileName} - Items: ${result.items?.length || 0}`);

            // Brief delay
            await new Promise(r => setTimeout(r, 2000));

        } catch (e) {
            console.error(`Failed ${fileName}:`, e);
        }
    }

    // Save targeted results
    fs.writeFileSync('targeted_batch_results.json', JSON.stringify({ results }, null, 2));
    console.log("Targeted batch complete. Saved to targeted_batch_results.json");
}

runTargetedBatch();
