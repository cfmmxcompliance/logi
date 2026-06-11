import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

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

async function getPdfUrls() {
  const snap = await getDocs(collection(db, "rule_8ths"));
  const urls = new Set();
  snap.forEach(doc => {
    const data = doc.data();
    if (data.pdfUrl) urls.add(data.pdfUrl);
  });
  
  if (urls.size === 0) {
    console.log("NO_PDF_URLS_FOUND");
  } else {
    urls.forEach(url => console.log(url));
  }
  process.exit(0);
}

getPdfUrls().catch(e => { console.error(e); process.exit(1); });
