const admin = require('firebase-admin');
const serviceAccount = require('./service_account.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function run() {
  const asigId = 'TL01820260718JBHTTRANSPORTES TRES TORRES';
  
  // First check if it already exists just in case
  const snapDock = await db.collection('liberacionesDock').where('asignacionCajaId', '==', asigId).get();
  if (!snapDock.empty) {
    console.log("Already exists!");
    return;
  }

  console.log("Inserting LiberacionesDock record...");
  const newRef = db.collection('liberacionesDock').doc();
  await newRef.set({
    asignacionCajaId: asigId,
    numeroCaja: "JBHU280795",
    usuario: "system-fix", // or the email of the person who did the yard release
    fechaLiberacion: "2026-07-18",
    createdAt: new Date().toISOString()
  });
  console.log("Done! Inserted with ID:", newRef.id);
}

run().then(() => process.exit(0)).catch(console.error);
