import { initializeApp } from "firebase/app";
import { getFirestore, collection, writeBatch, doc, addDoc } from "firebase/firestore";
import fs from "fs";
import path from "path";
import { DS_SCHEMAS } from "./schemas_config.mjs";

const firebaseConfig = {
    apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
    authDomain: "logimaster-cfmoto.firebaseapp.com",
    projectId: "logimaster-cfmoto",
    storageBucket: "logimaster-cfmoto.firebasestorage.app",
    messagingSenderId: "924452835722",
    appId: "1:924452835722:web:11a7eedec65ba034dc7873",
    measurementId: "G-01VXE7L5C3"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const SOURCE_DIR = "/Users/alex/Downloads/logimaster (2)/1406426_Solicitudes";

async function processFile(filePath) {
    const fileName = path.basename(filePath);
    console.log(`\n📄 Processing file: ${fileName}...`);

    // Extract type (e.g., 1406426_501.asc -> 501)
    const typeMatch = fileName.match(/_([a-zA-Z0-9]+)\.asc$/);
    if (!typeMatch) {
        console.warn(`   ⚠️ Could not extract type from ${fileName}. Skipping.`);
        return;
    }
    const type = typeMatch[1];
    const collectionName = `ds${type}`;
    const schema = DS_SCHEMAS[type] || [];

    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split(/\r?\n/).filter(l => l.trim() !== "");

    if (lines.length <= 1) {
        console.log(`   - File ${fileName} is empty or only has header. Skipping.`);
        return;
    }

    // Always skip header (index 0)
    const dataLines = lines.slice(1);
    console.log(`   - Found ${dataLines.length} data records.`);

    let count = 0;
    const CHUNK_SIZE = 400;

    for (let i = 0; i < dataLines.length; i += CHUNK_SIZE) {
        const batch = writeBatch(db);
        const chunk = dataLines.slice(i, i + CHUNK_SIZE);

        chunk.forEach((rawLine, chunkIdx) => {
            const cols = rawLine.split("|"); // NO TRIM
            const record = {};

            // Determine number of columns to use
            const numCols = Math.max(cols.length, schema.length);
            const paddingDigits = numCols >= 100 ? 3 : 2;

            for (let c = 0; c < numCols; c++) {
                const colValue = cols[c] !== undefined ? cols[c] : "";
                const prefix = String(c + 1).padStart(paddingDigits, '0');
                const fieldName = schema[c] || `Col${prefix}`;
                record[`${prefix}${fieldName}`] = colValue;
            }

            // ZERO METADATA: No _tipoRegistro, no _uploadedAt, as per user request.

            // Add to batch (using addDoc style via doc Ref with auto-ID)
            const docRef = doc(collection(db, collectionName));
            batch.set(docRef, record);
            count++;
        });

        await batch.commit();
        process.stdout.write(`   - Uploaded ${count}/${dataLines.length} to ${collectionName}\r`);
    }
    console.log(`\n✅ ${fileName} processed successfully.`);
}

async function runMassReprocess() {
    const files = fs.readdirSync(SOURCE_DIR).filter(f => f.endsWith(".asc"));
    console.log(`🚀 Starting Mass Reprocess of ${files.length} files...`);

    for (const file of files) {
        const fullPath = path.join(SOURCE_DIR, file);
        try {
            await processFile(fullPath);
        } catch (e) {
            console.error(`❌ Error processing ${file}:`, e.message);
        }
    }
    console.log("\n✨ MASS REPROCESS COMPLETED.");
}

runMassReprocess().then(() => process.exit(0));
