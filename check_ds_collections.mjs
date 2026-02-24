import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where, limit, getCountFromServer } from "firebase/firestore";

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

const dsCollections = [
    'ds501', 'ds502', 'ds503', 'ds504', 'ds505', 'ds506', 'ds507', 'ds508', 'ds509', 'ds510',
    'ds511', 'ds512', 'ds520', 'ds551', 'ds554', 'ds557', 'ds558', 'ds701', 'ds702', 'dsSel'
];

async function checkDS() {
    console.log("Checking DataStage Collections...");
    const results = [];

    for (const col of dsCollections) {
        try {
            const collRef = collection(db, col);
            const snapshot = await getCountFromServer(collRef);
            const count = snapshot.data().count;
            if (count > 0) {
                results.push({ collection: col, count });
            }
        } catch (e) {
            // Probably doesn't exist or no permission
        }
    }

    console.table(results);
    process.exit(0);
}

checkDS().catch(console.error);
