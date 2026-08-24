const admin = require("firebase-admin");
const serviceAccount = require("../functions/service-account.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function inspectRecord() {
  const docId = "TL02920260821ARCBLSTR";
  
  const docSnap = await db.collection("asignacion_cajas").doc(docId).get();
  console.log("Found record ID:", docSnap.id);
  
  const libDockSnap = await db.collection("liberacionesDock").where("asignacionCajaId", "==", docId).get();
  if (!libDockSnap.empty) {
    console.log("--- LIBERACION DOCK ---");
    libDockSnap.forEach(lDoc => console.log(JSON.stringify(lDoc.data(), null, 2)));
  } else {
    console.log("--- NO LIBERACION DOCK FOUND ---");
  }

  const libCajaSnap = await db.collection("liberacionesCaja").where("asignacionCajaId", "==", docId).get();
  if (!libCajaSnap.empty) {
    console.log("--- LIBERACION CAJA ---");
    libCajaSnap.forEach(lDoc => console.log(JSON.stringify(lDoc.data(), null, 2)));
  } else {
    console.log("--- NO LIBERACION CAJA FOUND ---");
  }
}

inspectRecord().then(() => setTimeout(() => process.exit(0), 1000));
