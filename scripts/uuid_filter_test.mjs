import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
  authDomain: "logimaster-cfmoto.firebaseapp.com",
  projectId: "logimaster-cfmoto",
  storageBucket: "logimaster-cfmoto.firebasestorage.app",
  messagingSenderId: "924452835722",
  appId: "1:924452835722:web:11a7eedec65ba034dc7873"
};

// ── The 12 UUIDs provided by the user ─────────────────────────
const TARGET_UUIDS = [
  "6C9B85A4-B024-45FB-A491-F1BFED1D9018",
  "C7C35-9460-4421-A544-FF1C1728DD8C",
  "7DDD639D-9B68-49FF-AFF1-837AAC4C2F3D",
  "7DE32BE2-1A9F-4884-AD90-7FOBA2C8D972",
  "990FOCAD-B993-427F-B936-385CD2AE2487",
  "AEAD15A4-FFDA-432D-B6EC-35E33C4A9549",
  "FDBFF5C1-6A2A-4498-9AE9-F1E7F481712E",
  "FOEBFFGD-62F9-4085-94EE-2129379197BE",
  "FEIBOCGE-7CGD-4567-A640-F93E11A0880B",
  "21B4DA99-3100-4810-B1A1-599F79FB9896",
  "24D99131-6BF5-4606-8AB5-526D8F96182D",
  "6215818C-A41D-452F-B1C5-5B619EAGECB5"
];

// ── Same normalization logic as the frontend filter ─────────────
const norm       = s => s.toUpperCase().replace(/O/g, '0').replace(/I/g, '1').replace(/G/g, '6');
const stripDash  = s => s.replace(/-/g, '');

function wouldMatch(storedUUID, searchTerm) {
  const stored      = (storedUUID || '').toLowerCase();
  const storedNorm  = norm(storedUUID || '').toLowerCase();
  const storedND    = stripDash(stored);
  const storedNormND= stripDash(storedNorm);

  const termLow     = searchTerm.toLowerCase();
  const termNorm    = norm(searchTerm).toLowerCase();
  const termND      = stripDash(termLow);
  const termNormND  = stripDash(termNorm);

  if (stored.includes(termLow))         return '✅ match directo';
  if (storedNorm.includes(termNorm))    return '✅ match normalizado (O→0/I→1/G→6)';
  if (storedND.includes(termND))        return '✅ match sin guiones';
  if (storedNormND.includes(termNormND))return '✅ match normalizado+sin guiones';
  return '❌ NO MATCH';
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const db  = getFirestore(app);

  console.log('Fetching cfdi_invoices from Firestore...\n');
  const snap = await getDocs(collection(db, 'cfdi_invoices'));
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  console.log(`Total registros en cfdi_invoices: ${docs.length}`);

  // Get unique UUIDs stored in Firestore
  const storedUUIDs = [...new Set(docs.map(d => d.uuid || d.UUID || '').filter(Boolean))];
  console.log(`UUIDs únicos en Firestore: ${storedUUIDs.length}\n`);
  console.log('─'.repeat(80));

  // Test each of the 12 target UUIDs
  for (const target of TARGET_UUIDS) {
    const targetNorm = norm(target).toLowerCase();

    // Find best matching stored UUID
    let bestMatch   = null;
    let matchResult = '❌ NO MATCH — no existe en Firestore';

    for (const stored of storedUUIDs) {
      const result = wouldMatch(stored, target);
      if (result.startsWith('✅')) {
        bestMatch   = stored;
        matchResult = result;
        break;
      }
    }

    console.log(`\nBUSCADO : ${target}`);
    if (bestMatch) {
      console.log(`GUARDADO: ${bestMatch}`);
    }
    console.log(`RESULTADO: ${matchResult}`);
  }

  console.log('\n' + '─'.repeat(80));
  console.log('Análisis completo.\n');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
