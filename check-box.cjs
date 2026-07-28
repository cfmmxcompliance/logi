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
    const q1 = query(collection(db, 'asignacion_cajas'), where('numeroCaja', '==', 'PTLZ202740'));
    const snap1 = await getDocs(q1);
    console.log(`Found ${snap1.size} matching numeroCaja.`);
    snap1.forEach(d => console.log(d.id, d.data()));

    const q2 = query(collection(db, 'asignacion_cajas'), where('numeroOperacion', '==', 'PTLZ202740'));
    const snap2 = await getDocs(q2);
    console.log(`Found ${snap2.size} matching numeroOperacion.`);
    snap2.forEach(d => console.log(d.id, d.data()));

    // Wait, is it possible the user's screenshot has PTLZ202740 but the actual box number in DB has spaces or something?
    // Let's do a loose check.
    const snap3 = await getDocs(collection(db, 'asignacion_cajas'));
    let found = false;
    snap3.forEach(d => {
       const box = (d.data().numeroCaja || '').toUpperCase();
       if (box.includes('PTLZ') || box.includes('202740')) {
           console.log(`Partial match in DB:`, d.id, box);
           found = true;
       }
    });
    if (!found) console.log("No partial matches found for PTLZ202740.");

    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
run();
