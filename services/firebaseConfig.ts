// @ts-ignore
import { initializeApp } from 'firebase/app';
// @ts-ignore
import { getFirestore } from 'firebase/firestore';
// @ts-ignore
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
  authDomain: "logimaster-cfmoto.firebaseapp.com",
  projectId: "logimaster-cfmoto",
  storageBucket: "logimaster-cfmoto.firebasestorage.app",
  messagingSenderId: "924452835722",
  appId: "1:924452835722:web:11a7eedec65ba034dc7873",
  measurementId: "G-01VXE7L5C3"
};

let app = null;
let firestoreDb = null;
let firebaseAuth = null;

try {
  console.log("🔥 Firebase: Initializing...");
  app = initializeApp(firebaseConfig);
  firestoreDb = getFirestore(app);
  firebaseAuth = getAuth(app);
  console.log("✅ Firebase: Connected to Cloud Database & Auth");
} catch (e) {
  console.error("❌ Firebase Error:", e);
}

// Named export 'db' is required for live binding in other modules
export { firestoreDb as db };
export { firebaseAuth as auth };
// @ts-ignore
import { getStorage } from 'firebase/storage';
export const storage = app ? getStorage(app) : null;