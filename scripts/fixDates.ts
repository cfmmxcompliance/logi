import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc, getDoc } from 'firebase/firestore';
import { firebaseConfig } from '../services/firebaseConfig.ts';
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function fix() {
  const snaps = await getDocs(collection(db, 'liberacionesDock'));
  for (const libDoc of snaps.docs) {
    const data = libDoc.data();
    if (!data.asignacionCajaId) continue;
    const cajaDoc = await getDoc(doc(db, 'asignacion_cajas', data.asignacionCajaId));
    if (cajaDoc.exists()) {
      const caja = cajaDoc.data();
      if (caja.fecha && caja.fecha !== data.fechaLiberacion) {
        console.log(`Fixing ${libDoc.id}: ${data.fechaLiberacion} -> ${caja.fecha}`);
        await updateDoc(libDoc.ref, { fechaLiberacion: caja.fecha });
      }
    }
  }
  
  // Do the same for liberacionesCaja
  const libs = await getDocs(collection(db, 'liberacionesCaja'));
  for (const libDoc of libs.docs) {
    const data = libDoc.data();
    if (!data.asignacionCajaId) continue;
    const cajaDoc = await getDoc(doc(db, 'asignacion_cajas', data.asignacionCajaId));
    if (cajaDoc.exists()) {
      const caja = cajaDoc.data();
      if (caja.fecha && caja.fecha !== data.fechaLiberacion) {
        console.log(`Fixing ${libDoc.id}: ${data.fechaLiberacion} -> ${caja.fecha}`);
        await updateDoc(libDoc.ref, { fechaLiberacion: caja.fecha });
      }
    }
  }
  console.log('Done');
  process.exit(0);
}
fix();
