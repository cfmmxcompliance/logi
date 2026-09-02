import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

try {
  initializeApp(); // Uses ADC
} catch(e) {
  console.log("ADC failed", e.message);
}

const db = getFirestore();

async function run() {
  console.log("Updating TQB383 / TBQ383 for invoice 26CFTTN-644211-1-1...");
  
  const snap = await db.collection('commercial_invoices')
      .where('invoiceNo', '==', '26CFTTN-644211-1-1')
      .get();
      
  let updatedCount = 0;
  for (const d of snap.docs) {
      const data = d.data();
      if (data.partNo === 'TQB383' || data.partNo === 'TBQ383') {
          console.log(`MATCH FOUND for partNo ${data.partNo} in doc ${d.id}`);
          console.log(`Current unitPrice: ${data.unitPrice}`);
          
          await db.collection('commercial_invoices').doc(d.id).update({
              unitPrice: 3.07
          });
          console.log("Updated unitPrice to 3.07 successfully!");
          updatedCount++;
      }
  }
  
  if (updatedCount === 0) {
      console.log("No matching partNo found for that invoice!");
  }
}
run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
