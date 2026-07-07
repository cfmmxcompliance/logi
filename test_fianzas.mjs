import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
  projectId: "logimaster-cfmoto"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function testFianzas() {
  console.log("Testeando conexión a colección fianzas...");
  try {
    const snap = await getDocs(collection(db, 'fianzas'));
    console.log(`Éxito. Se encontraron ${snap.docs.length} registros en la colección 'fianzas' de Firebase.`);
    if (snap.docs.length > 0) {
      console.log("Ejemplo del primer registro:", JSON.stringify(snap.docs[0].data(), null, 2).substring(0, 300));
    }
  } catch(e) {
    console.error("Error al leer fianzas:", e);
  }
}
testFianzas().then(() => process.exit(0));
