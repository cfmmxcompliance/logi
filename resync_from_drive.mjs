
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { google } from 'googleapis';

// --- CONFIGURATION ---
const CREDENTIALS = {
    clientId: process.env.GOOGLE_CLIENT_ID || "YOUR_CLIENT_ID",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "YOUR_CLIENT_SECRET",
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN || "YOUR_REFRESH_TOKEN"
};

const ROOT_FOLDER_ID = "1C0ZqlwV0KMKoD2TziEoXeu_X5E_0UXZw"; // From test-drive.js

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

// --- DRIVE SETUP (Service Account Fallback) ---
// We try to use the service account found in functions/service-account.json
const auth = new google.auth.GoogleAuth({
    keyFile: 'functions/service-account.json',
    scopes: ['https://www.googleapis.com/auth/drive']
});
const drive = google.drive({ version: 'v3', auth });

// --- MAIN FUNCTION ---
async function resync() {
    console.log("🚀 STARTING DRIVE RESYNC (The 'Unorthodox' Method)...");
    console.log("🔥 STEP 1: Wiping existing Firestore Data...");

    // 1. Wipe DB
    const snap = await getDocs(collection(db, 'electronic_dossiers'));
    let deleted = 0;
    const deletePromises = snap.docs.map(d => deleteDoc(d.ref));
    await Promise.all(deletePromises);
    console.log(`✅ Wiped ${snap.size} dossiers from DB.`);

    // 2. Crawl Drive
    console.log("🕷️ STEP 2: Crawling Drive Hierarchy (Year > Aduana > Patente > Pedimento)...");

    // Level 1: YEARS
    const years = await listFolders(ROOT_FOLDER_ID);
    console.log(`Found ${years.length} Year folders.`);

    let totalDossiers = 0;

    for (const yearFolder of years) {
        console.log(`\n📅 Year: ${yearFolder.name}`);

        // Level 2: ADUANAS
        const aduanas = await listFolders(yearFolder.id);

        for (const aduanaFolder of aduanas) {
            console.log(`  🏛️ Aduana: ${aduanaFolder.name}`);

            // Level 3: PATENTES
            const patentes = await listFolders(aduanaFolder.id);

            for (const patenteFolder of patentes) {
                console.log(`    📜 Patente: ${patenteFolder.name}`);

                // Level 4: PEDIMENTOS (Dossiers)
                const pedimentos = await listFolders(patenteFolder.id);
                console.log(`      Found ${pedimentos.length} Pedimentos.`);

                for (const pedFolder of pedimentos) {
                    // This IS the dossier
                    await processDossier(pedFolder, {
                        year: yearFolder.name,
                        aduana: aduanaFolder.name,
                        patente: patenteFolder.name
                    });
                    totalDossiers++;
                }
            }
        }
    }

    console.log(`\n✅ RESYNC COMPLETE. Recreated ${totalDossiers} dossiers from Drive.`);
    process.exit(0);
}

// --- HELPERS ---

async function listFolders(parentId) {
    const q = `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    let res;
    try {
        res = await drive.files.list({
            q,
            fields: 'files(id, name)',
            pageSize: 1000
        });
    } catch (e) {
        console.error(`Error listing folder ${parentId}:`, e.message);
        return [];
    }
    return res.data.files || [];
}

async function listFiles(parentId) {
    const q = `'${parentId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`;
    let res;
    try {
        res = await drive.files.list({
            q,
            fields: 'files(id, name, webViewLink, iconLink, size)', // Basic metadata
            pageSize: 1000
        });
    } catch (e) {
        console.error(`Error listing files in ${parentId}:`, e.message);
        return [];
    }
    return res.data.files || [];
}

async function processDossier(folder, context) {
    // 1. Get Files
    const driveFiles = await listFiles(folder.id);

    // 2. Map to Items
    const items = driveFiles.map(f => ({
        driveId: f.id,
        name: f.name,
        url: f.webViewLink,
        size: f.size
    }));

    // 3. Construct ID/Number
    // User wants "clean".
    // If folder name is "1925160...", use it.
    // If folder name is "8001234", use it.
    // UI will display it raw.
    const numPedimento = folder.name;

    // 4. Save to Firestore
    // Generate an ID (or use folder ID to be robust)
    await setDoc(doc(db, 'electronic_dossiers', folder.id), { // Using Folder ID as Doc ID prevents duplicates
        numPedimento: numPedimento,
        items: items,
        financials: null,
        status: items.length > 0 ? 'Parcial' : 'Vacío', // Simple logic
        lastUpdate: new Date().toISOString(),

        // Metadata for future reference (Very useful!)
        meta_year: context.year,
        meta_aduana: context.aduana,
        meta_patente: context.patente,
        drive_folder_id: folder.id
    });

    // console.log(`      + Saved ${numPedimento} (${items.length} files)`);
}

resync().catch(console.error);
