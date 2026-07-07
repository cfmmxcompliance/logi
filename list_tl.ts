import { collection, getDocs } from 'firebase/firestore';
import { db } from './services/firebaseConfig.js';

async function main() {
  const snap = await getDocs(collection(db, 'transport_lines'));
  console.log(`\nTransport lines (${snap.size}):`);
  snap.forEach(d => {
    const data = d.data();
    console.log(`  ID:${d.id} | transportLineId:${data.transportLineId} | TransportLine:${data.TransportLine || '(vacío)'} | nombre:${data.nombreSubLinea || data.nombre || ''}`);
  });
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
