/**
 * fix_customid_from_scac.ts
 * Recalcula customId usando los campos del propio documento:
 * {numeroOperacion}{YYYYMMDD}{carrierCodigo}{scac}
 * Solo toca registros donde customId no coincide con esa fórmula.
 */
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from './services/firebaseConfig.js';

function buildId(data: any): string {
  const op    = (data.numeroOperacion || '').trim();
  const fecha = (data.fecha || '').replace(/-/g, '');
  const cod   = (data.carrierCodigo  || '').trim();
  const scac  = (data.scac           || '').trim();
  if (!op || !fecha) return '';
  return `${op}${fecha}${cod}${scac}`;
}

async function main() {
  console.log('=== Fix customId desde campos del documento ===\n');
  const snap = await getDocs(collection(db, 'asignacion_cajas'));

  let fixed = 0, already = 0, incomplete = 0;

  for (const d of snap.docs) {
    const data = d.data();
    const expected = buildId(data);
    if (!expected) { incomplete++; continue; }

    const current = (data.customId || '').trim();
    if (current === expected) { already++; continue; }

    await updateDoc(doc(db, 'asignacion_cajas', d.id), { customId: expected });
    console.log(`  ✅ Op:${data.numeroOperacion} | ${current || '(vacío)'} → ${expected}`);
    fixed++;
  }

  console.log(`\nCorregidos: ${fixed} | Ya correctos: ${already} | Sin datos suficientes: ${incomplete}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
