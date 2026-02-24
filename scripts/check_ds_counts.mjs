import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getCountFromServer, getDocs, query, limit, where } from 'firebase/firestore';

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

async function check() {
    const cols = ["ds_items", "ds501", "ds551", "ds505", "ds506", "ds520"];
    console.log("--- Collection Counts ---");
    for (const c of cols) {
        try {
            const coll = collection(db, c);
            const snapshot = await getCountFromServer(coll);
            console.log(`${c}: ${snapshot.data().count}`);

            // Debug sample data
            if (c === 'ds_items') {
                const q = query(coll, limit(5));
                const docs = await getDocs(q);
                if (!docs.empty) {
                    console.log(`\nSample ${c} (first 2 docs):`);
                    docs.docs.slice(0, 2).forEach(d => {
                        console.log(`ID: ${d.id}`, JSON.stringify(d.data(), null, 2));
                    });
                } else {
                    console.log(`\n${c} content is EMPTY (or only has hidden docs?)`);
                }
            }
        } catch (e) {
            console.error(`Error checking ${c}: ${e.message}`);
        }
    }
    process.exit(0);
}
check();
