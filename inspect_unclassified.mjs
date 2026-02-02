import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where } from "firebase/firestore";
import fs from 'fs';

const firebaseConfig = {
    apiKey: "AIzaSyC...", // I should find the real config
};

// I'll read the real config from the codebase
const configContent = fs.readFileSync('./services/firebaseConfig.ts', 'utf8');
const apiKeyMatch = configContent.match(/apiKey:\s*"([^"]+)"/);
const authDomainMatch = configContent.match(/authDomain:\s*"([^"]+)"/);
const projectIdMatch = configContent.match(/projectId:\s*"([^"]+)"/);
const storageBucketMatch = configContent.match(/storageBucket:\s*"([^"]+)"/);
const messagingSenderIdMatch = configContent.match(/messagingSenderId:\s*"([^"]+)"/);
const appIdMatch = configContent.match(/appId:\s*"([^"]+)"/);

const config = {
    apiKey: apiKeyMatch?.[1],
    authDomain: authDomainMatch?.[1],
    projectId: projectIdMatch?.[1],
    storageBucket: storageBucketMatch?.[1],
    messagingSenderId: messagingSenderIdMatch?.[1],
    appId: appIdMatch?.[1]
};

const app = initializeApp(config);
const db = getFirestore(app);

async function inspect() {
    console.log("--- EXPEDIENTES POR CLASIFICAR ---");
    const q = query(collection(db, 'electronic_dossiers'));
    const snap = await getDocs(q);

    const unclassified = snap.docs.filter(d => (d.data().numPedimento || "").includes('POR_CLASIFICAR'));

    if (unclassified.length === 0) {
        console.log("No se encontraron expedientes POR_CLASIFICAR.");
        return;
    }

    unclassified.forEach(doc => {
        const data = doc.data();
        console.log(`\n📂 ID: ${doc.id} | Pedimento: ${data.numPedimento}`);
        console.log(`   Archivos (${data.items?.length || 0}):`);
        data.items?.forEach((it, i) => {
            console.log(`   [${i}] ${it.name} (Drive: ${it.driveId})`);
        });
    });

    console.log("\n--- BUSCANDO POSIBLES DESTINOS (9 digits or more) ---");
    const totals = snap.docs.filter(d => !(d.data().numPedimento || "").includes('POR_CLASIFICAR'));
    console.log(`Expedientes válidos encontrados: ${totals.length}`);
    totals.slice(0, 5).forEach(d => console.log(` - ${d.data().numPedimento}`));
}

inspect().catch(console.error);
