import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";

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

await setDoc(doc(db, "users", "admin@logimaster.com"), {
  email: "admin@logimaster.com",
  name: "Administrador",
  role: "Admin",
  password: "1234",
  createdAt: new Date().toISOString(),
  active: true
});

console.log("✅ Usuario admin restaurado.");
process.exit(0);
