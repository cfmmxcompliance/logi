import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

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

        console.log("Fetching data_stage_reports...");
        const snapshot = await getDocs(collection(db, 'data_stage_reports'));
        console.log(`Found ${snapshot.size} records in data_stage_reports collection.`);
        
        let target2025 = [];
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.originalFileName && data.originalFileName.includes('2025')) {
                target2025.push(data);
            } else if (data.timestamp && data.timestamp.includes('2025')) {
                target2025.push(data);
            }
        });

        console.log(`Found ${target2025.length} records related to 2025`);
        if (target2025.length > 0) {
            console.log(JSON.stringify(target2025[0], null, 2));
        }

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

main();
