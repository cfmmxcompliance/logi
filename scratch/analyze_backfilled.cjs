const admin = require("firebase-admin");
const serviceAccount = require("../functions/service-account.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function analyze() {
  const snapshot = await db.collection("asignacion_cajas")
    .where("_backfill_reason", "==", "NO_SHOW_CLEANUP")
    .get();

  const libSnap = await db.collection("liberacionesCaja").get();
  const liberaciones = libSnap.docs.map(d => d.data());

  let totalBackfilled = snapshot.docs.length;
  let withLib = 0;

  for (const doc of snapshot.docs) {
    const hasLib = liberaciones.some(l => l.asignacionCajaId === doc.id);
    if (hasLib) {
      withLib++;
    }
  }

  console.log(`Total Backfilled by script: ${totalBackfilled}`);
  console.log(`Backfilled but actually had Caseta Release: ${withLib}`);
}

analyze().catch(console.error).finally(() => process.exit(0));
