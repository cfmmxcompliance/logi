const admin = require('firebase-admin');
const serviceAccount = require('./functions/service_account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function check() {
  try {
    const asigSnapshot = await db.collection('asignacion_cajas').where('numeroCaja', '==', 'PGS38').get();
    asigSnapshot.forEach(doc => {
      console.log(`AsignacionCaja ID: ${doc.id}`);
      console.log(doc.data());
    });

    const embSnapshot = await db.collection('contratos').where('numeroCaja', '==', 'PGS38').get();
    embSnapshot.forEach(doc => {
      console.log(`Contratos ID: ${doc.id}`);
      console.log(doc.data());
    });

  } catch (error) {
    console.error("Error querying:", error);
  } finally {
    process.exit(0);
  }
}
check();
