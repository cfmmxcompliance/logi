import fs from 'fs';
import { GoogleGenAI } from '@google/genai';

const key = process.env.VITE_GEMINI_API_KEY || 'AIzaSyA...'; // Need the actual key from .env.local
// Let's just read the key from .env.local
let apiKey = '';
try {
    const envContent = fs.readFileSync('.env.local', 'utf8');
    const match = envContent.match(/VITE_GEMINI_API_KEY=([^ \n]+)/);
    if (match) apiKey = match[1];
} catch(e) {}

const ai = new GoogleGenAI({ apiKey });

const prompt = `
    Analyze this shipping document (Bill of Lading, AWB, or Arrival Notice) EXPERTLY.
    Extract the following data into a strict JSON object:

    - bookingNo: The FULL Alphanumeric Booking/BL/MBL/HBL Number. Can be standard (e.g., "EGLV12345678") or non-standard (e.g., "NGB26041832", "C232154202").
    - vesselOrFlight: Vessel Name and Voyage.
    - etd: YYYY-MM-DD.
    - eta: YYYY-MM-DD.
    - departurePort: Port of Loading / Departure.
    - arrivalPort: Port of Discharge / Arrival.
    - shippingCompany: Carrier Name.
    - containers: Array of objects (containerNo, size, seal, pkgCount, weightKg).
    - invoiceNo: Commercial Invoice number.
    - poNumber: PO Number.
    - model: Model numbers/SKUs.

    CRITICAL INSTRUCTIONS:
    1. **EXTRACT THE BOOKING / BL NUMBER.**
       - Look for "B/L No", "Booking Ref", "Bill of Lading", "Waybill Number", "MBL", or "HBL".
       - Do NOT restrict to 4-letter carrier prefixes. Accept 3-letter prefixes (e.g., NGB), 1-letter (e.g., C), or purely alphanumeric strings if they clearly represent the BL.
       - If multiple exist, prefer the Master BL (MBL) or the most prominent one.
    2. **EXTRACT ALL CONTAINERS.**
       - Scan the ENTIRE document for standard container patterns (4 Letters + 7 Numbers, e.g. TGBU6578012).
       - Check "Marks & Numbers", "Description", and "Container No" columns.
       - CRITICAL: Some documents list containers inside the body text in the exact format "CONT_NO/SEAL_NO/SIZE" followed by "PKGS / WEIGHT / CBM". For example: "YMMU6693614/YMAW477556/40HC". You MUST extract these. Do not miss them!
    3. If multiple dates exist, use the most prominent ETD/ETA.
    4. Do NOT hallucinate. If a field is missing, return null.
`;

async function test() {
    const pdfPath = '/Users/alex/Logimaster_CFMoto/C232154202_HBL_Draft.pdf';
    const base64Data = fs.readFileSync(pdfPath).toString('base64');
    
    console.log("Calling Gemini...");
    const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: { parts: [{ inlineData: { mimeType: 'application/pdf', data: base64Data } }, { text: prompt }] },
        config: { responseMimeType: 'application/json' }
    });
    
    console.log("Result:");
    console.log(response.text);
}

test().catch(console.error);
