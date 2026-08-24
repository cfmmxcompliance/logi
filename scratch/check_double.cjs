const admin = require("firebase-admin");
const serviceAccount = require("../functions/service-account.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkDoubleRecord() {
  console.log("Checking for any record with caja 20162 on 21/08/2026...");
  const snap = await db.collection("asignacion_cajas")
    .where("fecha", "==", "2026-08-21")
    .where("numeroCaja", "==", "20162")
    .get();

  snap.forEach(doc => {
    console.log("Found Asignacion:", doc.id);
    console.log(JSON.stringify(doc.data(), null, 2));
  });
  
  // also check liberacionesDock where numeroCaja is 20162
  const libSnap = await db.collection("liberacionesDock")
    .where("numeroCaja", "==", "20162")
    .get();
    
  console.log("Found", libSnap.size, "liberacionesDock for 20162");
  libSnap.forEach(doc => {
    console.log("Found LibDock:", doc.id);
    console.log(JSON.stringify(doc.data(), null, 2));
  });
}

checkDoubleRecord().then(() => setTimeout(() => process.exit(0), 1000));
