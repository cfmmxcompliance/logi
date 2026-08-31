import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const serviceAccount = require('/Users/alex/Logimaster_CFMoto/serviceAccountKey.json');

const app = initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore(app);

async function run() {
    const snapshot = await db.collection('wms_vehicles')
        .where('current_location', '==', 'L1')
        .limit(5)
        .get();
        
    let count = 0;
    for (const doc of snapshot.docs) {
        if (doc.id.includes('SIMU')) {
            await doc.ref.delete();
            console.log('Deleted', doc.id);
            count++;
        }
    }
    console.log(`Deleted ${count} simulated vehicles from L1`);
}

run().catch(console.error);
