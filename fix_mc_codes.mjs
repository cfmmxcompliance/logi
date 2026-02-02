
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';

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

async function fixMC() {
    console.log("🔧 FIXING MC CODES MAPPING...");

    // Pattern: MC followed by 4 digits.
    // e.g. Acuse_MC0162-26... -> 0162
    // Target: 640 + 0162 = 6400162

    const validDossiers = new Map();
    const snap = await getDocs(collection(db, 'electronic_dossiers'));
    for (const d of snap.docs) {
        validDossiers.set(d.id, { id: d.id, ...d.data() });
    }

    const moves = [];
    const allItems = [];

    for (const [id, data] of validDossiers) {
        const items = data.items || [];
        items.forEach(item => {
            allItems.push({ ...item, currentDossierId: id, currentDossierNum: data.numPedimento });
        });
    }

    for (const item of allItems) {
        // Regex for MC code
        // Look for "MC" followed by 4 digits
        // Could be at start or after underscore/space
        const headerMatch = item.name.match(/(?:^|[_\s-])MC(\d{4})[_\s-]/);

        if (headerMatch) {
            const digits = headerMatch[1]; // e.g. 0162
            const targetPedimento = `640${digits}`; // 6400162

            // Check if already there
            const currentSimple = item.currentDossierNum.replace(/\s+/g, ''); // 6400162
            const targetSimple = targetPedimento;

            // If current doesn't match target
            // e.g. current is 01922616 (what AI put it in)
            if (currentSimple !== targetSimple && !currentSimple.endsWith(targetSimple)) {
                // Double check user constraint: "MC0162... pertenece al pedimento 6400162"
                moves.push({
                    item,
                    targetPedimento,
                    reason: `MC${digits} -> ${targetPedimento}`
                });
            }
        }
    }

    console.log(`📋 Found ${moves.length} MC files to remap.`);

    const targetCache = new Map();

    for (const move of moves) {
        const { item, targetPedimento, reason } = move;
        console.log(` -> Moving ${item.name} to ${targetPedimento} (${reason})`);

        // Find or Create Target
        let targetDocId = null;

        // Check cache first
        if (targetCache.has(targetPedimento)) {
            targetDocId = targetCache.get(targetPedimento).id;
        } else {
            // Search DB map
            let found = null;
            for (const [id, data] of validDossiers.entries()) {
                const p = data.numPedimento.replace(/\s+/g, '');
                if (p === targetPedimento || p.endsWith(targetPedimento)) {
                    found = { id, ...data };
                    break;
                }
            }

            if (found) {
                targetDocId = found.id;
                targetCache.set(targetPedimento, found);
            } else {
                // Create
                const newRef = doc(collection(db, 'electronic_dossiers'));
                targetDocId = newRef.id;
                const newDocData = {
                    numPedimento: targetPedimento,
                    items: [],
                    financials: null,
                    lastUpdate: new Date().toISOString(),
                    status: 'Parcial'
                };
                await setDoc(newRef, newDocData);
                targetCache.set(targetPedimento, { id: targetDocId, ...newDocData });
                validDossiers.set(targetDocId, newDocData);
            }
        }

        // EXECUTE MOVE
        const targetRef = doc(db, 'electronic_dossiers', targetDocId);
        const tSnap = await getDoc(targetRef);
        if (tSnap.exists()) {
            const tData = tSnap.data();
            const tItems = tData.items || [];
            if (!tItems.some(i => i.driveId === item.driveId)) {
                const cleanItem = { ...item };
                delete cleanItem.currentDossierId;
                delete cleanItem.currentDossierNum;
                await updateDoc(targetRef, { items: [...tItems, cleanItem] });
            }
        }

        // Remove from Source
        const sourceRef = doc(db, 'electronic_dossiers', item.currentDossierId);
        const sSnap = await getDoc(sourceRef);
        if (sSnap.exists()) {
            const sData = sSnap.data();
            const sItems = sData.items || [];
            const newSItems = sItems.filter(i => i.driveId !== item.driveId);
            if (newSItems.length !== sItems.length) {
                await updateDoc(sourceRef, { items: newSItems });
            }
        }
    }

    console.log("✅ MC Fix Done.");
    process.exit(0);
}

fixMC().catch(console.error);
