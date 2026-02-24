import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where, limit } from 'firebase/firestore';
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

async function checkOverlap() {
    console.log(`📦 Inspecting ${ZIP_FILE} for overlap...`);
    const zip = new AdmZip(ZIP_FILE);
    const entry = zip.getEntries().find(e => e.entryName.includes('_501.asc'));

    if (!entry) {
        console.log("No ds501 found in zip.");
        process.exit(0);
    }

    const content = zip.readAsText(entry);
    const lines = content.split(/\r?\n/).slice(1, 20); // Check first 20 records
    const samplePedimentos = [];

    // Header index for Pedimento?
    // Usually: ...|Patente|Pedimento|...
    // Let's guess or parse header.
    const header = content.split(/\r?\n/)[0].split('|');
    const pedIndex = header.indexOf('Pedimento');

    if (pedIndex === -1) {
        console.log("Pedimento column not found in header.");
        process.exit(0);
    }

    lines.forEach(l => {
        const cols = l.split('|');
        if (cols[pedIndex]) samplePedimentos.push(cols[pedIndex]);
    });

    console.log(`   Sample Pedimentos: ${samplePedimentos.join(', ')}`);

    // Check DB
    let found = 0;
    for (const p of samplePedimentos) {
        const q = query(collection(db, 'ds501'), where('Pedimento', '==', p));
        const snap = await getDocs(q);
        if (!snap.empty) found++;
    }

    console.log(`   Overlap: ${found} out of ${samplePedimentos.length} samples already exist in DB.`);

    if (found === 0) {
        console.log("   ✅ Safe to upload (No overlap detected in sample).");
    } else {
        console.log("   ⚠️ Potential Duplicates detected.");
    }
    process.exit(0);
}

checkOverlap();
