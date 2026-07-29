const admin = require('firebase-admin');
const serviceAccount = require('./functions/service_account.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function fix() {
  try {
    // 1. Fix AsignacionCaja "PGS38 " -> "PGS38"
    const asigSnapshot = await db.collection('asignacion_cajas').where('fecha', '==', '2026-07-28').get();
    let asigId = null;
    for (const doc of asigSnapshot.docs) {
      if (doc.data().numeroCaja === 'PGS38 ') {
        asigId = doc.id;
        console.log(`Fixing AsignacionCaja ${asigId}`);
        await doc.ref.update({ numeroCaja: 'PGS38' });
      }
    }

    // 2. Fix Contratos for today that were wrongly assigned TL021
    const conSnapshot = await db.collection('contratos').where('numeroCaja', '==', 'PGS38').where('fecha', '==', '2026-07-28').get();
    for (const doc of conSnapshot.docs) {
      if (doc.data().numeroOperacion === 'TL021') {
        console.log(`Fixing Contrato ${doc.id}`);
        await doc.ref.update({ numeroOperacion: 'TL067' });
      }
    }
    
    // 3. Fix Sellos for today that might have wrong AsignacionCajaId or TL
    const selloSnapshot = await db.collection('sellos_asignados').where('numeroCaja', '==', 'PGS38').where('fechaAsignacion', '==', '2026-07-28').get();
    for (const doc of selloSnapshot.docs) {
        if (asigId) {
            console.log(`Fixing Sello ${doc.id}`);
            await doc.ref.update({ asignacionCajaId: asigId });
        }
    }

    console.log("Database fix completed.");
  } catch (error) {
    console.error("Error:", error);
  } finally {
    process.exit(0);
  }
}
fix();
