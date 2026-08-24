const admin = require("firebase-admin");
const serviceAccount = require("../functions/service-account.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkLiberacion() {
  console.log("Searching for liberaciones for caja 20162 on 21/08/2026...");
  const libSnap = await db.collection("liberacionesDock")
    .where("numeroCaja", "==", "20162")
    .where("fechaLiberacion", "==", "2026-08-21")
    .get();

  if (libSnap.empty) {
    console.log("Still no liberacion found by numeroCaja and fechaLiberacion.");
  }

  libSnap.forEach(lDoc => {
    console.log("Found liberacion ID:", lDoc.id);
    console.log(JSON.stringify(lDoc.data(), null, 2));
  });
}

checkLiberacion().then(() => setTimeout(() => process.exit(0), 1000));
