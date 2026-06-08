import { db } from './services/firebaseConfig.ts';
import { collection, getDocs } from 'firebase/firestore';

async function check() {
  console.log("Fetching fixed_assets from Firestore...");
  const snap = await getDocs(collection(db, 'fixed_assets'));
  console.log(`Found ${snap.docs.length} documents.`);
  snap.docs.forEach(d => {
    console.log(d.id, "=>", d.data());
  });
  process.exit(0);
}

check().catch(console.error);
