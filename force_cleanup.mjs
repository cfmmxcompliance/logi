
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, doc, deleteDoc, setDoc, getDoc } from 'firebase/firestore';

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

const TARGET_BAD_IDS = ['0438261', '3471622', '0436260']; // Added 0436260 from screenshot

async function forceClean() {
    console.log("🧹 FORCE CLEANING BAD DOSSIERS...");

    // 1. Get Target "POR_CLASIFICAR" dossier
    // We create one if not exists to dump the orphans
    let unclassifiedDoc = null;
    const qSnap = await getDocs(collection(db, 'electronic_dossiers'));

    for (const d of qSnap.docs) {
        if (d.data().numPedimento.includes('POR_CLASIFICAR')) {
            unclassifiedDoc = d;
            break;
        }
    }

    if (!unclassifiedDoc) {
        console.log("Creating new POR_CLASIFICAR dossier...");
        const newRef = doc(collection(db, 'electronic_dossiers'));
        await setDoc(newRef, {
            numPedimento: "POR_CLASIFICAR_RESCUE",
            items: [],
            financials: null,
            lastUpdate: new Date().toISOString(),
            status: 'Parcial'
        });
        unclassifiedDoc = await getDoc(newRef);
    }

    const unclassifiedRef = unclassifiedDoc.ref;

    // 2. Iterate and destroy bad dossiers
    for (const d of qSnap.docs) {
        const p = d.data().numPedimento;
        // Check if explicit target OR if it starts with '0' and has 7 digits (heuristic for these bad matches)
        const isTarget = TARGET_BAD_IDS.includes(p) || (p.startsWith('0') && p.length === 7);

        if (isTarget) {
            console.log(`\n🚫 Found BAD Dossier: ${p}`);
            const items = d.data().items || [];

            if (items.length > 0) {
                console.log(`   -> Evacuating ${items.length} items to POR_CLASIFICAR...`);

                // Add to Unclassified
                // We need to read fresh unclassified data in loop (or optimistically push)
                // Safer: Just array union logic manually.

                // Re-fetch dest
                const destSnap = await getDoc(unclassifiedRef);
                const currentItems = destSnap.data().items || [];

                // Merge
                const newItems = [...currentItems, ...items];
                await updateDoc(unclassifiedRef, {
                    items: newItems,
                    lastUpdate: new Date().toISOString()
                });
            }

            console.log(`   -> Deleting dossier ${p}`);
            await deleteDoc(d.ref);
        }
    }

    console.log("✅ Done.");
    process.exit(0);
}

forceClean().catch(console.error);
