const admin = require("firebase-admin");
const serviceAccount = require("../functions/service-account.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function analyze() {
  const snapshot = await db.collection("asignacion_cajas")
    .where("fecha", ">=", "2026-08-01")
    .where("fecha", "<=", "2026-08-31")
    .get();

  const libSnap = await db.collection("liberaciones").get();
  const liberaciones = libSnap.docs.map(d => d.data());

  console.log(`Found ${snapshot.docs.length} assignments in August.`);

  let canceledWithLib = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const dockVal = String(data.dockArribo || "").trim().toUpperCase();
    const isCanceled = ["RECHAZADO", "DROP", "NO SHOW", "CANCELED", "CANCELADO"].includes(dockVal);
    
    if (isCanceled) {
      const lib = liberaciones.find(l => l.asignacionCajaId === doc.id);
      if (lib) {
        canceledWithLib++;
        console.log(`\nCANCELED RECORD WITH LIBERACION:`);
        console.log(`ID: ${doc.id}`);
        console.log(`Status (dockArribo): ${dockVal}`);
        console.log(`Operacion: ${data.numeroOperacion}`);
        console.log(`Arribo: ${data.arriboAt || data.arribo || "N/A"}`);
        console.log(`Liberado Por: ${lib.creadoPor || lib.usuario || lib.liberadoPor}`);
        console.log(`Liberado At: ${lib.fechaHoraRegistro || lib.createdAt}`);
      }
    }
  }

  console.log(`\nTotal Canceled with Liberacion in August: ${canceledWithLib}`);
}

analyze().catch(console.error).finally(() => process.exit(0));
