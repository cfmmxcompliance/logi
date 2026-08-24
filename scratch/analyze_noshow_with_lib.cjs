const admin = require("firebase-admin");
const serviceAccount = require("../functions/service-account.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function analyze() {
  const snapshot = await db.collection("asignacion_cajas")
    .where("fecha", ">=", "2026-07-01")
    .where("fecha", "<=", "2026-07-31")
    .get();

  const libSnap = await db.collection("liberaciones").get();
  const liberaciones = libSnap.docs.map(d => d.data());

  let noShowWithLib = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const dockVal = String(data.dockArribo || "").trim().toUpperCase();
    
    if (dockVal === "NO SHOW") {
      const hasLib = liberaciones.some(l => l.asignacionCajaId === doc.id);
      if (hasLib) {
        noShowWithLib++;
      }
    }
  }

  console.log(`Total NO SHOW with Caseta Release in July: ${noShowWithLib}`);
}

analyze().catch(console.error).finally(() => process.exit(0));
