import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit } from 'firebase/firestore';

async function main() {
    try {
        const firebaseConfig = {
          apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
          authDomain: "logimaster-cfmoto.firebaseapp.com",
          projectId: "logimaster-cfmoto",
          storageBucket: "logimaster-cfmoto.firebasestorage.app",
          messagingSenderId: "924452835722",
          appId: "1:924452835722:web:11a7eedec65ba034dc7873"
        };

        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);

        console.log("Fetching fianzas...");
        const snapshot = await getDocs(collection(db, 'fianzas'));
        console.log(`Found ${snapshot.size} records in fianzas collection.`);
        if (snapshot.size > 0) {
            console.log(JSON.stringify(snapshot.docs[0].data(), null, 2));
        }
        
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

main();
