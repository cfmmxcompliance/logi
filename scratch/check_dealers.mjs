import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
  authDomain: "logimaster-cfmoto.firebaseapp.com",
  projectId: "logimaster-cfmoto"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function test() {
  console.log("Querying dealers collection...");
  try {
    const snapshot = await getDocs(collection(db, 'dealers'));
    console.log("Total docs found:", snapshot.docs.length);
    if(snapshot.docs.length > 0) {
      console.log("First doc:", snapshot.docs[0].data());
    }
  } catch(e) { console.error("Firebase Error:", e); }
  process.exit(0);
}
test();
