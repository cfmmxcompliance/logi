const admin = require('firebase-admin');
const serviceAccount = require('../functions/service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function fixFirebase() {
    const rulesRef = db.collection('r8_rules');
    const snapshot = await rulesRef.get();
    let updated = 0;
    
    for (const doc of snapshot.docs) {
        const data = doc.data();
        let changed = false;
        let newDesc = data.description;
        
        if (newDesc === 'TAPON DEL CINTURON DE SEGIRIDAD') {
            newDesc = 'TAPON DEL CINTURON DE SEGURIDAD';
            changed = true;
        }
        if (newDesc === 'BROCHE DE CINTURO DERECHO') {
            newDesc = 'BROCHE DE CINTURON DERECHO';
            changed = true;
        }
        
        // Let's print everything we see so we can verify if there are other typos.
        console.log(`ID: ${doc.id} | Desc: ${data.description}`);
        
        if (changed) {
            console.log(`-> Updating to: ${newDesc}`);
            await rulesRef.doc(doc.id).update({ description: newDesc });
            updated++;
        }
    }
    
    console.log(`Updated ${updated} records.`);
}

fixFirebase().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
