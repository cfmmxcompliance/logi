const admin = require("firebase-admin");
const serviceAccount = require("../functions/service-account.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function analyze() {
  const snapshot = await db.collection("asignacion_cajas")
    .where("numeroCaja", "==", "553356")
    .get();

  if (snapshot.empty) {
    console.log("No assignments found for caja 553356");
    return;
  }

  const libSnap = await db.collection("liberacionesCaja").get();
  const liberaciones = libSnap.docs.map(d => d.data());

  for (const doc of snapshot.docs) {
    const data = doc.data();
    console.log("=== ASIGNACION ===");
    console.log("ID:", doc.id);
    console.log("Operacion:", data.numeroOperacion);
    console.log("Caja:", data.numeroCaja);
    console.log("Fecha:", data.fecha);
    console.log("Dock Arribo:", data.dockArribo);
    console.log("Status (if any):", data.status);
    console.log("Arribo:", data.arribo);
    
    const hasLib = liberaciones.find(l => l.asignacionCajaId === doc.id);
    console.log("Has Caseta Release (liberacionesCaja):", !!hasLib);
    if (hasLib) {
      console.log("  Liberado At:", hasLib.fechaHoraRegistro || hasLib.fechaLiberacion);
      console.log("  Liberado Por:", hasLib.creadoPor || hasLib.liberadoPor);
    }
  }
}

analyze().catch(console.error).finally(() => process.exit(0));
