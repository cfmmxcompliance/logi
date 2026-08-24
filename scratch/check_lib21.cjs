const admin = require("firebase-admin");
const serviceAccount = require("../functions/service-account.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkAllLiberaciones() {
  console.log("Searching all liberacionesDock on 2026-08-21...");
  const snap = await db.collection("liberacionesDock")
    .where("fechaLiberacion", "==", "2026-08-21")
    .get();

  snap.forEach(doc => {
    const data = doc.data();
    if (data.asignacionCajaId.includes("TL029") || data.numeroCaja === "20162" || data.fechaHoraRegistro?.includes("17:24")) {
       console.log("Found match!", JSON.stringify(data, null, 2));
    }
  });
  console.log("Done checking", snap.size, "records.");
}

checkAllLiberaciones().then(() => setTimeout(() => process.exit(0), 1000));
