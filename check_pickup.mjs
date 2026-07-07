import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, limit, orderBy } from 'firebase/firestore';

async function main() {
    try {
        const firebaseConfig = {
          apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
          projectId: "logimaster-cfmoto"
        };
        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);

        const snap = await getDocs(query(collection(db, 'historico_expo'), orderBy('createdAt', 'desc'), limit(10)));
        snap.forEach((d) => {
            const data = d.data();
            console.log(`ID: ${d.id}, trailer: ${data.trailer}, pickupDayCFM: ${data.pickupDayCFM}`);
        });

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
main();
