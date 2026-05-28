// insert_hbl_NGB26041832.mjs
// ONE-TIME SCRIPT — Insert HBL C232154202 / MBL NGB26041832
// Source: C232154202-HBL Draft.pdf

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const serviceAccount = require('./logimaster-cfmoto-a59f54d6641a.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const BL       = 'NGB26041832';   // MBL (naviera YANG MING)
const HBL      = 'C232154202';    // HBL (agente MOL)
const NOW      = new Date().toISOString();

const containers = [
  { containerNo: 'YMMU6693614', sealNo: 'YMAW477556', packages: 14, kgs: 9231,  cbm: 64.76 },
  { containerNo: 'YMMU7317817', sealNo: 'YMAV994814', packages: 9,  kgs: 4349,  cbm: 41.16 },
  { containerNo: 'YMLU8967351', sealNo: 'YMAW477551', packages: 34, kgs: 16382, cbm: 46.58 },
  { containerNo: 'BMOU6289000', sealNo: 'YMAV994889', packages: 31, kgs: 13186, cbm: 50.31 },
  { containerNo: 'YMMU6005413', sealNo: 'YMAV994813', packages: 14, kgs: 13590, cbm: 66.98 },
  { containerNo: 'YMMU7118630', sealNo: 'YMAV994818', packages: 14, kgs: 11699, cbm: 66.98 },
  { containerNo: 'YMMU7119257', sealNo: 'YMAV994815', packages: 16, kgs: 9163,  cbm: 66.08 },
  { containerNo: 'BMOU6306622', sealNo: 'YMAW477557', packages: 12, kgs: 10387, cbm: 67.26 },
  { containerNo: 'FFAU1322637', sealNo: 'YMAV994885', packages: 28, kgs: 12221, cbm: 47.32 },
  { containerNo: 'YMMU6052734', sealNo: 'YMAV994819', packages: 14, kgs: 8952,  cbm: 66.36 },
];

async function run() {
  const batch = db.batch();

  // 1. PreAlert
  const preAlertRef = db.collection('preAlerts').doc(BL);
  batch.set(preAlertRef, {
    id:                BL,
    bookingAbw:        BL,
    hblNo:             HBL,
    model:             'CM1000UZ-8K (CKD)',
    shippingMode:      'SEA',
    shippingCompany:   'YANG MING',
    vessel:            'EVER LIBERAL',
    voyage:            '0784-070E',
    departureCity:     'NINGBO',
    arrivalCity:       'MANZANILLO, MX',
    etd:               '2026-05-26',
    invoiceNo:         '26-N-CFM17753',
    grossWeight:       109160,
    cbm:               583.79,
    packages:          186,
    freightTerms:      'PREPAID',
    agent:             'MOL LOGISTICS MEXICO',
    shipper:           'ZHEJIANG CFMOTO POWER CO., LTD',
    consignee:         'CFMOTO MEXICO POWER, S. DE R.L. DE C.V.',
    linkedContainers:  containers.map(c => c.containerNo),
    processed:         true,
    updatedAt:         NOW,
  }, { merge: true });

  // 2. Shipment
  const shipmentRef = db.collection('shipments').doc(BL);
  batch.set(shipmentRef, {
    id:          BL,
    blNo:        BL,
    hblNo:       HBL,
    reference:   BL,
    vessel:      'EVER LIBERAL',
    voyage:      '0784-070E',
    pol:         'NINGBO',
    pod:         'MANZANILLO, MX',
    etd:         '2026-05-26',
    containers:  containers.map(c => c.containerNo),
    updatedAt:   NOW,
  }, { merge: true });

  // 3. VesselTracking + CustomsClearance per container
  for (const c of containers) {
    const docId = `${BL}-${c.containerNo}`;

    batch.set(db.collection('vesselTracking').doc(docId), {
      id:            docId,
      blNo:          BL,
      hblNo:         HBL,
      containerNo:   c.containerNo,
      sealNo:        c.sealNo,
      containerSize: '40HC',
      modelCode:     'CM1000UZ-8K (CKD)',
      invoiceNo:     '26-N-CFM17753',
      packages:      c.packages,
      grossWeight:   c.kgs,
      cbm:           c.cbm,
      etd:           '2026-05-26',
      etaPort:       null,
      vessel:        'EVER LIBERAL',
      voyage:        '0784-070E',
      pol:           'NINGBO',
      pod:           'MANZANILLO, MX',
      freightTerms:  'PREPAID',
      updatedAt:     NOW,
    }, { merge: true });

    batch.set(db.collection('customsClearance').doc(docId), {
      id:            docId,
      blNo:          BL,
      hblNo:         HBL,
      containerNo:   c.containerNo,
      sealNo:        c.sealNo,
      containerSize: '40HC',
      updatedAt:     NOW,
    }, { merge: true });
  }

  await batch.commit();

  console.log('✅ Insertado exitosamente:');
  console.log(`   PreAlert:          preAlerts/${BL}`);
  console.log(`   Shipment:          shipments/${BL}`);
  console.log(`   VesselTracking:    ${containers.length} registros`);
  console.log(`   CustomsClearance:  ${containers.length} registros`);
  console.log(`   TOTAL:             ${2 + containers.length * 2} documentos en Firestore`);
}

run().catch(e => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});
