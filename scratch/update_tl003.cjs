const admin = require("firebase-admin");
const serviceAccount = require("../functions/service-account.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function updateRecord() {
  const docId = "TL00320260821ARCBMXTL";
  console.log(`Updating arribo to 08:00 for ${docId}...`);
  
  await db.collection("asignacion_cajas").doc(docId).update({
    arribo: "08:00",
    arriboAt: "2026-08-21T08:00:00-06:00",
    updatedAt: new Date().toISOString(),
    _manual_correction: "Set arribo to 08:00 per user request"
  });

  console.log("Update successful!");
}

updateRecord().catch(console.error).finally(() => process.exit(0));
