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
    const q1 = query(collection(db, 'sellos'), where('numeroCaja', '==', '5523'));
    const snap1 = await getDocs(q1);
    console.log(`Sellos for 5523:`);
    snap1.forEach(d => console.log(d.id, d.data()));

    const q2 = query(collection(db, 'sellos'), where('numeroCaja', '==', '6003'));
    const snap2 = await getDocs(q2);
    console.log(`\nSellos for 6003:`);
    snap2.forEach(d => console.log(d.id, d.data()));

    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
run();
