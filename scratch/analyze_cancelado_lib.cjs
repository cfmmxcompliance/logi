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

  let canceladoCount = 0;
  let canceladoWithLib = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const dockVal = String(data.dockArribo || "").trim().toUpperCase();
    
    if (dockVal === "CANCELADO") {
      canceladoCount++;
      const hasLib = liberaciones.some(l => l.asignacionCajaId === doc.id);
      if (hasLib) {
        canceladoWithLib++;
      }
    }
  }

  console.log(`Total CANCELADO in July: ${canceladoCount}`);
  console.log(`Total CANCELADO with Caseta Release in July: ${canceladoWithLib}`);
}

analyze().catch(console.error).finally(() => process.exit(0));
