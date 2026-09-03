import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({
  credential: applicationDefault(),
  projectId: 'logimaster-cfmoto'
});

const db = getFirestore(app);

async function check() {
    console.log("Checking for TL00120260903...");
    
    // Check possible collections
    const collections = ['transport_lines', 'truckload_assignments', 'daily_assignments', 'asignaciones_diarias', 'asignacion_diaria', 'deleted_records', 'history', 'audit_logs', 'daily_van_assignments'];
    
    for (const col of collections) {
        try {
            const docRef = db.collection(col).doc("TL00120260903");
            const docSnap = await docRef.get();
            if (docSnap.exists) {
                console.log(`Found in ${col} by ID:`, docSnap.data());
            } else {
                // Try searching by fields just in case
                const q = db.collection(col).where("id", "==", "TL00120260903");
                const querySnapshot = await q.get();
                let foundCount = 0;
                querySnapshot.forEach((doc) => {
                    console.log(`Found by query in ${col}:`, doc.id, doc.data());
                    foundCount++;
                });
            }
        } catch (e) {
            console.error(`Error querying ${col}:`, e.message);
        }
    }
}

check().then(() => process.exit(0)).catch(console.error);
