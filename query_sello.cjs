const admin = require('firebase-admin');
const serviceAccount = require('./functions/service_account.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function check() {
  try {
    const sSnapshot = await db.collection('sellos_asignados').where('selloAsignado', '==', '743383').get();
    if (sSnapshot.empty) {
        console.log("No se encontro sello 743383 en sellos_asignados");
    } else {
        sSnapshot.forEach(doc => console.log(doc.id, doc.data()));
    }
  } catch (error) {
    console.error("Error querying:", error);
  } finally {
    process.exit(0);
  }
}
check();
