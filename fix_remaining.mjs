import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, doc } from 'firebase/firestore';

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
        
        let count = 0;
        for (const record of docs) {
            if (!record.createdAt) continue;
            
            let createdStr = '';
            if (typeof record.createdAt === 'string') {
                createdStr = record.createdAt;
            } else if (typeof record.createdAt === 'number') {
                createdStr = new Date(record.createdAt).toISOString();
            } else {
                 try { createdStr = JSON.stringify(record.createdAt); } catch(e) {}
            }
            
            if (createdStr.includes('2026-06-16')) {
                const dtStr = record.pickupDayCFM;
                if (dtStr && !dtStr.includes('16/6/2026') && !dtStr.includes('2026-06-16')) {
                    const correctDate = typeof record.createdAt === 'string' ? record.createdAt : new Date().toISOString();
                    try {
                        await updateDoc(doc(db, 'historico_expo', record.id), {
                            pickupDayCFM: correctDate
                        });
                        count++;
                    } catch(e) {
                        console.log("Error updating", record.id);
                    }
                }
            }
        }
        
        console.log(`Successfully updated ${count} remaining records!`);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
main();
