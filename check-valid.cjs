const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
  authDomain: "logimaster-cfmoto.firebaseapp.com",
  projectId: "logimaster-cfmoto"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  try {
    const doc38 = await getDoc(doc(db, 'asignacion_cajas', 'TL03820260727ARCBTQLA'));
    console.log("TL038", doc38.exists() ? doc38.data().dockArribo : 'NOT FOUND');

    const doc57 = await getDoc(doc(db, 'asignacion_cajas', 'TL05720260727ARCBARCA'));
    console.log("TL057", doc57.exists() ? doc57.data().dockArribo : 'NOT FOUND');
    
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
run();
