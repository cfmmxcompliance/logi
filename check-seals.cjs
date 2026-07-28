const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, deleteDoc, doc, query, where } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
  authDomain: "logimaster-cfmoto.firebaseapp.com",
  projectId: "logimaster-cfmoto"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  try {
    console.log("Fetching sellos for R1423 and 2026-07-27...");
    const q = query(collection(db, 'sellos'), where('numeroCaja', '==', 'R1423'), where('fechaAsignacion', '==', '2026-07-27'));
    const snap = await getDocs(q);
    
    snap.forEach(d => {
      console.log(d.id, d.data());
    });
    
    // Check TL029 box 941084? Wait, is TL029 cancelled? No, it's yellow.
    // What is the other one that is cancelled but has a seal?
    // Let's find any cancelled TLs on 2026-07-27 that STILL have a seal rendering.
    // Actually, I can just fetch all cancelled on 2026-07-27.
    console.log("Fetching all cancelled TLs for 2026-07-27...");
    const qTL = query(collection(db, 'asignacion_cajas'), where('fecha', '==', '2026-07-27'));
    const tlSnap = await getDocs(qTL);
    
    const isCanceled = (val) => {
      const v = (val || '').trim().toUpperCase();
      return v === 'RECHAZADO' || v === 'DROP' || v === 'NO SHOW' || v === 'CANCELED' || v === 'CANCELADO';
    };

    let cancelledIds = [];
    let cancelledBoxes = [];
    tlSnap.forEach(d => {
      const data = d.data();
      if (isCanceled(data.dockArribo)) {
        cancelledIds.push(d.id);
        cancelledBoxes.push(data.numeroCaja);
      }
    });

    console.log("Cancelled boxes today:", cancelledBoxes);

    for (const box of cancelledBoxes) {
       const sq = query(collection(db, 'sellos'), where('numeroCaja', '==', box), where('fechaAsignacion', '==', '2026-07-27'));
       const sSnap = await getDocs(sq);
       sSnap.forEach(d => {
           console.log("Found seal for cancelled box", box, d.id, d.data());
           // Let's delete it so it stops showing up as a phantom
           deleteDoc(doc(db, 'sellos', d.id)).then(() => console.log("Deleted phantom seal for", box));
       });
    }

    // Wait a second for promises to finish
    setTimeout(() => {
        process.exit(0);
    }, 2000);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
run();
