const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, deleteDoc, doc, query, where } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
  authDomain: "logimaster-cfmoto.firebaseapp.com",
  projectId: "logimaster-cfmoto"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const isCanceled = (val) => {
  const v = (val || '').trim().toUpperCase();
  return v === 'RECHAZADO' || v === 'DROP' || v === 'NO SHOW' || v === 'CANCELED' || v === 'CANCELADO';
};

async function run() {
  try {
    console.log("Fetching asignacion_cajas...");
    const snapshot = await getDocs(collection(db, 'asignacion_cajas'));
    const canceledIds = [];
    
    snapshot.forEach(d => {
      const data = d.data();
      if (isCanceled(data.dockArribo)) {
        canceledIds.push(d.id);
      }
    });
    
    console.log(`Found ${canceledIds.length} cancelled TLs in total.`);
    
    let deletedCount = 0;
    
    // Check sellos for these cancelled TLs
    for (const id of canceledIds) {
      const q = query(collection(db, 'sellos'), where('asignacionCajaId', '==', id));
      const sellosSnap = await getDocs(q);
      
      if (!sellosSnap.empty) {
        for (const s of sellosSnap.docs) {
          await deleteDoc(doc(db, 'sellos', s.id));
          console.log(`Deleted orphaned sello ${s.id} for cancelled TL ${id}`);
          deletedCount++;
        }
      }
    }
    
    console.log(`Cleanup complete! Deleted ${deletedCount} orphaned seals.`);
    process.exit(0);
  } catch (e) {
    console.error('Error during cleanup: ', e);
    process.exit(1);
  }
}
run();
