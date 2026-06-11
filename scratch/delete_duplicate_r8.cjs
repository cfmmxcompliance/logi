const admin = require('firebase-admin');
const serviceAccount = require('../functions/service-account.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function fixDuplicates() {
  try {
    const snapshot = await db.collection('rule_8ths').get();
    const records = [];
    snapshot.forEach(doc => {
      records.push({ id: doc.id, ...doc.data() });
    });

    console.log(`Found ${records.length} total records in rule_8ths.`);

    const seenDesc = new Set();
    let deletedCount = 0;

    for (const record of records) {
      if (!record.description) continue;
      
      const key = record.description.trim().toUpperCase();
      if (seenDesc.has(key)) {
        console.log(`Found duplicate: ${record.description} (ID: ${record.id})`);
        await db.collection('rule_8ths').doc(record.id).delete();
        console.log(`Deleted duplicate ID: ${record.id}`);
        deletedCount++;
      } else {
        seenDesc.add(key);
      }
    }

    console.log(`Finished processing. Deleted ${deletedCount} duplicate records.`);
    process.exit(0);
  } catch (error) {
    console.error("Error fixing duplicates:", error);
    process.exit(1);
  }
}

fixDuplicates();
