import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import { google } from 'googleapis';
import { GoogleGenAI } from "@google/genai";
import dotenv from 'dotenv';
dotenv.config();

// --- CONFIGURATION ---
const SERVICE_ACCOUNT_KEY_FILE = 'functions/service-account.json';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const firebaseConfig = {
    apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
    authDomain: "logimaster-cfmoto.firebaseapp.com",
    projectId: "logimaster-cfmoto",
    storageBucket: "logimaster-cfmoto.firebasestorage.app",
    messagingSenderId: "924452835722",
    appId: "1:924452835722:web:11a7eedec65ba034dc7873"
};

// --- INITIALIZATION ---
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// Drive Auth
const auth = new google.auth.GoogleAuth({
    keyFile: SERVICE_ACCOUNT_KEY_FILE,
    scopes: ['https://www.googleapis.com/auth/drive.readonly']
});
const drive = google.drive({ version: 'v3', auth });

async function extractWithGemini(fileBuffer, fileName, mimeType) {
    const prompt = `
    You are a specialized data extractor for Mexican Customs Documents (Pedimentos).
    Extract specific financial metadata from the provided Document (${fileName}).
    
    RETURN ONLY RAW JSON. NO MARKDOWN. NO COMMENTS.
    
    Fields to Extract:
    - pedimentoNum (String, full 15 digits if available, else 7)
    - montoPagado (Number, Total Efectivo at bottom. CRITICAL FOR R1: If "DIFERENCIAS DE CONTRIBUCIONES A NIVEL PEDIMENTO" table exists, take the total from "DIFERENCIAS TOTALES" / "EFECTIVO". It MUST match the sum of differences.)
    - valorAduana (Number, Merchandise Value / Valor Aduana)
    - iva (Number, VAT. CRITICAL FOR R1: Check "DIFERENCIAS..." table for row "IVA" or "IMPUESTO AL VALOR AGREGADO". If found, return difference. If NOT found, Return 0. Warning: Do NOT confuse DTA with IVA.)
    - dta (Number, Custom Duty. CRITICAL FOR R1: Check "DIFERENCIAS..." table for row "DTA" or "DERECHO DE TRAMITE ADUANERO". If found, return difference. Hint: Values like 444, 408 are typically DTA.)
    - igi (Number, General Import Tax. CRITICAL FOR R1: Check "DIFERENCIAS..." table for row "IGI" or "IMPUESTO GENERAL DE IMPORTACION". If found, return difference. Return 0 otherwise.)
    - prv (Number, Prevalidation. Check "DIFERENCIAS..." table. Look for "PRV" or "PREVALIDACION". If not listed, RETURN 0.)
    - ivaPrv (Number, VAT on Prevalidation. Check "DIFERENCIAS..." table for "IVA/PRV". If not listed, RETURN 0.)
    - cnt (Number, CNT / Cuota Compensatoria)
    - otrosCargos (Number, Sum of other fees)
    - fechaPago (String, YYYY-MM-DD or DD/MM/YYYY)
    - fechaEntrada (String, YYYY-MM-DD or DD/MM/YYYY)
    - supplierName (String, the main vendor)
    - supplierTaxId (String, Tax ID of supplier)
    - banco (String, Bank Name / Institucion Bancaria. DO NOT MISS THIS.)
    - lineaCaptura (String, Reference / Linea de Captura. IGNORE "NO APLICA" - if only "NO APLICA" exists, return "")
    - clavePedimento (String, The 2-character Clave, e.g., IN, A1, V1. IMPORTANT: "ITE" is the REGIMEN, not the Clave. If Regimen is ITE, the Clave is usually IN. Only return 2-character codes.)
    
    If a value is missing, use 0 for numbers and "" for strings.
    `;

    const parts = [{ text: prompt }];

    if (mimeType === 'application/pdf') {
        parts.push({
            inlineData: {
                mimeType: 'application/pdf',
                data: fileBuffer.toString('base64')
            }
        });
    } else {
        parts.push({ text: `XML Content:\n${fileBuffer.toString('utf-8').substring(0, 30000)}` });
    }

    try {
        const response = await genAI.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: { parts }
        });

        // Use response.text() as a method if it fails as property
        let text = "";
        try {
            text = (typeof response.text === 'function') ? await response.text() : response.text;
        } catch (inner) {
            text = response.response?.text() || "{}";
        }

        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
        let parsed = JSON.parse(jsonStr);
        parsed = Array.isArray(parsed) ? parsed[0] : parsed;

        // --- R1 SANITIZER ---
        // Gemini sometimes "hallucinates" the old taxes (e.g. IVA) even when instructed to look at the Differences table.
        // If we represent a Difference, the Sum of Taxes MUST equal the Monto Pagado.
        if (parsed && parsed.clavePedimento === 'R1' && parsed.montoPagado > 0) {
            const d = parsed.dta || 0;
            const i = parsed.iva || 0;
            const g = parsed.igi || 0;
            const sum = d + i + g;

            // If the sum of major taxes exceeds the total by a margin (e.g. 10 pesos), we have a ghost value.
            if (sum > parsed.montoPagado + 5) {
                console.log(`   🧹 R1 Sanitizer triggered for ${fileName}: Sum(${sum}) > Total(${parsed.montoPagado}). Cleaning...`);

                // Heuristic: If one tax equals the total, it's the winner.
                if (Math.abs(d - parsed.montoPagado) < 5) {
                    parsed.iva = 0;
                    parsed.igi = 0;
                    console.log("      -> Kept DTA, zeroed IVA/IGI.");
                } else if (Math.abs(i - parsed.montoPagado) < 5) {
                    parsed.dta = 0;
                    parsed.igi = 0;
                    console.log("      -> Kept IVA, zeroed DTA/IGI.");
                }
            }
        }

        return parsed;
    } catch (e) {
        console.error("   🧠 Gemini Error:", e.message);
        return null;
    }
}

