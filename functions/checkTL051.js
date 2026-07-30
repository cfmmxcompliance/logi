const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkTL051() {
  console.log('Querying sellos...');
  const sellosSnap = await db.collection('sellos').get();
  
  const matches = [];
  sellosSnap.forEach(doc => {
    const data = doc.data();
    if (data.numeroCaja === 'TL051' || data.numeroOperacion === 'TL051' || data.selloAsignado === '744985' || data.selloAsignado === '744886') {
      matches.push({ id: doc.id, ...data });
    }
  });
  
  console.log('Sellos matches:', JSON.stringify(matches, null, 2));

  console.log('Querying asignaciones...');
  const asigSnap = await db.collection('asignacionesCaja53').get();
  const asigMatches = [];
  asigSnap.forEach(doc => {
    const data = doc.data();
    if (data.numeroCaja === 'TL051' || data.numeroOperacion === 'TL051') {
      asigMatches.push({ id: doc.id, ...data });
    }
  });
  
  console.log('Asignaciones matches:', JSON.stringify(asigMatches, null, 2));
}

checkTL051().then(() => process.exit(0)).catch(console.error);
