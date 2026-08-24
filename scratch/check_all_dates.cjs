const admin = require("firebase-admin");
const serviceAccount = require("../functions/service-account.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkAllDates() {
  console.log("Searching all liberacionesDock for asignacionCajaId TL02920260821ARCBLSTR...");
  const snap = await db.collection("liberacionesDock")
    .where("asignacionCajaId", "==", "TL02920260821ARCBLSTR")
    .get();

  if (snap.empty) {
    console.log("Absolutely no liberacionDock found for this ID anywhere in time.");
  } else {
    snap.forEach(doc => {
      console.log("FOUND IT! ID:", doc.id);
      console.log(JSON.stringify(doc.data(), null, 2));
    });
  }
}

checkAllDates().then(() => setTimeout(() => process.exit(0), 1000));
