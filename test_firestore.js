import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, orderBy, documentId, limit, getDocs, startAfter } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
  projectId: "logimaster-cfmoto"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function test() {
  console.log("Starting test...");
  const collRef = collection(db, 'commercialInvoices');
  
  let q = query(collRef, orderBy(documentId()), limit(5));
  let snap = await getDocs(q);
  console.log("First batch size:", snap.docs.length);
  if (snap.docs.length === 0) return;
  
  const lastId = snap.docs[snap.docs.length - 1].id;
  console.log("Last ID:", lastId);
  
  try {
    const q2 = query(collRef, orderBy(documentId()), startAfter(lastId), limit(5));
    const snap2 = await getDocs(q2);
    console.log("Second batch size:", snap2.docs.length);
    console.log("First ID of second batch:", snap2.docs[0]?.id);
  } catch (e) {
    console.error("Error with string startAfter:", e);
  }
}

test().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
