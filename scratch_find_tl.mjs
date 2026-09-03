import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({
  credential: applicationDefault(),
  projectId: 'logimaster-cfmoto'
});

const db = getFirestore(app);

async function check() {
    console.log("Searching all collections for TL00120260903 or UL53814...");
    
    const collections = await db.listCollections();
    
    for (const coll of collections) {
        // Query by id field
        const q1 = coll.where('numeroOperacion', '==', 'TL00120260903');
        const s1 = await q1.get();
        s1.forEach(doc => console.log(`Found in ${coll.id} (numeroOperacion):`, doc.id));

        const q2 = coll.where('numeroCaja', '==', 'UL53814');
        const s2 = await q2.get();
        s2.forEach(doc => console.log(`Found in ${coll.id} (numeroCaja):`, doc.id, doc.data()));
        
        // Also check if document ID is TL00120260903
        const docRef = coll.doc('TL00120260903');
        const docSnap = await docRef.get();
        if (docSnap.exists) {
            console.log(`Found in ${coll.id} by Doc ID:`, docSnap.data());
        }
    }
    
    console.log("Search complete.");
}

check().then(() => process.exit(0)).catch(console.error);
