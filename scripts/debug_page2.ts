
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

async function testPage2() {
    const fileName = '5005524 IN.pdf';
    console.log(`Extracting Page 2 ONLY from ${fileName}...`);
    const filePath = path.join(process.cwd(), fileName);
    const fileBuffer = fs.readFileSync(filePath);

    // Load PDF and extract just Page 2 (Index 1)
    const pdfDoc = await PDFDocument.load(fileBuffer);
    const page2Doc = await PDFDocument.create();
    const [page2] = await page2Doc.copyPages(pdfDoc, [1]); // Index 1 is Page 2
    page2Doc.addPage(page2);
    const base64Data = await page2Doc.saveAsBase64();

    // Use the exact same Item Prompt from geminiService
    // I will use extractGeneric but with the item prompt text manually copied/referenced or just strictly asking for items
    // Actually, geminiService.extractPedimento is complex. I'll just use extractGeneric with the text I know is in geminiService.ts
    // OR better, I can expose the prompt or just reproduce it here.

    // I'll define a prompt similar to the one in geminiService to test if it catches the items.
    const prompt = `
          Analyze this Pedimento. Extract Item/Partida details into a JSON Array "items".
          JSON Structure per item:
          {
            "secuencia": string, 
            "fraccion": string, 
            "descripcion": string, 
            "precioUnitario": number, 
            "cantidadComercial": number, 
            "unidadMedidaComercial": string,
            "cantidadTarifa": number,
            "unidadMedidaTarifa": string,
            "valorAduana": number,
            "valorComercial": number,
            "valorDolares": number,
            "paisVendedor": string,
            "paisOrigen": string
          }
          
          LAYOUT RULES (CRITICAL):
          1. **TOP ROW** (Header row of the item):
             - Contains: [Secuencia] [Fraccion] ... [Cantidad Comercial] [Unidad] [Cantidad Tarifa] ...
             - 'Cantidad Comercial': The large quantity number (e.g., "56.000").
             - **WARNING**: Do NOT extract "56.000" as a Price or Value. It is a QUANTITY.
          
          2. **VALUE ROW** (Bottom row, strictly below the Description):
             - Layout: [Valor Aduana] [Valor Comercial] [Precio Unitario]
             - 'Valor Aduana' (Left): Total Value MXN (e.g., "60.00").
             - 'Valor Comercial' (Center): Total Value MXN/USD (e.g., "60").
             - 'Precio Unitario' (Right): Unit Price (e.g., "1.07143").
          
          MATH CHECK:
          - 'Valor Comercial' MUST equal 'Cantidad Comercial' * 'Precio Unitario' (approx).
    `;

    try {
        const result = await geminiService.extractGeneric(base64Data, prompt);
        console.log("Page 2 Extraction Result:", JSON.stringify(result, null, 2));
    } catch (e) {
        console.error("Failed:", e);
    }
}

testPage2();
