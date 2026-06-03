import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";

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

const snap = await getDoc(doc(db, "users", "admin@logimaster.com"));
console.log("Exists:", snap.exists());
if (snap.exists()) console.log("Data:", snap.data());
process.exit(0);
