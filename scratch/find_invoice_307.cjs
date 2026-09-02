const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();

async function run() {
  console.log("Searching in pre_alerts for factura 26CFTTN-644211-1-1...");
  const preAlerts = await db.collection('pre_alerts')
    .where('Factura', '==', '26CFTTN-644211-1-1')
    .get();
  
  if (!preAlerts.empty) {
    preAlerts.forEach(doc => {
      console.log(`Found in pre_alerts: ${doc.id}`);
      const data = doc.data();
      if (data.Contenedor === 'EGSU9961725') {
          console.log(`  -> Matches container EGSU9961725`);
          console.log(`  -> Current price: ${data['Unit Price']} or ${data.unitPrice} or ${data.UnitPrice} or ${data['Precio Unitario']}`);
      }
    });
  } else {
    console.log("Not found in pre_alerts by Factura exact match.");
  }
  
  console.log("Searching in pre_alerts for Contenedor EGSU9961725...");
  const byContainer = await db.collection('pre_alerts')
    .where('Contenedor', '==', 'EGSU9961725')
    .get();
  
  if (!byContainer.empty) {
    let found = false;
    byContainer.forEach(doc => {
      const data = doc.data();
      if (data.Factura === '26CFTTN-644211-1-1' || data.Invoice === '26CFTTN-644211-1-1') {
          console.log(`Found by container: ${doc.id}`);
          console.log(`  -> Current price: ${data['Unit Price']} or ${data.unitPrice}`);
          console.log(`  -> Keys: ${Object.keys(data).join(', ')}`);
          found = true;
      }
    });
    if (!found) console.log("Container found, but Factura didn't match.");
  } else {
    console.log("Not found by Contenedor.");
  }

}
run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
