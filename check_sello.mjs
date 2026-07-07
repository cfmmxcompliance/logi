import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit, query, orderBy } from 'firebase/firestore';

async function main() {
    try {
        const firebaseConfig = {
          apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
          projectId: "logimaster-cfmoto"
        };
        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);

        const snap = await getDocs(query(collection(db, 'sellos'), orderBy('createdAt', 'desc'), limit(3)));
        snap.forEach(d => console.log(d.data()));

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
main();
