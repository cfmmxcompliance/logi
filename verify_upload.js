import https from 'https';

const reportId = '9b04de33-6b65-419f-b31b-085651116c94';

function fetchPage(pageToken) {
  return new Promise((resolve, reject) => {
    let url = `https://firestore.googleapis.com/v1/projects/logimaster-cfmoto/databases/(default)/documents/data_stage_reports/${reportId}/items?pageSize=300`;
    if (pageToken) url += `&pageToken=${pageToken}`;
    
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

function fetchHeader() {
  return new Promise((resolve, reject) => {
    const url = `https://firestore.googleapis.com/v1/projects/logimaster-cfmoto/databases/(default)/documents/data_stage_reports/${reportId}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

async function run() {
    console.log("Fetching report header...");
    const header = await fetchHeader();
    const stats = header.fields.stats.mapValue.fields;
    console.log(`Expected Pedimentos: ${stats.pedimentosCount.integerValue}`);
    console.log(`Expected Items (Partidas): ${stats.itemsCount.integerValue}`);
    console.log(`Expected Invoices (Facturas): ${stats.invoicesCount.integerValue}`);
    
    console.log("\nCounting actual saved Pedimentos in Firebase...");
    let count = 0;
    let itemsCount = 0;
    let invoicesCount = 0;
    let pageToken = null;
    do {
      const page = await fetchPage(pageToken);
      if (page.documents) {
        count += page.documents.length;
        page.documents.forEach(doc => {
           if(doc.fields.items && doc.fields.items.arrayValue && doc.fields.items.arrayValue.values) {
              itemsCount += doc.fields.items.arrayValue.values.length;
           }
           if(doc.fields.invoices && doc.fields.invoices.arrayValue && doc.fields.invoices.arrayValue.values) {
              invoicesCount += doc.fields.invoices.arrayValue.values.length;
           }
        });
      }
      pageToken = page.nextPageToken;
      process.stdout.write(`Loaded ${count} pedimentos...\r`);
    } while (pageToken);
    
    console.log("\n\n--- ACTUAL FIREBASE COUNT ---");
    console.log(`Pedimentos guardados: ${count}`);
    console.log(`Partidas (Items) guardadas: ${itemsCount}`);
    console.log(`Facturas (Invoices) guardadas: ${invoicesCount}`);
    
    if (count.toString() === stats.pedimentosCount.integerValue) {
        console.log("\n✅ ESTADO: 100% COMPLETO. Ningun pedimento se perdió en la subida.");
    } else {
        console.log(`\n❌ ERROR: Faltan ${parseInt(stats.pedimentosCount.integerValue) - count} pedimentos.`);
    }
}

run();
