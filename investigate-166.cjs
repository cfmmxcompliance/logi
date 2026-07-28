const { initializeApp } = require('firebase/app');
const { getFirestore, collection, query, where, getDocs } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
  authDomain: "logimaster-cfmoto.firebaseapp.com",
  projectId: "logimaster-cfmoto"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  try {
    const caja = '166';
    console.log(`--- Investigating Caja ${caja} ---`);

    console.log("\n1. ASIGNACIONES_CAJAS (TLs):");
    const q1 = query(collection(db, 'asignacion_cajas'), where('numeroCaja', '==', caja));
    const snap1 = await getDocs(q1);
    snap1.forEach(d => {
      const data = d.data();
      console.log(`ID: ${d.id}`);
      console.log(` - Operacion (TL): ${data.numeroOperacion}`);
      console.log(` - Fecha: ${data.fecha}`);
      console.log(` - Estatus: ${data.dockArribo}`);
      console.log(` - CarrierRef: ${data.carrierRef}`);
      console.log(` - SubLinea: ${data.subLinea}`);
    });

    console.log("\n2. CONTRATOS (Embarques):");
    const q2 = query(collection(db, 'contratos'), where('numeroCaja', '==', caja));
    const snap2 = await getDocs(q2);
    snap2.forEach(d => {
      const data = d.data();
      console.log(`ID: ${d.id}`);
      console.log(` - Operacion (TL): ${data.numeroOperacion}`);
      console.log(` - Fecha: ${data.fecha}`);
      console.log(` - Carrier: ${data.carrier}`);
      console.log(` - Forwarder: ${data.forwarder}`);
      console.log(` - Naviera: ${data.naviera}`);
    });

    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
run();
