const admin = require("firebase-admin");
const serviceAccount = require("../functions/service-account.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function analyzeRecord() {
  const op = "TL018";
  const caja = "JBHU317023";
  const date = "2026-08-21";

  console.log(`Searching for asignacion_cajas with op: ${op}, caja: ${caja}, date: ${date}`);
  const asigSnap = await db.collection("asignacion_cajas")
    .where("fecha", "==", date)
    .where("numeroOperacion", "==", op)
    .get();

  if (asigSnap.empty) {
    console.log("No Asignacion found!");
    return;
  }

  let docId = "";
  asigSnap.forEach(doc => {
    docId = doc.id;
    console.log("--- ASIGNACION CAJAS ---");
    console.log(JSON.stringify(doc.data(), null, 2));
  });

  const dockSnap = await db.collection("liberacionesDock")
    .where("asignacionCajaId", "==", docId)
    .get();

  if (dockSnap.empty) {
    console.log("--- NO LIBERACIONES DOCK FOUND ---");
  } else {
    dockSnap.forEach(doc => {
      console.log("--- LIBERACIONES DOCK ---");
      console.log(JSON.stringify(doc.data(), null, 2));
    });
  }

  const libSnap = await db.collection("liberacionesCaja")
    .where("asignacionCajaId", "==", docId)
    .get();

  if (libSnap.empty) {
    console.log("--- NO LIBERACIONES CAJA FOUND ---");
  } else {
    libSnap.forEach(doc => {
      console.log("--- LIBERACIONES CAJA ---");
      console.log(JSON.stringify(doc.data(), null, 2));
    });
  }
}

analyzeRecord().then(() => setTimeout(() => process.exit(0), 1000));
