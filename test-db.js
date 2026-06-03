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

async function check() {
  const q = query(collection(db, 'vigilancia'), where('numeroCaja', '==', '2006'));
  const snap = await getDocs(q);
  console.log("Found records:", snap.size);
  snap.forEach(doc => {
    console.log(doc.id, "=>", doc.data());
  });
}

check().catch(console.error);
