const admin = require("firebase-admin");
const serviceAccount = require("../functions/service-account.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function inspect() {
  const libSnap = await db.collection("liberaciones").limit(5).get();
  libSnap.forEach(d => {
    console.log(d.id, d.data());
  });
}

inspect().catch(console.error).finally(() => process.exit(0));
