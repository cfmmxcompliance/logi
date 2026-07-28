const { initializeApp } = require('firebase/app');
const { getFirestore, collection, query, where, getDocs } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
  authDomain: "logimaster-cfmoto.firebaseapp.com",
  projectId: "logimaster-cfmoto"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  try {
    const tl = 'TL059';
    console.log(`--- Investigating ${tl} ---`);

    console.log("\n1. ASIGNACIONES_CAJAS (TLs):");
    const q1 = query(collection(db, 'asignacion_cajas'), where('numeroOperacion', '==', tl));
    const snap1 = await getDocs(q1);
    snap1.forEach(d => console.log(d.id, d.data()));

    console.log("\n2. CONTRATOS (Embarques):");
    const q2 = query(collection(db, 'contratos'), where('numeroOperacion', '==', tl));
    const snap2 = await getDocs(q2);
    snap2.forEach(d => console.log(d.id, d.data()));

    console.log("\n3. SELLOS (Assigned seals):");
    const q3 = query(collection(db, 'sellos'), where('numeroOperacion', '==', tl));
    const snap3 = await getDocs(q3);
    snap3.forEach(d => console.log(d.id, d.data()));

    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
run();
