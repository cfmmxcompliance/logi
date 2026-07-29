const admin = require('firebase-admin');
const serviceAccount = require('./functions/service_account.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function insertSello() {
  try {
    const asigSnapshot = await db.collection('asignacion_cajas').where('numeroCaja', '==', 'PGS38').where('fecha', '==', '2026-07-28').get();
    if (asigSnapshot.empty) {
      console.log("No AsignacionCaja found for PGS38 today");
      process.exit(1);
    }
    const asigDoc = asigSnapshot.docs[0];
    const asigId = asigDoc.id;

    const newSello = {
      fechaAsignacion: '2026-07-28',
      asignacionCajaId: asigId,
      numeroCaja: 'PGS38',
      selloAsignado: '743383',
      usuario: '1pda5@cfmoto.com',
      fechaHoraRegistro: new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City', hour12: false }),
      createdAt: new Date().toISOString()
    };

    const docRef = await db.collection('sellos_asignados').add(newSello);
    console.log(`Successfully created sello_asignado for PGS38: ${docRef.id}`);

  } catch (error) {
    console.error("Error:", error);
  } finally {
    process.exit(0);
  }
}
insertSello();
