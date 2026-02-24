import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(
    readFileSync('./logimaster-cfmoto-a59f54d6641a.json', 'utf8')
);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function listCollections() {
    console.log("🔍 Checking all collections in Firestore...");
    try {
        const collections = await db.listCollections();
        const collectionIds = collections.map(col => col.id);
        console.log("📂 Collections found:", collectionIds.length > 0 ? collectionIds.join(', ') : "(None)");

        if (collectionIds.includes('cfdi_invoices')) {
            console.log("✅ 'cfdi_invoices' is physically present in the database.");
            const docs = await db.collection('cfdi_invoices').limit(5).get();
            console.log(`📄 Document count in 'cfdi_invoices': ${docs.size}`);
            docs.forEach(doc => console.log(`  - ${doc.id}`));
        } else {
            console.log("❌ 'cfdi_invoices' was NOT found in the list of collections.");
        }
        process.exit(0);
    } catch (error) {
        console.error("❌ Error listing collections:", error);
        process.exit(1);
    }
}

listCollections();
