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

async function auditInvoices() {
    console.log("🔍 Auditando facturas comerciales...");
    const snap = await getDocs(collection(db, 'commercial_invoices'));
    const itemMap = new Map(); // Key -> List of IDs

    snap.forEach(d => {
        const item = d.data();
        // Deterministic Key matching CIExtractor logic
        const key = `${String(item.invoiceNo).trim().toUpperCase()}|${String(item.partNo).trim().toUpperCase()}|${Number(item.unitPrice).toFixed(6)}`;
        if (!itemMap.has(key)) itemMap.set(key, []);
        itemMap.get(key).push({ id: d.id, qty: item.qty });
    });

    let duplicatesFound = 0;
    itemMap.forEach((docs, key) => {
        if (docs.length > 1) {
            console.log(`❌ DUPLICADO detectado para: ${key}`);
            docs.forEach(doc => console.log(`   - ID: ${doc.id} | Qty: ${doc.qty}`));
            duplicatesFound++;
        }
    });

    console.log(`\n📊 Resumen:`);
    console.log(`- Documentos totales: ${snap.size}`);
    console.log(`- Lineas únicas (Factura|Parte|Precio): ${itemMap.size}`);
    console.log(`- Grupos con duplicados: ${duplicatesFound}`);
    process.exit(0);
}

auditInvoices();
