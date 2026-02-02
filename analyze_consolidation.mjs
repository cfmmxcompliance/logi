
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

async function analyze() {
    console.log("🔍 ANALYZING 86 DOSSIERS FOR CONSOLIDATION...");
    const snap = await getDocs(collection(db, 'electronic_dossiers'));

    let totalItems = 0;
    let dossiers = [];

    snap.forEach(doc => {
        const d = doc.data();
        const itemCount = (d.items || []).length;
        totalItems += itemCount;
        dossiers.push({ id: doc.id, pedimento: d.numPedimento, itemCount });
    });

    // Sort by item count descending to see "Mega Dossiers"
    dossiers.sort((a, b) => b.itemCount - a.itemCount);

    console.log(`\n📊 SUMMARY:`);
    console.log(`- Total Dossiers: ${dossiers.length}`);
    console.log(`- Total Files (Items): ${totalItems}`);
    console.log(`- Average Files per Dossier: ${(totalItems / dossiers.length).toFixed(1)}`);

    console.log(`\n📦 TOP 10 LARGEST DOSSIERS (Potential Merges):`);
    dossiers.slice(0, 10).forEach(d => {
        console.log(`- ${d.pedimento}: ${d.itemCount} files (ID: ${d.id})`);
    });

    console.log(`\n📉 SMALLEST DOSSIERS:`);
    dossiers.slice(-5).forEach(d => {
        console.log(`- ${d.pedimento}: ${d.itemCount} files`);
    });

    // Check for "POR_CLASIFICAR"
    const unclassified = dossiers.filter(d => d.pedimento.includes('POR_CLASIFICAR'));
    console.log(`\n⚠️ POR_CLASIFICAR Count: ${unclassified.length}`);

    process.exit(0);
}

analyze().catch(console.error);
