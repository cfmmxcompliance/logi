const admin = require('firebase-admin');
const serviceAccount = require('./functions/service_account.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function check() {
  try {
    const doc = await db.collection('asignacion_cajas').doc('TL06720260728ARCBMXTL').get();
    console.log(doc.data());
  } catch (error) {
    console.error(error);
  } finally {
    process.exit(0);
  }
}
check();
