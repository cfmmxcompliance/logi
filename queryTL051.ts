import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
  authDomain: "logimaster-cfmoto.firebaseapp.com",
  projectId: "logimaster-cfmoto",
  storageBucket: "logimaster-cfmoto.firebasestorage.app",
  messagingSenderId: "924452835722",
  appId: "1:924452835722:web:11a7eedec65ba034dc7873",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function searchTL051() {
  console.log('Searching for TL051...');
  try {
    const sellosSnap = await getDocs(collection(db, 'sellos'));
    sellosSnap.forEach(doc => {
      const data = doc.data();
      if (
        (data.numeroCaja && data.numeroCaja.includes('TL051')) ||
        (data.numeroOperacion && data.numeroOperacion.includes('TL051')) ||
        (data.selloAsignado && data.selloAsignado.includes('TL051'))
      ) {
        console.log('Found in sellos:', doc.id, data);
      }
    });

    const asigSnap = await getDocs(collection(db, 'asignacionesCaja53'));
    asigSnap.forEach(doc => {
      const data = doc.data();
      if (
        (data.numeroCaja && data.numeroCaja.includes('TL051')) ||
        (data.numeroOperacion && data.numeroOperacion.includes('TL051'))
      ) {
        console.log('Found in asignacionesCaja53:', doc.id, data);
      }
    });

    const libSnap = await getDocs(collection(db, 'liberaciones'));
    libSnap.forEach(doc => {
      const data = doc.data();
      if (
        (data.numeroCaja && data.numeroCaja.includes('TL051')) ||
        (data.numeroOperacion && data.numeroOperacion.includes('TL051')) ||
        (data.selloValidado && data.selloValidado.includes('TL051'))
      ) {
        console.log('Found in liberaciones:', doc.id, data);
      }
    });
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}

searchTL051();
