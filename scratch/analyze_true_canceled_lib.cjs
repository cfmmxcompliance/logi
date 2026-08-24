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

  const libSnap = await db.collection("liberacionesCaja").get();
  const liberaciones = libSnap.docs.map(d => d.data());

  let totalCanceled = 0;
  let canceledWithLib = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const dockVal = String(data.dockArribo || "").trim().toUpperCase();
    const isCanceled = ["RECHAZADO", "DROP", "NO SHOW", "CANCELED", "CANCELADO"].includes(dockVal);
    
    if (isCanceled) {
      totalCanceled++;
      const lib = liberaciones.find(l => l.asignacionCajaId === doc.id);
      if (lib) {
        canceledWithLib++;
        console.log(`\nCANCELED RECORD WITH LIBERACION (Caseta):`);
        console.log(`ID: ${doc.id}`);
        console.log(`Status (dockArribo): ${dockVal}`);
        console.log(`Operacion: ${data.numeroOperacion}`);
        console.log(`Liberado Por: ${lib.creadoPor || lib.usuario || lib.liberadoPor}`);
        console.log(`Liberado At: ${lib.fechaHoraRegistro || lib.createdAt}`);
      }
    }
  }

  console.log(`\nTotal Canceled in July: ${totalCanceled}`);
  console.log(`Total Canceled with Caseta Release in July: ${canceledWithLib}`);
}

analyze().catch(console.error).finally(() => process.exit(0));
