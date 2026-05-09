// Real UUIDs extracted from XML files directly with regex
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const realUUIDs = [
  'aead15a4-feda-432d-b6ec-35e33c4a9549',   // 5652133
  '21b4da99-3100-4810-b1a1-589f79fb9896',   // 5637752
  '990f0cad-b993-427f-b836-385cd2ae2487',   // 5663544
  '6c9b85a4-b024-45fb-a491-f1bfed1d9018',   // 5637696
  '7de32be2-1a9f-48b4-ad90-7e0ba2c8d972',   // 5640696
  '7ddd639d-9b68-49ff-aff1-837aac4c2f3d',   // 5637797
  'f0ebff6d-62f9-4db5-94ee-2129379197be',   // 5640615
  '24d99131-6bf5-4606-8ab5-526d8f96182d',   // 5638072
  '7cac7c55-9460-44e1-a544-ff1c1728dd8c',   // 5640588
  'fe1bcc6e-7c6d-4567-a640-f83e11a0880b',   // 5652145
  'edbff5c1-6a2a-4498-9ae9-f1e7f481712e',   // 5652155
  '6215818c-a41d-452f-b1c5-5b619ea6ecb5'    // 5633473
];

const cfg = {
  apiKey: 'AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU',
  projectId: 'logimaster-cfmoto',
};

const app = initializeApp(cfg);
const db = getFirestore(app);

const snap = await getDocs(collection(db, 'cfdi_invoices'));
const storedUUIDs = new Set(snap.docs.map(d => (d.data().uuid || '').toLowerCase()));
console.log(`Firestore total: ${storedUUIDs.size} UUIDs\n`);

let found = 0;
realUUIDs.forEach(u => {
  const ok = storedUUIDs.has(u);
  if (ok) found++;
  console.log((ok ? '✅' : '❌') + ' ' + u);
});
console.log(`\nTotal: ${found}/12 encontrados en Firestore`);
process.exit(0);
