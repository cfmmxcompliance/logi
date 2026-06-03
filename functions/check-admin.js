const admin = require('firebase-admin');

// Initialize without credentials will use Application Default Credentials if in cloud, 
// or if we have a service account key we can load it. Let's look for one.
const fs = require('fs');
let serviceAccount;
try {
  const files = fs.readdirSync('./');
  const keyFile = files.find(f => f.includes('serviceAccount') && f.endsWith('.json'));
  if (keyFile) {
    serviceAccount = require('./' + keyFile);
  } else {
    // try parent
    const parentFiles = fs.readdirSync('../');
    const pKeyFile = parentFiles.find(f => f.includes('serviceAccount') && f.endsWith('.json'));
    if (pKeyFile) {
      serviceAccount = require('../' + pKeyFile);
    }
  }
} catch (e) {}

if (serviceAccount) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} else {
  console.log("No service account key found. Attempting ADC...");
  admin.initializeApp();
}

const db = admin.firestore();

async function run() {
  const q = db.collection('vigilancia').where('fecha', '==', '2026-06-01');
  const snap = await q.get();
  console.log("Found:", snap.size);
  snap.forEach(doc => {
    console.log(doc.id, "=>", doc.data());
  });
}

run().catch(console.error);
