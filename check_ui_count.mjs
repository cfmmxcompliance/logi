import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query } from 'firebase/firestore';

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
        
        let countToday = 0;
        let countEmptyTrailer = 0;
        let goodRecords = 0;
        
        docs.forEach(d => {
            let dtStr = d.pickupDayCFM || d.createdAt;
            if (!dtStr) return;
            if (typeof dtStr !== 'string') {
                try { dtStr = JSON.stringify(dtStr); } catch(e) { return; }
            }
            
            let parsedDate = '';
            if (dtStr.includes('/')) {
                let datePart = dtStr.split(',')[0].trim();
                datePart = datePart.split(' ')[0].trim();
                const parts = datePart.split('/'); 
                if(parts.length >= 3) {
                    parsedDate = `${parts[2].substring(0,4)}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
                }
            } else if (dtStr.match(/^\d{4}-\d{2}-\d{2}/)) {
                parsedDate = dtStr.substring(0, 10);
            } else {
                parsedDate = new Date(d.createdAt || Date.now()).toISOString().split('T')[0];
            }
            
            if (parsedDate === '2026-06-16') {
                countToday++;
                if (!d.trailer) {
                    countEmptyTrailer++;
                } else {
                    goodRecords++;
                }
            }
        });
        
        console.log(`Total in historico with today's parsed date: ${countToday}`);
        console.log(`Of which have empty trailer: ${countEmptyTrailer}`);
        console.log(`Remaining good records that UI should show: ${goodRecords}`);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
main();
