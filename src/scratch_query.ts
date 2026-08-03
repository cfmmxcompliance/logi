import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where, deleteDoc, doc } from 'firebase/firestore';

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

async function run() {
  console.log("Fetching fixed assets (PACKING LIST) for complete deletion...");
  try {
    const q = query(
      collection(db, 'fixed_assets'),
      where('pedimento', '==', '231615923002360'),
      where('document', '==', '2.-PACKING LIST')
    );
    const snap = await getDocs(q);
    
    let deletedCount = 0;
    
    for (const d of snap.docs) {
      console.log(`Deleting doc ${d.id}`);
      await deleteDoc(doc(db, 'fixed_assets', d.id));
      deletedCount++;
    }

    console.log(`\nSuccessfully deleted all ${deletedCount} rows for 2.-PACKING LIST.`);
  } catch(e) {
      console.error(e);
  }
}

run();
