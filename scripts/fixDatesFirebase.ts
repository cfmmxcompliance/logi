import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc, getDoc } from 'firebase/firestore';

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

async function fixDates() {
  console.log("Starting date fix...");
  const libsSnap = await getDocs(collection(db, 'liberacionesDock'));
  
  for (const libDoc of libsSnap.docs) {
    const data = libDoc.data();
    if (!data.asignacionCajaId) continue;
    
    const cajaDoc = await getDoc(doc(db, 'asignacion_cajas', data.asignacionCajaId));
    if (cajaDoc.exists()) {
      const caja = cajaDoc.data();
      if (caja.fecha && caja.fecha !== data.fechaLiberacion) {
        console.log(`Fixing LiberacionDock ${libDoc.id}: ${data.fechaLiberacion} -> ${caja.fecha}`);
        await updateDoc(libDoc.ref, { fechaLiberacion: caja.fecha });
      }
    }
  }

  const libsCajaSnap = await getDocs(collection(db, 'liberacionesCaja'));
  for (const libDoc of libsCajaSnap.docs) {
    const data = libDoc.data();
    if (!data.asignacionCajaId) continue;
    
    const cajaDoc = await getDoc(doc(db, 'asignacion_cajas', data.asignacionCajaId));
    if (cajaDoc.exists()) {
      const caja = cajaDoc.data();
      if (caja.fecha && caja.fecha !== data.fechaLiberacion) {
        console.log(`Fixing LiberacionCaja ${libDoc.id}: ${data.fechaLiberacion} -> ${caja.fecha}`);
        await updateDoc(libDoc.ref, { fechaLiberacion: caja.fecha });
      }
    }
  }

  const sellosSnap = await getDocs(collection(db, 'sellos'));
  for (const selloDoc of sellosSnap.docs) {
    const data = selloDoc.data();
    if (!data.asignacionCajaId) continue;
    
    const cajaDoc = await getDoc(doc(db, 'asignacion_cajas', data.asignacionCajaId));
    if (cajaDoc.exists()) {
      const caja = cajaDoc.data();
      if (caja.fecha && caja.fecha !== data.fechaAsignacion) {
        console.log(`Fixing Sello ${selloDoc.id}: ${data.fechaAsignacion} -> ${caja.fecha}`);
        await updateDoc(selloDoc.ref, { fechaAsignacion: caja.fecha });
      }
    }
  }

  console.log("Fix complete.");
  process.exit(0);
}

fixDates().catch(console.error);
