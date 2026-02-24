import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getCountFromServer } from 'firebase/firestore';

const firebaseConfig = {
    projectId: "logimaster-cfm",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function count() {
    const coll = collection(db, 'ds501');
    const snapshot = await getCountFromServer(coll);
    console.log('Total ds501:', snapshot.data().count);
}

count();
