// @ts-ignore
import { initializeApp } from 'firebase/app';
// @ts-ignore
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, getFirestore } from 'firebase/firestore';
// @ts-ignore
import { getAuth } from 'firebase/auth';
// @ts-ignore
import { getStorage } from 'firebase/storage';

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

// Restore persistentLocalCache to protect operational modules (Offline-First / Multi-tab)
// The 500-batch paginated load in storageService.ts prevents this from freezing the main thread.
let db: ReturnType<typeof getFirestore>;
try {
  db = initializeFirestore(app, { 
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) 
  });
} catch {
  // HMR: Firestore already initialized — return existing instance
  db = getFirestore(app);
}

const auth = getAuth(app);
const storage = getStorage(app);

export { app, db, auth, storage };