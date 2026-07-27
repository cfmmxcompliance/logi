const { initializeApp } = require('firebase/app');
const { getFirestore, collection, addDoc, getDocs, updateDoc, doc, query, limit, where } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
  authDomain: "logimaster-cfmoto.firebaseapp.com",
  projectId: "logimaster-cfmoto"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  try {
    // 1. Find a contrato that doesn't have a CCP yet.
    console.log("Searching for a contrato without CCP...");
    // Let's get recent contratos (we can just query the last few)
    const contratosSnapshot = await getDocs(query(collection(db, 'contratos'), limit(20)));
    let targetContrato = null;
    
    for (const d of contratosSnapshot.docs) {
      const data = d.data();
      if (!data.ccpUrl && data.numeroCaja) {
        targetContrato = { id: d.id, ...data };
        break;
      }
    }

    if (!targetContrato) {
      console.log("Could not find a valid contrato without CCP. Creating a dummy one...");
      const dummyContratoRef = await addDoc(collection(db, 'contratos'), {
        numeroCaja: 'SIM-TEST-001',
        numeroOperacion: 'OP-SIM-001',
        fecha: new Date().toISOString().split('T')[0],
        ccpUrl: 'https://google.com/test-ccp.pdf'
      });
      targetContrato = { id: dummyContratoRef.id, numeroCaja: 'SIM-TEST-001' };
    } else {
      console.log(`Found contrato: ${targetContrato.id} (Caja: ${targetContrato.numeroCaja})`);
      await updateDoc(doc(db, 'contratos', targetContrato.id), {
        ccpUrl: 'https://google.com/fake-ccp.pdf',
        ccpUploadedBy: 'TEST SCRIPT',
        ccpUploadedAt: new Date().toISOString(),
        ccpFileName: 'fake_ccp_simulacion.pdf'
      });
      console.log("Updated contrato with fake CCP URL.");
    }

    // 2. Add the notification
    console.log("Adding notification to notificaciones_ccp...");
    const docRef = await addDoc(collection(db, 'notificaciones_ccp'), {
      carrier: 'Simulación Carrier / TEST',
      caja: targetContrato.numeroCaja,
      createdAt: new Date().toISOString(),
      leidoPor: []
    });
    console.log('Notification written with ID: ', docRef.id);
    
    process.exit(0);
  } catch (e) {
    console.error('Error in simulation: ', e);
    process.exit(1);
  }
}
run();
