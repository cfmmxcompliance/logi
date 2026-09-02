import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

try {
  initializeApp(); // Uses ADC
} catch(e) {
  console.log("ADC failed", e.message);
}

const db = getFirestore();

async function run() {
  console.log("Checking audit_subscriptions...");
  
  const snap = await db.collection('audit_subscriptions').doc('daily_audit').get();
  if (snap.exists) {
      console.log("Data:", snap.data());
  } else {
      console.log("Document does not exist");
  }
}
run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
