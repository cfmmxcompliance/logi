import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';

async function main() {
    try {
        const firebaseConfig = {
          apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
          projectId: "logimaster-cfmoto"
        };
        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);

        const snap = await getDocs(collection(db, 'historico_expo'));
        let docs = snap.docs.map(d => ({id: d.id, ...d.data()}));
        
        let countRestored = 0;
        let countFailed = 0;
        
        for (const record of docs) {
            // Check if it was corrupted by the patch script
            // The corrupted script set pickupDayCFM to an ISO string like '2026-06-17T00:27...' or similar
            if (record.pickupDayCFM && (record.pickupDayCFM.includes('2026-06-17') || record.pickupDayCFM.includes('T00:'))) {
                
                let restoredDate = null;
                
                // If it was created from an asignacion (has 'exp_' prefix)
                if (record.id.startsWith('exp_')) {
                    const asigId = record.id.replace('exp_', '');
                    try {
                        const asigDoc = await getDoc(doc(db, 'asignacion_cajas', asigId));
                        if (asigDoc.exists() && asigDoc.data().fecha) {
                            restoredDate = asigDoc.data().fecha; // e.g. '2026-05-18'
                        }
                    } catch (e) {
                        // ignore error
                    }
                } 
                
                // If we found a date to restore
                if (restoredDate) {
                    try {
                        await updateDoc(doc(db, 'historico_expo', record.id), {
                            pickupDayCFM: restoredDate
                        });
                        countRestored++;
                    } catch(e) {
                        countFailed++;
                    }
                } else {
                    countFailed++;
                }
            }
        }
        
        console.log(`Successfully RESTORED ${countRestored} records! Failed: ${countFailed}`);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
main();
