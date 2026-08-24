const admin = require("firebase-admin");
const serviceAccount = require("../functions/service-account.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function inspectRecord() {
  const snapshot = await db.collection("asignacion_cajas")
    .where("fecha", "==", "2026-08-21")
    .where("numeroOperacion", "==", "TL003")
    .get();

  snapshot.forEach(async (doc) => {
    console.log("Found record ID:", doc.id);
    const libSnap = await db.collection("liberacionesDock").where("asignacionCajaId", "==", doc.id).get();
    if (!libSnap.empty) {
      console.log("--- LIBERACION DOCK ---");
      libSnap.forEach(lDoc => console.log(JSON.stringify(lDoc.data(), null, 2)));
    } else {
      console.log("--- NO LIBERACION DOCK FOUND IN ROOT COLLECTION ---");
    }
  });
}

inspectRecord().then(() => setTimeout(() => process.exit(0), 1000));
