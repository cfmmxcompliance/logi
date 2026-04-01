import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, deleteDoc, doc } from 'firebase/firestore';

// Copiar config desde firebaseConfig.ts del proyecto
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

async function clearCollection(collectionName) {
  console.log(`🗑️ Limpiando colección: ${collectionName}...`);
  const snap = await getDocs(collection(db, collectionName));
  if (snap.empty) {
    console.log(`   ✓ Ya estaba vacía.`);
    return;
  }
  const deletes = snap.docs.map(d => deleteDoc(doc(db, collectionName, d.id)));
  await Promise.all(deletes);
  console.log(`   ✓ ${snap.docs.length} documentos eliminados.`);
}

async function main() {
  await clearCollection('sellos');
  await clearCollection('liberacionesCaja');
  console.log('\n✅ Listo para demo. ¡Buena suerte!');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
