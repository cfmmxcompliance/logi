import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
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

async function simulateCleanup() {
    console.log("🔍 INICIANDO SIMULACIÓN DE SEGURIDAD (DRY RUN)...");
    const snap = await getDocs(collection(db, 'commercial_invoices'));
    const itemMap = new Map();

    snap.forEach(d => {
        const item = d.data();
        // Deterministic Key: Invoice|Part|Price
        const key = `${String(item.invoiceNo).trim().toUpperCase()}|${String(item.partNo).trim().toUpperCase()}|${Number(item.unitPrice).toFixed(6)}`;
        if (!itemMap.has(key)) itemMap.set(key, []);
        itemMap.get(key).push({ id: d.id, qty: item.qty });
    });

    const report = {
        summary: {
            totalDocs: snap.size,
            uniqueLines: itemMap.size,
            duplicateGroups: 0,
            docsToDelete: 0
        },
        conflicts: []
    };

    itemMap.forEach((docs, key) => {
        if (docs.length > 1) {
            report.summary.duplicateGroups++;
            report.summary.docsToDelete += (docs.length - 1);

            // Sorting: Deterministic ID first (has pipes '|'), then UUIDs
            docs.sort((a, b) => {
                const isDetA = a.id.includes('|');
                const isDetB = b.id.includes('|');
                if (isDetA && !isDetB) return -1;
                if (!isDetA && isDetB) return 1;
                return 0;
            });

            const [survivor, ...ghosts] = docs;
            report.conflicts.push({
                key,
                keep: survivor.id,
                delete: ghosts.map(g => g.id),
                quantities: docs.map(d => d.qty)
            });
        }
    });

    fs.writeFileSync('invoice_cleanup_report.json', JSON.stringify(report, null, 2));

    console.log("\n✅ SIMULACIÓN COMPLETADA.");
    console.log(`- Se detectaron ${report.summary.docsToDelete} "fantasmas" para borrar.`);
    console.log(`- Se mantendrán ${report.summary.uniqueLines} líneas únicas.`);
    console.log("- El reporte detallado se guardó en 'invoice_cleanup_report.json'.");

    process.exit(0);
}

simulateCleanup();
