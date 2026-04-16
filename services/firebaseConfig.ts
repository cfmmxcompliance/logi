// @ts-ignore
import { initializeApp } from 'firebase/app';
// @ts-ignore
import { initializeFirestore, persistentLocalCache, persistentSingleTabManager, memoryLocalCache } from 'firebase/firestore';
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

// 1. Inicialización Síncrona
const app = initializeApp(firebaseConfig);

// 2. Caché persistente con fallback a memoria para Android de gama baja
//    persistentLocalCache falla en dispositivos con poca RAM o WebView antigua
//    En ese caso cae silenciosamente a memoryLocalCache (sin crash)
let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentSingleTabManager({ forceOwnership: false })
    })
  });
} catch (e) {
  console.warn('[Firebase] IndexedDB no disponible, usando memoria:', e);
  db = initializeFirestore(app, {
    localCache: memoryLocalCache()
  });
}
const auth = getAuth(app);
const storage = getStorage(app);

// 3. Exportación robusta
export { app, db, auth, storage };
console.log("✅ Firebase: Services Initialized");