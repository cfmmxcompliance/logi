import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { google } from 'googleapis';

// --- CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
    authDomain: "logimaster-cfmoto.firebaseapp.com",
    projectId: "logimaster-cfmoto",
    storageBucket: "logimaster-cfmoto.firebasestorage.app",
    messagingSenderId: "924452835722",
    appId: "1:924452835722:web:11a7eedec65ba034dc7873",
    measurementId: "G-01VXE7L5C3"
};

const DRIVE_CREDS = {
    client_id: process.env.GOOGLE_CLIENT_ID || "YOUR_CLIENT_ID",
    client_secret: process.env.GOOGLE_CLIENT_SECRET || "YOUR_CLIENT_SECRET",
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN || "YOUR_REFRESH_TOKEN"
};

const WHITELIST = [
    '261616146000509',
    '261616146000511',
    '261616146000512',
    '261616146000513',
    '261616146000514',
    '261616146000515',
    '261616146000516',
    '261616146000518',
    '261616146000510',
    '261616146000517',
    '261616146000507',
    '261616146000508'
];

const IS_DRY_RUN = process.argv.includes('--confirm') ? false : true;

// --- INITIALIZATION ---
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function getDriveClient() {
    const oauth2Client = new google.auth.OAuth2(
        DRIVE_CREDS.client_id,
        DRIVE_CREDS.client_secret,
        "http://localhost:3000"
    );
    oauth2Client.setCredentials({ refresh_token: DRIVE_CREDS.refresh_token });
    return google.drive({ version: "v3", auth: oauth2Client });
}

const drive = getDriveClient();

async function deleteDriveFile(fileId) {
    if (IS_DRY_RUN) {
        console.log(`   [DRY-RUN] Would delete Drive File: ${fileId}`);
        return;
    }
    try {
        await drive.files.delete({ fileId });
        console.log(`   [DRIVE] Deleted File: ${fileId}`);
    } catch (e) {
        console.error(`   [DRIVE-ERROR] Failed to delete ${fileId}:`, e.message);
    }
}

async function cleanupDossiers() {
    console.log(`\n📂 Target: electronic_dossiers (Restricted to photo whitelist)`);
    const snap = await getDocs(collection(db, 'electronic_dossiers'));

    let processedCount = 0;

    for (const d of snap.docs) {
        const data = d.data();
        const ped = (data.numPedimento || '').replace(/\s+/g, '');

        if (!WHITELIST.includes(ped)) continue;

        processedCount++;
        console.log(`\n📄 Checking Pedimento: ${ped}`);

        if (data.items && data.items.length > 0) {
            const uniqueItems = [];
            const seenNames = new Set();
            const toDeleteFromDrive = [];

            data.items.forEach(item => {
                if (!seenNames.has(item.name)) {
                    seenNames.add(item.name);
                    uniqueItems.push(item);
                } else {
                    console.log(`   🗑️ Duplicate Item Found: ${item.name} (DriveID: ${item.driveId})`);
                    toDeleteFromDrive.push(item.driveId);
                }
            });

            if (toDeleteFromDrive.length > 0) {
                console.log(`   ✨ Deduplicated: keeping ${uniqueItems.length} items, removing ${toDeleteFromDrive.length} duplicates.`);
                if (!IS_DRY_RUN) {
                    await updateDoc(doc(db, 'electronic_dossiers', d.id), { items: uniqueItems });
                    for (const id of toDeleteFromDrive) await deleteDriveFile(id);
                } else {
                    console.log(`   [DRY-RUN] Whitelisted: Would update Firestore and delete ${toDeleteFromDrive.length} files from Drive.`);
                }
            } else {
                console.log("   ✅ No duplicates found in this dossier.");
            }
        }
    }
    console.log(`\n📊 Processed ${processedCount} dossiers from whitelist.`);
}

async function main() {
    console.log(IS_DRY_RUN ? "--- RUNNING IN DRY-RUN MODE (TARGETED) ---" : "--- RUNNING IN PRODUCTION MODE (WHITELIST ONLY) ---");

    await cleanupDossiers();

    console.log("\n✨ Cleanup finished.");
    process.exit(0);
}

main().catch(console.error);
