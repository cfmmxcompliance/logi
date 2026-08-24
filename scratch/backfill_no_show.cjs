const admin = require("firebase-admin");
const path = require("path");

const serviceAccount = require("../functions/service-account.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function backfill() {
  console.log("Starting backfill for NO SHOW appointments (July - August 2026)...");
  
  // Rango de fechas: 1 de Julio al día de ayer (digamos hasta 22 de Agosto 2026)
  // Como `fecha` es string 'YYYY-MM-DD', haremos query range.
  
  const startDate = "2026-07-01";
  const endDate = "2026-07-31";
  
  console.log(`Date range: ${startDate} to ${endDate}`);

  const snapshot = await db.collection("asignacion_cajas")
    .where("fecha", ">=", startDate)
    .where("fecha", "<=", endDate)
    .get();

  let updatedCount = 0;
  let skippedCount = 0;
  // Firestore batches limit a 500, así que usaremos un iterador si excede, pero para esto bastará 500 o si no armamos un loop
  let batch = db.batch();
  let batchCount = 0;
  
  const commitBatch = async () => {
    if (batchCount > 0) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  };

  for (const doc of snapshot.docs) {
    const data = doc.data();
    
    // Es pendiente si NO tiene arribo
    const hasArribo = !!data.arribo && data.arribo.trim() !== "";
    
    // Ignorar si ya está cancelado, rechazado o no show
    const dockVal = String(data.dockArribo || "").trim().toUpperCase();
    const isCanceled = ["RECHAZADO", "DROP", "NO SHOW", "CANCELED", "CANCELADO"].includes(dockVal);
    
    if (!hasArribo && !isCanceled) {
      // Necesitamos inyectar "NO SHOW"
      console.log(`Marking as NO SHOW: ${doc.id} (Fecha: ${data.fecha}, Booking: ${data.numeroOperacion || data.booking || "N/A"})`);
      
      batch.update(doc.ref, {
        dockArribo: "NO SHOW",
        updatedAt: new Date().toISOString(),
        _backfill_reason: "NO_SHOW_CLEANUP"
      });
      
      updatedCount++;
      batchCount++;
      
      if (batchCount === 500) {
          await commitBatch();
      }
    } else {
      skippedCount++;
    }
  }

  await commitBatch();
  
  console.log(`Finished! Updated: ${updatedCount}, Skipped/Valid: ${skippedCount}`);
}

backfill().catch(console.error).finally(() => process.exit(0));
