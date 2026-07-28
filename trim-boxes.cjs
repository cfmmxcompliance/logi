const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, updateDoc, doc } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
  authDomain: "logimaster-cfmoto.firebaseapp.com",
  projectId: "logimaster-cfmoto"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  try {
    const snap = await getDocs(collection(db, 'asignacion_cajas'));
    let updated = 0;
    
    for (const d of snap.docs) {
      const data = d.data();
      if (data.numeroCaja && typeof data.numeroCaja === 'string') {
        const trimmed = data.numeroCaja.trim();
        if (trimmed !== data.numeroCaja) {
          console.log(`Fixing box from "${data.numeroCaja}" to "${trimmed}" for doc ${d.id}`);
          await updateDoc(doc(db, 'asignacion_cajas', d.id), {
            numeroCaja: trimmed
          });
          updated++;
        }
      }
    }
    
    console.log(`Done. Trimmed ${updated} boxes.`);
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
run();
