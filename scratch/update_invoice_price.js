import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

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
  const col = 'invoice_data';
  console.log("Checking invoice_data...");
  const snap = await getDocs(collection(db, col));
  for (const d of snap.docs) {
      const data = d.data();
      const str = JSON.stringify(data);
      if (str.includes('26CFTTN') || str.includes('644211')) {
          console.log(`[${col}] -> Found match in doc ${d.id}`);
          console.log(JSON.stringify(data, null, 2));
      }
  }
}
run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
