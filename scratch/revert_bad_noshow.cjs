const admin = require("firebase-admin");
const serviceAccount = require("../functions/service-account.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function revert() {
  const snapshot = await db.collection("asignacion_cajas")
    .where("_backfill_reason", "==", "NO_SHOW_CLEANUP")
    .get();

  const libSnap = await db.collection("liberacionesCaja").get();
  const liberaciones = libSnap.docs.map(d => d.data());

  let batch = db.batch();
  let reverted = 0;

  for (const doc of snapshot.docs) {
    const hasLib = liberaciones.some(l => l.asignacionCajaId === doc.id);
    if (hasLib) {
      batch.update(doc.ref, {
        dockArribo: "",
        _backfill_reason: "REVERTED_HAD_CASETA"
      });
      reverted++;
    }
  }

  if (reverted > 0) {
    await batch.commit();
  }

  console.log(`Reverted ${reverted} false NO SHOWs back to CERRADO.`);
}

revert().catch(console.error).finally(() => process.exit(0));
