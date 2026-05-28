const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function check() {
  const rangeStart = '2026-05-31';
  const rangeEnd = '2026-05-31';

  const snapAsig = await db.collection('asignacion_cajas').get();
  const snapLib = await db.collection('liberacionesCaja').get();
  
  const asignaciones = snapAsig.docs.map(d => ({ id: d.id, ...d.data() }));
  const liberaciones = snapLib.docs.map(d => ({ id: d.id, ...d.data() }));

  const badgeCarrier = asignaciones.filter(a => {
    const fecha = a.fecha || '';
    const inRange = fecha >= rangeStart && fecha <= rangeEnd;
    const hasLayout = !!(a.layoutUrl || a.layoutUploadedAt);
    const hasCCP = !!(a.ccpUrl || a.ccpUploadedAt);
    const isClosed = liberaciones.some(l => l.asignacionCajaId === a.id && !!l.selloValidado);
    return inRange && hasLayout && !hasCCP && !isClosed;
  });

  const badgeAdmin = asignaciones.filter(a => {
    const fecha = a.fecha || '';
    const inRange = fecha >= rangeStart && fecha <= rangeEnd;
    const hasCCP = !!(a.ccpUrl || a.ccpUploadedAt);
    const isClosed = liberaciones.some(l => l.asignacionCajaId === a.id && !!l.selloValidado);
    return inRange && hasCCP && !isClosed;
  });

  console.log("Carrier matching records:", JSON.stringify(badgeCarrier, null, 2));
  console.log("Admin matching records:", JSON.stringify(badgeAdmin, null, 2));
}

check().catch(console.error);
