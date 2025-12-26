import { GoogleGenAI } from "@google/genai";
import { readFileSync, existsSync } from "fs";
import * as dotenv from 'dotenv';
import path from "path";
import { fileURLToPath } from "url";

// Init Environment
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const apiKey = process.env.VITE_GEMINI_API_KEY;
if (!apiKey) {
    console.error("❌ API Key not found. Check .env.local");
    process.exit(1);
}

const client = new GoogleGenAI({ apiKey });

async function testGranularity() {
    // 1. Locate User Image
    // Note: User uploaded image path from conversation history: 
    // /Users/alex/.gemini/antigravity/brain/edd178f3-4e8e-4c3e-929c-8c0d282e6d6d/uploaded_image_1766710893886.png
    const imagePath = "/Users/alex/.gemini/antigravity/brain/edd178f3-4e8e-4c3e-929c-8c0d282e6d6d/uploaded_image_1766710893886.png";

    if (!existsSync(imagePath)) {
        console.error(`❌ Target image not found at: ${imagePath}`);
        return;
    }

    console.log(`\n🔍 Testing Granular Extraction on: ${path.basename(imagePath)}`);

    // 2. Read and Encode Image
    const imageBuffer = readFileSync(imagePath);
    const base64Data = imageBuffer.toString('base64');
    const mimeType = "image/png";

    // 3. Define the PROMPT (Exact match from geminiService.ts)
    const prompt = `
        Analyze this shipping document (Bill of Lading, AWB, or Arrival Notice).
        Extract key logistics data for a Pre-Alert record.

        CRITICAL EXTRACTION FIELDS:
        1. **docType**: "BL" (Maritime) or "AWB" (Air).
        2. **bookingNo**: The main tracking number. Look for "Booking No", "B/L No", "AWB No", or "Bill of Lading No". 
        3. **vesselOrFlight**: Name of vessel and voyage, or flight number.
        4. **etd**: Estimated Time of Departure (YYYY-MM-DD).
        5. **eta**: Estimated Time of Arrival (YYYY-MM-DD).
        6. **departurePort**: Port/Airport of Loading.
        7. **arrivalPort**: Port/Airport of Discharge.
        8. **invoiceNo**: Look for "Invoice No", "Commercial Invoice", or "Ref No".
        9. **model**: Try to identify the product model.
        10. **containers**: A list of ALL containers.
            - **containerNo**: 4 letters + 6-7 digits (e.g., "TIIU4234064").
            - **size**: e.g., "40HQ", "20GP", "40HC".
            - **seal**: The seal number associated with the container.
            - **pkgCount**: Number of packages (e.g., "8" from "8PACKAGES").
            - **pkgType**: Type of package (e.g., "PACKAGES", "CTNS", "PLTS").
            - **weightKg**: Weight in KGS (e.g., "4840.000").
            - **volumeCbm**: Volume in CBM (e.g., "68.56").
            *Hint: Look for strings like "8PACKAGES/4840.000KGS/68.56CBM" or standard columnar data.*

        Return strictly a JSON object matching this interface:
        {
          "docType": "BL" | "AWB",
          "bookingNo": string,
          "vesselOrFlight": string,
          "etd": string,
          "eta": string,
          "departurePort": string,
          "arrivalPort": string,
          "invoiceNo": string,
          "model": string,
          "containers": [{ 
            "containerNo": string, 
            "size": string, 
            "seal": string,
            "pkgCount": number,
            "pkgType": string,
            "weightKg": number,
            "volumeCbm": number
          }]
        }
    `;

    console.log("   🧠 Sending prompt to Gemini 2.0 Flash Exp...");

    try {
        const response = await client.models.generateContent({
            model: 'gemini-2.0-flash-exp',
            contents: {
                parts: [{ inlineData: { mimeType, data: base64Data } }, { text: prompt }]
            },
            config: { responseMimeType: 'application/json' }
        });

        const rawText = response.text || "{}";
        const cleanText = rawText.replace(/^```json/, '').replace(/```$/, '').trim();
        const data = JSON.parse(cleanText);

        console.log("\n✅ Extraction Success!");
        console.log("-----------------------------------------");
        console.log(`📜 Booking No: ${data.bookingNo}`);
        console.log(`🚢 Vessel:     ${data.vesselOrFlight}`);
        console.log(`📦 Containers Found: ${data.containers?.length || 0}`);
        console.log("-----------------------------------------");

        if (data.containers && data.containers.length > 0) {
            console.log("\n[Granular Data Check]");
            data.containers.slice(0, 3).forEach((c, i) => {
                console.log(`   #${i + 1} ${c.containerNo}:`);
                console.log(`       - Packages: ${c.pkgCount} (${c.pkgType})`);
                console.log(`       - Weight:   ${c.weightKg} kg`);
                console.log(`       - Volume:   ${c.volumeCbm} cbm`);
            });
            if (data.containers.length > 3) console.log(`       ... and ${data.containers.length - 3} more.`);
        }

    } catch (e) {
        console.error("❌ Extraction Failed:", e);
    }
}

testGranularity();
