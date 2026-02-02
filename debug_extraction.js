import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, doc, query, where } from 'firebase/firestore';
import { google } from 'googleapis';
import { GoogleGenAI } from "@google/genai";

const SERVICE_ACCOUNT_KEY_FILE = 'functions/service-account.json';
const GEMINI_API_KEY = "AIzaSyCecQI8jFglWgIQxaDK3OFWbfpmKOR-bYw";

const firebaseConfig = {
    apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
    authDomain: "logimaster-cfmoto.firebaseapp.com",
    projectId: "logimaster-cfmoto",
    storageBucket: "logimaster-cfmoto.firebasestorage.app",
    messagingSenderId: "924452835722",
    appId: "1:924452835722:web:11a7eedec65ba034dc7873"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const auth = new google.auth.GoogleAuth({
    keyFile: SERVICE_ACCOUNT_KEY_FILE,
    scopes: ['https://www.googleapis.com/auth/drive.readonly']
});
const drive = google.drive({ version: 'v3', auth });

async function extractWithGemini(fileBuffer, fileName, mimeType) {
    const prompt = `
    You are a specialized data extractor for Mexican Customs Documents (Pedimentos).
    Extract specific financial metadata from the provided Document (${fileName}).
    
    RETURN ONLY RAW JSON.
    
    Fields to Extract:
    - pedimentoNum
    - montoPagado
    - valorAduana (Also look for "Valor Aduana", "Valor en Aduana", "Valor Comercial", "Valor Dolares" - prioritize Valor Aduana)
    - iva
    - dta
    - igi
    - prv
    - fechaPago
    - banco (Bank Name)
    `;

    const parts = [{ text: prompt }];

    if (mimeType === 'application/pdf') {
        parts.push({
            inlineData: {
                mimeType: 'application/pdf',
                data: fileBuffer.toString('base64')
            }
        });
    }

    try {
        console.log("SENDING TO GEMINI...");
        const response = await genAI.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: { parts }
        });

        console.log("--- RAW GEMINI RESPONSE ---");
        console.log(response.text);
        console.log("---------------------------");

        return response.text;
    } catch (e) {
        console.error("   🧠 Gemini Error:", e.message);
        return null;
    }
}

async function debugExtraction() {
    console.log("🚀 STARTING DEBUG EXTRACTION FOR 6000871...");

    const snap = await getDocs(collection(db, 'electronic_dossiers'));
    const d = snap.docs.find(doc => doc.data().numPedimento.replace(/\s+/g, '').includes("6000871"));

    if (!d) {
        console.log("Dossier not found");
        return;
    }
    const data = d.data();
    const items = data.items || [];

    let targetItem = items.find(i => i.name.toUpperCase().includes('A_PED') && i.name.toLowerCase().endsWith('.pdf'));
    if (!targetItem) targetItem = items.find(i => i.name.toUpperCase().includes('PEDIMENTO') && i.name.toLowerCase().endsWith('.pdf'));
    if (!targetItem) targetItem = items.find(i => i.name.includes('Referencia') && i.name.toLowerCase().endsWith('.pdf'));
    if (!targetItem) targetItem = items.find(i => i.name.toLowerCase().endsWith('.pdf')); // Ultimate fallback

    if (!targetItem) {
        console.log("No valid PDF found");
        console.log(items.map(i => i.name));
        return;
    }

    console.log(`Processing file: ${targetItem.name}`);

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

    await extractWithGemini(buffer, targetItem.name, 'application/pdf');
    process.exit(0);
}

debugExtraction();
