import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc, query, where } from 'firebase/firestore';

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
        
        console.log(`Total records: ${docs.length}`);
        // show first 3 records to see what fields are available to restore from
        console.log(docs.slice(0, 3));

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
main();
