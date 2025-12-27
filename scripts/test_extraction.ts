
import { geminiService } from '../services/geminiService.ts';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Mock process.env
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
        const [key, val] = line.split('=');
        if (key && val) process.env[key.trim()] = val.trim();
    });
}

// Fallback if needed
if (!process.env.API_KEY) {
    if (process.env.GEMINI_API_KEY) process.env.API_KEY = process.env.GEMINI_API_KEY;
    if (process.env.VITE_GEMINI_API_KEY) process.env.API_KEY = process.env.VITE_GEMINI_API_KEY;
}

const analyzeFile = async (filename: string) => {
    try {
        const filePath = path.resolve(process.cwd(), filename);
        if (!fs.existsSync(filePath)) {
            console.error(`File not found: ${filePath}`);
            return;
        }

        const fileBuffer = fs.readFileSync(filePath);
        const base64 = fileBuffer.toString('base64');

        console.log(`Analyzing ${filename}...`);
        const result = await geminiService.parseShippingDocument(base64, 'application/pdf');

        console.log("--- EXTRACTION RESULT ---");
        console.log(JSON.stringify(result, null, 2));
        console.log("-------------------------");

    } catch (e) {
        console.error("Error analyzing file:", e);
    }
};

// Analyze user specific file
analyzeFile('EGLV143559711353 TLX.pdf');
