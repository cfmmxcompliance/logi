import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit, query } from 'firebase/firestore';

const firebaseConfig = {
    projectId: "logimaster-cfm",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function inspect() {
    console.log("--- Inspecting ds501 ---");
    const snap = await getDocs(query(collection(db, 'ds501'), limit(1)));
    if (snap.empty) {
        console.log("Collection ds501 is empty!");
    } else {
        console.log(JSON.stringify(snap.docs[0].data(), null, 2));
    }
}

inspect();
