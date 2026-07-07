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
        let corrupted = [];
        
        snap.forEach(d => {
            const date = d.data().pickupDayCFM;
            if (date && (date.includes('2026-06-17') || date.includes('T00:'))) {
                corrupted.push({ id: d.id, ...d.data() });
            }
        });
        
        console.log(`Total registros no restaurados: ${corrupted.length}`);
        corrupted.forEach((r, i) => {
            console.log(`\n${i+1}. ID: ${r.id}`);
            console.log(`   Trailer/Caja: ${r.trailer || '(vacío)'}`);
            console.log(`   Transporte: ${r.transportLine || '(vacío)'}`);
            console.log(`   pickupDayCFM actual (corrupto): ${r.pickupDayCFM}`);
            console.log(`   createdAt: ${r.createdAt}`);
        });

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
main();
