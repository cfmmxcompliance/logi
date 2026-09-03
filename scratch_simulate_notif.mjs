import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({
  credential: applicationDefault(),
  projectId: 'logimaster-cfmoto'
});

const db = getFirestore(app);

async function simulate() {
    console.log("Injecting a test notification to notificaciones_expo...");
    
    const notifData = {
        tl: 'TL999',
        caja: 'TEST-PRUEBA',
        createdAt: new Date().toISOString(),
        leidoPor: []
    };
    
    const docRef = await db.collection('notificaciones_expo').add(notifData);
    
    console.log(`Notification created with ID: ${docRef.id}`);
}

simulate().then(() => process.exit(0)).catch(console.error);
