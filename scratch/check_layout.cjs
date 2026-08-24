const admin = require("firebase-admin");
const serviceAccount = require("../functions/service-account.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkLayoutData() {
  console.log("Checking records from the last few days...");
  
  // Get records from August
  const snapshot = await db.collection("asignacion_cajas")
    .where("fecha", ">=", "2026-08-01")
    .get();

  let missingLibDateCount = 0;
  let negativeDurationCount = 0;
  let validCount = 0;
  let missingLayoutCount = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const lyAt = data.layoutUploadedAt ? new Date(data.layoutUploadedAt) : null;
    
    if (!lyAt) {
      missingLayoutCount++;
      continue;
    }

    // layout is uploaded. Check libDate.
    const libSnap = await db.collection("liberacionesDock")
      .where("asignacionCajaId", "==", doc.id)
      .get();
      
    let libDate = null;
    if (!libSnap.empty) {
      const libData = libSnap.docs[0].data();
      const s = libData.fechaHoraRegistro; // format: "21/8/2026, 08:21:31"
      if (s) {
        const mx = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{2}:\d{2}:\d{2})/);
        if (mx) {
            libDate = new Date(`${mx[3]}-${mx[2].padStart(2,'0')}-${mx[1].padStart(2,'0')}T${mx[4]}-06:00`);
        }
      }
    }
    
    if (!libDate) {
      missingLibDateCount++;
      console.log(`- ${doc.id} (${data.numeroOperacion}): Layout uploaded but NO libDate.`);
    } else {
      const mins = Math.round((lyAt.getTime() - libDate.getTime()) / 60000);
      if (mins < 0) {
        negativeDurationCount++;
        console.log(`- ${doc.id} (${data.numeroOperacion}): Layout BEFORE libDate (Mins: ${mins}). lyAt=${lyAt.toISOString()}, libDate=${libDate.toISOString()}`);
      } else {
        validCount++;
      }
    }
  }

  console.log("--- SUMMARY ---");
  console.log("Valid T.LAYOUT durations:", validCount);
  console.log("Missing Layout entirely:", missingLayoutCount);
  console.log("Layout exists but NO libDate:", missingLibDateCount);
  console.log("Layout exists but BEFORE libDate (Negative):", negativeDurationCount);
}

checkLayoutData().then(() => setTimeout(() => process.exit(0), 1000));
