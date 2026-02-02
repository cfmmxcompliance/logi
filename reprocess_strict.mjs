
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, doc, deleteDoc } from 'firebase/firestore';

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

// --- STRICT CLASSIFICATION LOGIC ---
function isFactura(name) {
    return /factura/i.test(name) || /invoice/i.test(name);
}

function isBL(name) {
    return / bl/i.test(name) || /bill of lading/i.test(name) || /hbl/i.test(name) || /mbl/i.test(name);
}

function isGenericEDocument(name) {
    const lower = name.toLowerCase();
    if (isFactura(name) || isBL(name)) return false;
    return lower.includes('e-document') ||
        /\d{11,13}/.test(name) ||
        / \d{1,2}\.pdf$/.test(lower) ||
        /acuse/i.test(lower);
}

function getDocType(name) {
    const n = name.toLowerCase();

    // Strict Priority Order
    // 1. XMLs (Always explicit)
    if (n.endsWith('.xml')) return 'XML';

    // 2. Specialized Documents (Regex based)
    if (isFactura(n)) return 'FACT';
    if (isBL(n)) {
        if (n.includes('hbl')) return 'HBL';
        if (n.includes('mbl')) return 'MBL';
        return 'BL';
    }

    // 3. Official VUCEM/Customs Documents
    if (n.includes('acuse')) return 'ACUSE';
    if (n.includes('ped_sim') || n.includes('pedimento_sim')) return 'PED-S';

    // 4. Pedimento Completo (Dossier)
    // STRICT: Must match D- pattern or explicit 'pedimento' name, but NOT be a simplificado
    if ((n.includes('d-') && n.includes('ped.pdf')) || n.includes('_ped_')) return 'PED-C';
    if (n.includes('pedimento') && !n.includes('sim')) return 'PED-C';

    // 5. Logistics Misc
    if (n.includes('carta') || n.includes('instrucc')) return 'CARTA';
    if (n.includes('lista') || n.includes('packing')) return 'LISTA';
    if (n.includes('editorial')) return 'EDIT';

    // 6. Generic E-Documents (Last Resort)
    if (isGenericEDocument(n)) return 'EDOC';

    return 'DOC';
}

function deduplicateItems(items) {
    const seen = new Set();
    return items.filter(it => {
        const id = it.driveId || it.name;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
    });
}

async function reprocess() {
    console.log("🚀 Starting STRICT REPROCESS from Terminal...");
    const snap = await getDocs(collection(db, 'electronic_dossiers'));
    console.log(`Found ${snap.size} dossiers.`);

    let processed = 0;
    let deleted = 0;
    let errors = 0;

    for (const dossierDoc of snap.docs) {
        const data = dossierDoc.data();
        const originalItems = data.items || [];
        const cleanItems = deduplicateItems(originalItems);

        if (cleanItems.length === 0) {
            console.log(`🗑️ Deleting empty dossier: ${data.numPedimento} (${dossierDoc.id})`);
            await deleteDoc(doc(db, 'electronic_dossiers', dossierDoc.id));
            deleted++;
            continue;
        }

        // Re-classify logic: We don't change the items themselves unless we want to ADD a 'type' field to the object?
        // ExpedienteElectronico.tsx calculates type ON THE FLY using vucemAutomation.getDocType(item.name).
        // So we don't strictly *need* to update the DB items unless we want to persist the type.
        // BUT, deduplication is critical.
        // Also, maybe we want to normalize specific names? (Flash might have renamed files?)
        // Assuming file names are from Drive/Storage and correct.

        // Check for duplicates in DB (Fragmentation check)
        // If we find dossiers with same numPedimento, we merge them.

        // This script focuses on CLEANUP (Deduplication) and STATUS UPDATE.
        // We can optionally recalculate 'status' here too if we want, but UI does it effectively.

        // IMPORTANT: The user said "111 -> 86".
        // Let's print if we see duplicates.

        // Let's just update the list to be clean.
        if (cleanItems.length !== originalItems.length) {
            console.log(`✨ Cleaning ${data.numPedimento}: ${originalItems.length} -> ${cleanItems.length} items.`);
            await updateDoc(doc(db, 'electronic_dossiers', dossierDoc.id), {
                items: cleanItems,
                lastUpdate: new Date().toISOString() // Touch it to refresh
            });
        }

        processed++;
    }

    console.log("--- SUMMARY ---");
    console.log(`Processed: ${processed}`);
    console.log(`Deleted (Empty): ${deleted}`);
    console.log("Done.");
    process.exit(0);
}

reprocess().catch(e => {
    console.error(e);
    process.exit(1);
});
