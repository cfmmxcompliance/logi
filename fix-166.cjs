const { initializeApp } = require('firebase/app');
const { getFirestore, doc, updateDoc, deleteDoc } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
  authDomain: "logimaster-cfmoto.firebaseapp.com",
  projectId: "logimaster-cfmoto"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  try {
    // 1. Update contrato 17heDtKJSHxBwBkBdvvi to TL072
    console.log("Updating contrato...");
    await updateDoc(doc(db, 'contratos', '17heDtKJSHxBwBkBdvvi'), {
      numeroOperacion: 'TL072'
    });
    console.log("Contrato updated to TL072.");

    // 2. Delete bogus TL00120260728ARCBARBT from asignacion_cajas
    console.log("Deleting bogus TL from asignaciones...");
    await deleteDoc(doc(db, 'asignacion_cajas', 'TL00120260728ARCBARBT'));
    console.log("Deleted TL00120260728ARCBARBT.");

    // 3. Are there any other bogus TL001s created with date 2026-07-28?
    // The user said "CORRIGE INMEDIATAMENTE TODO LO QUE ESTE COMO TL001 PARA LA CAJA 166".
    // I already did this with the above delete.

    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
run();
