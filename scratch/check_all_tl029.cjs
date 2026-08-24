const admin = require("firebase-admin");
const serviceAccount = require("../functions/service-account.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkAllTL029() {
  const snap = await db.collection("asignacion_cajas")
    .where("fecha", "==", "2026-08-21")
    .where("numeroOperacion", "==", "TL029")
    .get();

  snap.forEach(doc => {
    console.log("Found TL029:", doc.id);
  });
}

checkAllTL029().then(() => setTimeout(() => process.exit(0), 1000));
