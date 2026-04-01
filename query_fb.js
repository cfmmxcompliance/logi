import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

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

async function test() {
  console.log("Querying database...");
  try {
    const snapshot = await getDocs(collection(db, 'shipping_schedules'));
    console.log("Total docs found:", snapshot.docs.length);

    let matchCount = 0;
    snapshot.docs.forEach(d => {
       const data = d.data();
       const str = JSON.stringify(data);
       if(str.includes('174960C') || str.includes('177765')) {
          console.log("== MATCH ==", data);
          matchCount++;
       }
    });

    if(matchCount === 0) {
       console.log("ZERO MATCHES in database for 174960C or 177765.");
    }
  } catch(e) { console.error("Firebase Auth Error:", e); }
  process.exit(0);
}
test();
