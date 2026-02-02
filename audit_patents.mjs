
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

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

const PATENTS = ['3471', '1925', '3178', '1614'];

async function auditPatents() {
    console.log("🕵️ AUDITING PATENTS IN FILENAMES...");
    const snap = await getDocs(collection(db, 'electronic_dossiers'));

    const stats = {
        '3471': 0, '1925': 0, '3178': 0, '1614': 0, 'UNKNOWN': 0
    };

    // Check distribution
    for (const d of snap.docs) {
        const ped = d.data().numPedimento;
        const items = d.data().items || [];

        const filePatents = new Set();

        items.forEach(item => {
            const name = item.name || "";
            let found = false;
            for (const p of PATENTS) {
                if (name.includes(p)) {
                    filePatents.add(p);
                    found = true;
                }
            }
            // Strict check: If not found, maybe look for known patterns?
            // "1925160..." starts with 1925.
            for (const p of PATENTS) {
                if (name.startsWith(p)) {
                    filePatents.add(p);
                    found = true;
                }
            }
        });

        const patents = Array.from(filePatents);
        console.log(`\n📂 Dossier: ${ped} (${items.length} files)`);

        if (patents.length === 0) {
            console.log(`   ❓ Unknown Patent`);
            stats['UNKNOWN']++;
        } else if (patents.length === 1) {
            console.log(`   ✅ Patent: ${patents[0]}`);
            stats[patents[0]]++;
        } else {
            console.log(`   ⚠️ MIXED PATENTS: ${patents.join(', ')}`);
        }
    }

    console.log("\n--- STATS ---");
    console.log(stats);
    process.exit(0);
}

auditPatents().catch(console.error);
