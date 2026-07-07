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
        let docs = snap.docs.map(d => ({id: d.id, ...d.data()}));
        
        console.log(`Total unique historico_expo records: ${docs.length}`);
        
        let withPickupToday = 0;
        docs.forEach(d => {
            const dtStr = d.pickupDayCFM || new Date(d.createdAt).toISOString();
            let parsedDate = '';
            if (dtStr.includes('/')) {
                const parts = dtStr.split(',')[0].split('/'); 
                if(parts.length >= 3) {
                    parsedDate = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
                }
            } else if (dtStr.match(/^\d{4}-\d{2}-\d{2}/)) {
                parsedDate = dtStr.substring(0, 10);
            } else {
                 parsedDate = new Date(d.createdAt).toISOString().split('T')[0];
            }
            if (parsedDate === '2026-06-16') {
                withPickupToday++;
            }
        });
        console.log(`Records with parsed Pickup == 2026-06-16: ${withPickupToday}`);
        
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
main();
