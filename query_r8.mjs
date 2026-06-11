import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
  authDomain: "logimaster-cfmoto.firebaseapp.com",
  projectId: "logimaster-cfmoto",
  storageBucket: "logimaster-cfmoto.firebasestorage.app",
  messagingSenderId: "924452835722",
  appId: "1:924452835722:web:11a7eedec65ba034dc7873"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function search() {
  console.log("Fetching parts...");
  const snap = await getDocs(collection(db, "parts"));
  const docs = snap.docs.map(d => d.data());
  
  const matches = docs.filter(d => {
    const val = JSON.stringify(d).toUpperCase();
    return val.includes("3902109900") || val.includes("3902.10.99") || val.includes("PARTICULAS PLASTICAS");
  });
  
  console.log(`Found ${matches.length} matches.`);
  matches.forEach(m => {
    console.log(`- PartNum: ${m.PART_NUMBER}, Desc_ES: ${m.DESCRIPCION_ES}, HTSMX: ${m.HTSMX}, R8: ${m.R8}`);
  });
  
  process.exit(0);
}

search();
