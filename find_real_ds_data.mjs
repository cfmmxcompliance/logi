import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit, query, where } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
    authDomain: "logimaster-cfmoto.firebaseapp.com",
    projectId: "logimaster-cfmoto",
    storageBucket: "logimaster-cfmoto.firebasestorage.app",
    messagingSenderId: "924452835722",
    appId: "1:924452835722:web:11a7eedec65ba034dc7873",
    measurementId: "G-01VXE7L5C3"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function findRealData() {
    const codes = ['516', '517', '518', '519'];
    for (const code of codes) {
        console.log(`\nChecking real data for ds${code}...`);
        const snap = await getDocs(query(collection(db, `ds${code}`), limit(5)));

        let foundReal = false;
        snap.forEach(d => {
            const data = d.data();
            if (d.id !== '_schema_example' && !data._isSchemaExample) {
                foundReal = true;
                console.log(`   ID: ${d.id}`);
                console.log(`   Data:`, JSON.stringify(data, null, 2));
            }
        });
        if (!foundReal) console.log(`   No real data found for ds${code}, only examples.`);
    }
    process.exit(0);
}

findRealData();
