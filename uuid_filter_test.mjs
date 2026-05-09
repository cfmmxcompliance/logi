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

// Normalize: uppercase + replace ambiguous chars + strip dashes
const norm       = s => s.toUpperCase().replace(/O/g, '0').replace(/I/g, '1').replace(/G/g, '6');
const stripDash  = s => s.replace(/-/g, '');
const normStrip  = s => stripDash(norm(s));

// Levenshtein distance for fuzzy matching
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({length: m+1}, (_, i) => Array.from({length: n+1}, (_, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const db  = getFirestore(app);

  console.log('Fetching cfdi_invoices...\n');
  const snap = await getDocs(collection(db, 'cfdi_invoices'));
  const storedUUIDs = [...new Set(
    snap.docs.map(d => d.data().uuid || d.data().UUID || '').filter(Boolean)
  )];

  console.log(`UUIDs únicos en Firestore: ${storedUUIDs.length}\n`);
  console.log('═'.repeat(90));

  for (const target of TARGET_UUIDS) {
    const tLow      = target.toLowerCase();
    const tNorm     = norm(target).toLowerCase();
    const tNormStrip = normStrip(target).toLowerCase();

    // Exact / normalized match
    let exactMatch = null;
    for (const s of storedUUIDs) {
      const sLow = s.toLowerCase();
      const sNorm = norm(s).toLowerCase();
      const sNS   = normStrip(s).toLowerCase();
      if (sLow === tLow || sNorm === tNorm || sNS === tNormStrip ||
          sLow.includes(tLow) || sNorm.includes(tNorm)) {
        exactMatch = s;
        break;
      }
    }

    if (exactMatch) {
      console.log(`\n✅ ENCONTRADO`);
      console.log(`   Buscado : ${target}`);
      console.log(`   Guardado: ${exactMatch}`);
    } else {
      // Find closest UUID by Levenshtein on normalized+stripped strings
      let bestDist = Infinity;
      let bestUUID = '';
      for (const s of storedUUIDs) {
        const dist = levenshtein(tNormStrip, normStrip(s));
        if (dist < bestDist) { bestDist = dist; bestUUID = s; }
      }
      console.log(`\n❌ NO ENCONTRADO`);
      console.log(`   Buscado   : ${target}`);
      console.log(`   Normalizado: ${tNorm}`);
      console.log(`   Más cercano en Firestore (dist=${bestDist}): ${bestUUID}`);
      if (bestDist <= 4) {
        console.log(`   ⚠️  DIFERENCIAS (pos a pos):`);
        const a = tNormStrip.toUpperCase();
        const b = normStrip(bestUUID).toUpperCase();
        const maxLen = Math.max(a.length, b.length);
        let diffs = [];
        for (let i = 0; i < maxLen; i++) {
          if (a[i] !== b[i]) diffs.push(`pos${i+1}: '${a[i]||'_'}' vs '${b[i]||'_'}'`);
        }
        console.log(`   ${diffs.join('  |  ')}`);
      }
    }
  }

  console.log('\n' + '═'.repeat(90));
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
