const admin = require('firebase-admin');
const serviceAccount = require('./service_account.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function run() {
  const asigId = 'TL01820260718JBHTTRANSPORTES TRES TORRES';
  
  const snapLib = await db.collection('liberacion_cajas').where('asignacionCajaId', '==', asigId).get();
  console.log("Liberacion Cajas (Yard):", snapLib.size);
  snapLib.forEach(doc => console.log(doc.id, doc.data()));

  const snapDock = await db.collection('liberacion_dock_cajas').where('asignacionCajaId', '==', asigId).get();
  console.log("Liberacion Dock Cajas (Dock):", snapDock.size);
  snapDock.forEach(doc => console.log(doc.id, doc.data()));
}
run().then(() => process.exit(0)).catch(console.error);
