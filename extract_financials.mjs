import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import { google } from 'googleapis';
import { GoogleGenAI } from "@google/genai";

// --- CONFIGURATION ---
const SERVICE_ACCOUNT_KEY_FILE = 'functions/service-account.json';
const GEMINI_API_KEY = "AIzaSyCecQI8jFglWgIQxaDK3OFWbfpmKOR-bYw"; // Updated by user 2026-02-02

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
    - montoPagado (Number, Total Efectivo at bottom)
    - valorAduana (Number, Merchandise Value / Valor Aduana)
    - iva (Number, VAT)
    - dta (Number, Custom Duty)
    - igi (Number, General Import Tax)
    - prv (Number, Prevalidation)
    - cnt (Number, CNT / Cuota Compensatoria if any)
    - fechaPago (String, look for "Fecha de Pago")
    - fechaEntrada (String, look for "Fecha de Entrada")
    - supplierName (String, the main vendor/proveedor/vendedor)
    - supplierTaxId (String, Tax ID/Tax Number of supplier)
    - banco (String, Bank Name / Institucion Bancaria)
    
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
            contents: { parts },
            config: {
                responseMimeType: 'application/json'
            }
        });

        const text = response.text || "{}";
        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(jsonStr);
        return Array.isArray(parsed) ? parsed[0] : parsed;
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

            if (fins && (fins.montoPagado > 0 || fins.iva > 0 || fins.supplierName)) {
                await updateDoc(doc(db, 'electronic_dossiers', d.id), { financials: fins });
                const totalStr = typeof fins.montoPagado === 'number' ? fins.montoPagado.toLocaleString() : fins.montoPagado;
                console.log(`   ✅ Saved: Total=$${totalStr}, IVA=$${fins.iva}, Prov=${fins.supplierName?.substring(0, 20)}...`);
                successCount++;
            } else {
                console.log(`   ⚠️ AI returned empty/zero data. (Raw: ${JSON.stringify(fins)})`);
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
