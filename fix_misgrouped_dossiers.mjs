
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, doc, deleteDoc, setDoc, getDoc } from 'firebase/firestore';
import fs from 'fs';

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

// --- LOGIC ---
function extractPedimentoNumber(name) {
    if (!name) return null;
    let s = name.toString().replace(/202[3-9]/g, '____'); // Mask years 2023-2029

    // 1. Try 14-15 digits (Full Pedimento)
    // Sometimes padding is missing (e.g. 19251606000041 is 14 digits)
    const mFull = s.match(/\d{14,15}/);
    if (mFull) return mFull[0];

    // 2. Try 7 digits (isolated)
    // Avoid sequences that look like dates or partials of alphanumeric IDs (e.g. 0438261CII788)
    // Must not be preceded or followed by a word character (letter or number) or underscore
    // We use \w which includes [A-Za-z0-9_]. But we want to allow underscores?
    // Filename: Acuse_MC0256-26_0438261CII788.pdf
    // 0438261 is preceded by _. _ is \w. So (?<!\w) would fail if it starts with _.
    // Wait, 0438261 starts after _.
    // If I use (?<!\d), it matches because _ is not digit.
    // I want to ensure it is NOT part of a mixed alphanumeric string.
    // So if followed by [A-Z], it should FAIL.
    // If preceded by [A-Z], it should FAIL.

    // Regex: (?<![A-Za-z0-9])\d{7}(?![A-Za-z0-9])

    const m7 = s.match(/(?<![A-Za-z0-9])\d{7}(?![A-Za-z0-9])/);
    if (m7) return m7[0];

    return null;
}

// Cache for target dossiers to avoid excessive reads
const targetCache = new Map(); // pedimentoNo -> docRef or null

async function getOrCreateTarget(pedimentoNo) {
    if (targetCache.has(pedimentoNo)) return targetCache.get(pedimentoNo);

    // Search
    let qSnapshot = await getDocs(collection(db, 'electronic_dossiers'));
    let found = qSnapshot.docs.find(d => {
        const p = d.data().numPedimento || "";
        return p.replace(/\s+/g, '') === pedimentoNo || p.endsWith(pedimentoNo);
    });

    if (found) {
        targetCache.set(pedimentoNo, found);
        return found;
    }

    // Create new
    // Default prefix logic
    let finalNo = pedimentoNo;
    /* User logic preference: 
       If 7 digits, UI pads it. Database can store 7.
       But we want to be clean. Let's store what we found.
    */

    // Check if we should auto-pad for new creations?
    // User likes 26 16 3471. But let's stick to the extracted number to be safe.

    // We can't easily CREATE waiting for ID.
    // We'll create a doc with auto-ID
    const newRef = doc(collection(db, 'electronic_dossiers'));
    await setDoc(newRef, {
        numPedimento: finalNo,
        items: [],
        financials: null,
        lastUpdate: new Date().toISOString(),
        status: 'Parcial'
    });

    // Fetch it back roughly (or fake it)
    const newSnap = await getDoc(newRef);
    targetCache.set(pedimentoNo, newSnap);
    return newSnap;
}

async function fix() {
    console.log("🛠️ STARTING EXPLOSION REPAIR...");

    const snap = await getDocs(collection(db, 'electronic_dossiers'));
    const allDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Backup
    fs.writeFileSync('dossier_backup.json', JSON.stringify(allDocs, null, 2));
    console.log(`📦 Backup saved to dossier_backup.json (${allDocs.length} docs).`);

    let movedCount = 0;

    // We need to iterate all items.
    // If we move an item, we remove it from Source and add to Target.
    // To do this safely, we'll build a "Plan" first.

    const moves = []; // { item, fromId, toPedimento }

    for (const docData of allDocs) {
        const currentPed = (docData.numPedimento || "").replace(/\s+/g, '');
        const items = docData.items || [];

        for (const item of items) {
            const extracted = extractPedimentoNumber(item.name);

            if (extracted) {
                // Check if belongs
                const isMatch = currentPed === extracted || currentPed.endsWith(extracted) || extracted.endsWith(currentPed);

                if (!isMatch) {
                    // Start of mismatch logic.
                    // But wait, what if extracted is "6400255" and current is "261634716400255"?
                    // EndsWith handles that.

                    // What if extracted is "1234567" and current is "6400266"?
                    // Mismatch. Move it.
                    moves.push({ item, fromId: docData.id, toPedimentos: extracted });
                }
            }
        }
    }

    console.log(`📋 Found ${moves.length} items that need moving.`);

    if (moves.length === 0) {
        console.log("✅ No misgrouped files found based on filenames.");
        process.exit(0);
    }

    // Execute Moves
    // We need to group moves by Source and Target to minimize writes.
    // But Target creation depends on order.

    // Let's process sequentially for safety.

    for (const move of moves) {
        const { item, fromId, toPedimentos } = move;

        // 1. Get Target
        const targetDoc = await getOrCreateTarget(toPedimentos);

        // 2. Add to Target (if not exists)
        const targetData = targetDoc.data();
        let targetItems = targetData.items || [];

        // Dedupe check
        if (!targetItems.some(i => i.driveId === item.driveId || i.name === item.name)) {
            targetItems.push(item);
            await updateDoc(targetDoc.ref, {
                items: targetItems,
                lastUpdate: new Date().toISOString()
            });
            console.log(` -> Moved ${item.name} to ${toPedimentos}`);
        }

        // 3. Remove from Source
        const sourceDocRef = doc(db, 'electronic_dossiers', fromId); // We assume source exists
        // We need to verify source still has it (we might have moved it already?)
        // Better: Read source fresh? No, expensive.
        // We will perform batch updates at the end? No.

        // Real-time update of source
        // This is slow but safe.
        // Optimization: We can just ignore source update here and do a "cleanup pass" at the end?
        // No, let's do atomic-ish updates.

        // We'll trust Firestore transaction? Too complex.
        // Let's just update source.
        const sourceSnap = await getDoc(sourceDocRef);
        if (sourceSnap.exists()) {
            const sData = sourceSnap.data();
            const newSItems = (sData.items || []).filter(i => i.driveId !== item.driveId);
            if (newSItems.length !== (sData.items || []).length) {
                await updateDoc(sourceDocRef, { items: newSItems });
            }
        }

        movedCount++;
    }

    // Cleanup empty docs
    console.log("🧹 Cleaning up empty dossiers...");
    const finalSnap = await getDocs(collection(db, 'electronic_dossiers'));
    let deleted = 0;
    for (const d of finalSnap.docs) {
        if (!d.data().items || d.data().items.length === 0) {
            await deleteDoc(d.ref);
            console.log(`Deleted empty: ${d.id}`);
            deleted++;
        }
    }

    console.log("--- DONE ---");
    console.log(`Moves: ${movedCount}`);
    console.log(`Deleted Empty Docs: ${deleted}`);
    process.exit(0);
}

fix().catch(console.error);
