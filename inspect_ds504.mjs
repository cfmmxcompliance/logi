import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit, query } from 'firebase/firestore';

const firebaseConfig = {
    projectId: "logimaster-cfm",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function inspect() {
    const coll = collection(db, 'ds504');
    const q = query(coll, limit(500));
    const snapshot = await getDocs(q);

    const codes = new Set();
    snapshot.docs.forEach(doc => {
        const data = doc.data();
        codes.add(data.TipoContenedor || data.c5);
    });

    console.log('Unique container codes found in first 500 records:', Array.from(codes));
}

inspect();
