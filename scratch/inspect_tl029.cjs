const admin = require("firebase-admin");
const serviceAccount = require("../functions/service-account.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function inspectRecord() {
  console.log("Searching for TL029, date 2026-08-21...");
  const snapshot = await db.collection("asignacion_cajas")
    .where("fecha", "==", "2026-08-21")
    .where("numeroOperacion", "==", "TL029")
    .get();

  if (snapshot.empty) {
    console.log("No record found with those exact fields.");
  }

  snapshot.forEach(async (doc) => {
    console.log("Found record ID:", doc.id);
    const data = doc.data();
    console.log(JSON.stringify(data, null, 2));
    
    const libSnap = await db.collection("liberacionesDock").where("asignacionCajaId", "==", doc.id).get();
    if (!libSnap.empty) {
      console.log("--- LIBERACION DOCK ---");
      libSnap.forEach(lDoc => console.log(JSON.stringify(lDoc.data(), null, 2)));
    } else {
      console.log("--- NO LIBERACION DOCK FOUND ---");
    }
  });
}

inspectRecord().then(() => setTimeout(() => process.exit(0), 1000));
