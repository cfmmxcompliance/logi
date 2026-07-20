const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function run() {
  const snapshot = await db.collection('asignacion_cajas').where('numeroCaja', '==', 'JBHU280795').get();
  if (snapshot.empty) { console.log('No encontrada'); return; }
  snapshot.forEach(doc => {
    const data = doc.data();
    console.log("ID:", doc.id);
    console.log("Estatus:", data.estatus);
    console.log("Dock:", data.dock);
    console.log("Estado Despacho:", data.estadoDespacho);
    console.log("Status WMS:", data.statusWms);
    console.log("Liberacion Data:", data.liberacion);
  });
}
run().then(() => process.exit(0)).catch(console.error);