async function startExtraction() {
    console.log("🚀 STARTING AI FINANCIAL EXTRACTION (Gemini 2.0 Flash - Multimodal) [FORCE REFRESH] ...");

    const snap = await getDocs(collection(db, 'electronic_dossiers'));
    console.log(`Found ${snap.size} dossiers.`);

    let successCount = 0;
    let failCount = 0;

    for (const d of snap.docs) {
        const data = d.data();
        // FORCE MODE: No skip check.

        const items = data.items || [];

        // INTELLIGENT FILE SELECTION STRATEGY
        // 1. A_PED PDF (Best source usually)
        let targetItem = items.find(i => i.name.toUpperCase().includes('A_PED') && i.name.toLowerCase().endsWith('.pdf'));

        // 2. Any Pedimento PDF
        if (!targetItem) targetItem = items.find(i => i.name.toUpperCase().includes('PEDIMENTO') && i.name.toLowerCase().endsWith('.pdf'));

        // 3. Any PED PDF (e.g. PED_SIM)
        if (!targetItem) targetItem = items.find(i => i.name.toUpperCase().includes('PED') && i.name.toLowerCase().endsWith('.pdf') && !i.name.toUpperCase().includes('EXPEDIENTE'));

        // 4. Pedimento XML (Rare but possible)
        if (!targetItem) targetItem = items.find(i => i.name.toUpperCase().includes('PEDIMENTO') && i.name.toLowerCase().endsWith('.xml'));

        // 5. Fallback PDF (exclude irrelevant ones)
        if (!targetItem) targetItem = items.find(i => i.name.toLowerCase().endsWith('.pdf') && !i.name.includes('Acuse') && !i.name.includes('Respuesta') && i.size > 20000);


        if (!targetItem) {
            process.stdout.write(`.`);
            continue;
        }

        console.log(`\n📄 Processing ${data.numPedimento} (File: ${targetItem.name})...`);

        try {
            // Download content
            const response = await drive.files.get({
                fileId: targetItem.driveId,
                alt: 'media'
            }, { responseType: 'stream' });

            const buffer = await new Promise((resolve, reject) => {
                let chunks = [];
                response.data.on('data', c => chunks.push(c));
                response.data.on('end', () => resolve(Buffer.concat(chunks)));
                response.data.on('error', reject);
            });

            const mimeType = targetItem.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'text/xml';
            const fins = await extractWithGemini(buffer, targetItem.name, mimeType);

            if (fins) {
                const existingFins = data.financials || {};
                const mergedFins = { ...existingFins };
                let changesCount = 0;

                Object.keys(fins).forEach(key => {
                    const newVal = fins[key];
                    const oldVal = existingFins[key];

                    // TARGETED CORRECTION: Define what needs to be fixed even if not empty
                    const isBadClave = key === 'clavePedimento' && (oldVal === 'ITE' || oldVal?.length > 2);
                    const isBadLC = key === 'lineaCaptura' && (oldVal?.includes('NO APLICA') || oldVal?.includes('SIN PAGO'));
                    const isMissingBank = key === 'banco' && (!oldVal || oldVal === '0' || oldVal === '');

                    // R1 LOGIC: If the NEW data says it's R1, we might need to update the amounts because previous extraction might have taken the full amount instead of difference.
                    // We trust the new extraction instructions to get the "DIFERENCIAS" values.
                    const isR1Update = fins.clavePedimento === 'R1' && (key === 'montoPagado' || key === 'iva' || key === 'dta' || key === 'igi' || key === 'prv');

                    const isEmpty = !oldVal || oldVal === 0 || oldVal === "0" || oldVal === "";

                    // CRITICAL FIX: For R1 updates, 0 is a valid value (it means "No extra payment"). 
                    // So we must allow 0 if isR1Update is true.
                    const hasNewData = (newVal !== undefined && newVal !== null && newVal !== "") && (isR1Update ? true : newVal !== 0);

                    if ((isEmpty || isBadClave || isBadLC || isMissingBank || isR1Update) && hasNewData) {
                        mergedFins[key] = newVal;
                        changesCount++;
                    }
                });

                if (changesCount > 0) {
                    await updateDoc(doc(db, 'electronic_dossiers', d.id), { financials: mergedFins });
                    console.log(`   ✅ Merged: +${changesCount} fields. [Prov=${fins.supplierName?.substring(0, 15)}...]`);
                    successCount++;
                } else {
                    const missingInExisting = Object.keys(fins).filter(k => !existingFins[k]);
                    console.log(`   ℹ️ No merge. AI found: ${Object.keys(fins).join(',')}. Existing missing: ${missingInExisting.join(',')}`);
                    successCount++;
                }
            } else {
                console.log(`   ⚠️ AI returned null.`);
                failCount++;
            }

        } catch (e) {
            console.error(`   ❌ Error: ${e.message}`);
            failCount++;
        }
    }

    console.log(`\n🎉 DONE. Updated: ${successCount}, Failed/Skipped: ${failCount}`);
    process.exit(0);
}

startExtraction();
