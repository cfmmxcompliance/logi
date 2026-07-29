const admin = require('firebase-admin');
const serviceAccount = require('./functions/service_account.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function check() {
  try {
    const asigSnapshot = await db.collection('asignacion_cajas').where('fecha', '==', '2026-07-28').get();
    asigSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.numeroCaja && data.numeroCaja.toUpperCase().includes('PGS')) {
        console.log(`Caja hoy: ${data.numeroCaja}, TL: ${data.numeroOperacion}, ID: ${doc.id}`);
      }
      if (data.numeroOperacion === 'TL021') {
        console.log(`TL021 hoy: Caja: ${data.numeroCaja}, ID: ${doc.id}`);
      }
    });
  } catch (error) {
    console.error("Error querying:", error);
  } finally {
    process.exit(0);
  }
}
check();
