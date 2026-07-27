const { initializeApp } = require('firebase/app');
const { getFirestore, collection, addDoc } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
  authDomain: "logimaster-cfmoto.firebaseapp.com",
  projectId: "logimaster-cfmoto"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  try {
    const docRef = await addDoc(collection(db, 'notificaciones_liberacion'), {
      tl: 'Simulación Transportes',
      caja: 'SIMULACION-AZUL',
      createdAt: new Date().toISOString(),
      leidoPor: []
    });
    console.log('Document written with ID: ', docRef.id);
    process.exit(0);
  } catch (e) {
    console.error('Error adding document: ', e);
    process.exit(1);
  }
}
run();
