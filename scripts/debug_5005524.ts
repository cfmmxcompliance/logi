
import { geminiService } from '../services/geminiService';
import * as fs from 'fs';
import * as path from 'path';
import { PDFDocument } from 'pdf-lib';

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

async function debug5005524() {
    const fileName = '5005524 IN.pdf';
    const filePath = path.join(process.cwd(), fileName);

    console.log(`Debugging ${fileName}...`);
    const fileBuffer = fs.readFileSync(filePath);

    // Load PDF to extract just the first item page (Page 1, since 0 is header)
    const pdfDoc = await PDFDocument.load(fileBuffer);
    const itemPageDoc = await PDFDocument.create();
    const [page1] = await itemPageDoc.copyPages(pdfDoc, [1]); // Page 2 effectively
    itemPageDoc.addPage(page1);

    const base64Chunk = await itemPageDoc.saveAsBase64();

    // Debug Prompt: Ask for Layout Analysis
    const debugPrompt = `
      Analyze this Pedimento page. 
      1. Identify the column headers for the main Items table.
      2. Extract the first 3 rows of data exactly as you see them.
      3. For the first row, identify the value corresponding to "Valor Comercial" or "Precio Pagado" or "Valor Dolares".
      
      Return JSON: {
        "headers": string[],
        "first3Rows": string[],
        "analysis": string
      }
    `;

    console.log("Sending Analysis Request...");
    const result = await geminiService.extractGeneric(base64Chunk, debugPrompt);
    console.log("Debug Result:", JSON.stringify(result, null, 2));
}

debug5005524();
