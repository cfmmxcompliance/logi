
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

async function testGranular() {
    const fileName = '5005243 IN.pdf';
    console.log(`Testing granular extraction on ${fileName}...`);
    const filePath = path.join(process.cwd(), fileName);

    if (!fs.existsSync(filePath)) {
        console.error("File not found");
        return;
    }

    const fileBuffer = fs.readFileSync(filePath);
    const base64Data = fileBuffer.toString('base64');

    try {
        const result = await geminiService.extractPedimento(base64Data, 'application/pdf');

        if (result.items && result.items.length > 0) {
            console.log("Item 1 Result:", JSON.stringify(result.items[0], null, 2));
            // Check specific new fields
            const item1 = result.items[0];
            console.log(`check_cantidadTarifa: ${item1.cantidadTarifa}`);
            console.log(`check_paisVendedor: ${item1.paisVendedor}`);
        } else {
            console.log("No items found.");
        }

        // Save for review
        fs.writeFileSync('55243_granular_test.json', JSON.stringify(result, null, 2));

    } catch (e) {
        console.error("Extraction failed:", e);
    }
}

testGranular();
