import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({
  credential: applicationDefault(),
  projectId: 'logimaster-cfmoto'
});

const db = getFirestore(app);

async function check() {
    console.log("Checking notificaciones_expo...");
    const snap = await db.collection('notificaciones_expo').orderBy('createdAt', 'desc').limit(5).get();
    
    if (snap.empty) {
        console.log("No notifications found in the database.");
    } else {
        snap.forEach(doc => {
            console.log(doc.id, doc.data());
        });
    }
}
check().then(() => process.exit(0)).catch(console.error);
