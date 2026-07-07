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
        
        // Count records created today
        let createdToday = 0;
        let createdFromLiberacionesToday = 0;
        docs.forEach(d => {
            const createdAtStr = new Date(d.createdAt).toISOString();
            if (createdAtStr.startsWith('2026-06-16')) {
                createdToday++;
                // Records from liberacionService have id like exp_...
                if (d.id.startsWith('exp_')) {
                    createdFromLiberacionesToday++;
                }
            }
        });
        
        console.log(`Total historico_expo created TODAY (2026-06-16): ${createdToday}`);
        console.log(`Of which were auto-generated from liberaciones: ${createdFromLiberacionesToday}`);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
main();
