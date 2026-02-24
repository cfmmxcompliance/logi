import { initializeApp } from 'firebase/app';
import { getFirestore, collection, writeBatch, doc } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';

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

const ZIP_FILE = '1798546_solicitudes (1).zip';

// Helper to parse line (simplified from parser.ts)
const parseLine = (line, keys) => {
    const values = line.split('|');
    const obj = {};
    keys.forEach((k, i) => {
        if (values[i] !== undefined) obj[k] = values[i];
    });
    return obj;
};

async function processZip() {
    console.log(`📦 Processing ${ZIP_FILE}...`);
    const zip = new AdmZip(ZIP_FILE);
    const zipEntries = zip.getEntries();

    for (const entry of zipEntries) {
        if (!entry.entryName.endsWith('.asc')) continue;

        const fileName = entry.entryName;
        // Extract DS number: 1787939_501.asc -> ds501
        const match = fileName.match(/_(\d+)\.asc$/);
        if (!match) continue;
        const dsName = `ds${match[1]}`;

        console.log(`   Processing ${fileName} -> ${dsName}`);

        const content = zip.readAsText(entry);
        const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);

        if (lines.length === 0) continue;

        // Header detection logic from parser.ts
        let headerRow = lines[0];
        let dataStart = 1;
        let keys = [];

        if (headerRow.includes('|') && /[a-zA-Z]/.test(headerRow)) {
            keys = headerRow.split('|').map(k => k.trim());
        } else {
            // Fallback (should prevent this if header missing)
            console.warn(`   ⚠️ No header found in ${fileName}. Skipping or using index keys.`);
            continue;
        }

        console.log(`      Found ${keys.length} columns. Processing ${lines.length - 1} records...`);

        // Upload in batches
        const BATCH_SIZE = 400;
        let batch = writeBatch(db);
        let count = 0;
        let total = 0;

        for (let i = dataStart; i < lines.length; i++) {
            const record = parseLine(lines[i], keys);
            // Enrich
            record._sourceFile = fileName;
            record._uploadedAt = new Date().toISOString();

            // ID strategy: Pedimento + index? Or random?
            // Existing parser uses composite keys.
            // Using simplified random ID for manual fix or try to mimic.
            // Let's use auto-id to avoid collisions.
            const ref = doc(collection(db, dsName));
            batch.set(ref, record);

            count++;
            total++;

            if (count >= BATCH_SIZE) {
                await batch.commit();
                batch = writeBatch(db);
                count = 0;
                process.stdout.write('.');
            }
        }
        if (count > 0) await batch.commit();
        console.log(`\n      ✅ Uploaded ${total} records to ${dsName}`);
    }

    console.log("\n🚀 All files processed. Data should now be available.");
    process.exit(0);
}

processZip();
