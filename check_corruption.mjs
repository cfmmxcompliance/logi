import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

async function main() {
    try {
        const firebaseConfig = {
          apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
          projectId: "logimaster-cfmoto"
        };
        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);

        const snap = await getDocs(collection(db, 'historico_expo'));
        let corruptedCount = 0;
        let restoredCount = 0;
        
        snap.forEach(d => {
            const date = d.data().pickupDayCFM;
            if (date && (date.includes('2026-06-17') || date.includes('T00:'))) {
                corruptedCount++;
            } else if (date && date.match(/^\d{4}-\d{2}-\d{2}$/)) {
                 // A valid YYYY-MM-DD date implies it was restored successfully from asignacion_cajas
                 restoredCount++;
            }
        });
        
        console.log(`Corrupted records remaining: ${corruptedCount}`);
        console.log(`Records correctly formatted as YYYY-MM-DD: ${restoredCount}`);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
main();
