
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

async function debugLayout() {
    const fileName = '5005524 IN.pdf';
    const filePath = path.join(process.cwd(), fileName);

    if (!fs.existsSync(filePath)) {
        console.error("File not found");
        return;
    }

    const fileBuffer = fs.readFileSync(filePath);
    const pdfDoc = await PDFDocument.load(fileBuffer);

    // Page 1 (index 1) usually has the first items
    const debugDoc = await PDFDocument.create();
    const [page] = await debugDoc.copyPages(pdfDoc, [1]);
    debugDoc.addPage(page);

    const base64Chunk = await debugDoc.saveAsBase64();

    // Ask Gemini to dump the raw text structure line by line
    const debugPrompt = `
      Analyze this Pedimento page (Rows of Items).
      1. Extract the text of the first 3 item rows.
      2. For the first item (Secuencia 1), identify strictly:
         - The value "224" (Quantity?)
         - The value "121" (Commercial Value?)
         - The value "6.72" (Dollar Value or Cantidad Tarifa?)
         - The value "0.54..." (Unit Price?)
      3. Tell me which COLUMN header sits above "224" and "121".
      
      Return JSON: {
         "raw_text_dump_first_item": string,
         "interpretation": {
            "224_location": string,
            "121_location": string,
            "6.72_location": string
         }
      }
    `;

    console.log("Analyzing layout...");
    const result = await geminiService.extractGeneric(base64Chunk, debugPrompt);
    console.log(JSON.stringify(result, null, 2));
}

debugLayout();
