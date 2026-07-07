import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where, orderBy } from 'firebase/firestore';

async function main() {
    try {
        const firebaseConfig = {
          apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
          projectId: "logimaster-cfmoto"
        };
        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);

        // Check audit logs for the record 6idXiUeM4io23JYGxYq6 (TL055)
        const auditSnap = await getDocs(collection(db, 'audit_logs'));
        const logs = auditSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(l => {
                const str = JSON.stringify(l).toLowerCase();
                return str.includes('6idxiuem4io23jygxYq6'.toLowerCase()) || 
                       str.includes('tl055') || 
                       str.includes('pcs5384') ||
                       str.includes('no show');
            });
        
        console.log(`Audit logs relacionados con TL055/NO SHOW: ${logs.length}`);
        logs.forEach(l => console.log(JSON.stringify(l, null, 2)));

        // Also check logs collection
        const logsSnap = await getDocs(collection(db, 'logs'));
        const logs2 = logsSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(l => {
                const str = JSON.stringify(l).toLowerCase();
                return str.includes('tl055') || str.includes('pcs5384') || str.includes('no show');
            });
        
        console.log(`\nLogs relacionados con TL055/NO SHOW: ${logs2.length}`);
        logs2.forEach(l => console.log(JSON.stringify(l, null, 2)));

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
main();
