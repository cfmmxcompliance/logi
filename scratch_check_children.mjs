import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({
  credential: applicationDefault(),
  projectId: 'logimaster-cfmoto'
});

const db = getFirestore(app);

async function check() {
    console.log("Checking children for SNLU142065 and TL00120260903...");
    const collections = await db.listCollections();
    for (const coll of collections) {
        const q1 = coll.where('numeroCaja', '==', 'SNLU142065');
        const s1 = await q1.get();
        s1.forEach(doc => console.log(`Found SNLU142065 in ${coll.id}:`, doc.id));
        
        const q2 = coll.where('asignacionCajaId', '==', 'TL00120260903');
        const s2 = await q2.get();
        s2.forEach(doc => console.log(`Found TL00120260903 in ${coll.id}:`, doc.id, doc.data().numeroCaja));
    }
}
check().then(() => process.exit(0));
