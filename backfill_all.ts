/**
 * backfill_all.ts
 * Para todos los registros con layoutUrl:
 *  - Extrae cfmRef del nombre del archivo (después de "LAY OUT CCP_")
 *  - Extrae vehiculos de la celda D26 del Excel
 * Solo actualiza campos que aún faltan.
 */
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from './services/firebaseConfig.js';
import * as XLSX from 'xlsx';

const GAS_URL = 'https://script.google.com/macros/s/AKfycbzX3ctF0kOxbw2M4uHbkPp8gsIy-EMQX64M5IEzMHTQs0gUxR-7BOx9BMe2RVEFKeWh/exec';
const PREFIX = 'LAY OUT CCP_';

function extractFileId(url: string): string | null {
  const m = url.match(/\/d\/([\w-]+)/);
  return m ? m[1] : null;
}

function extractCfmRef(filename: string): string {
  const raw = filename.replace(/\.[^/.]+$/, '');
  const idx = raw.toUpperCase().indexOf(PREFIX.toUpperCase());
  return idx !== -1 ? raw.substring(idx + PREFIX.length).trim() : '';
}

async function getFileData(fileId: string): Promise<{ filename: string; vehiculos: string }> {
  const resp = await fetch(`${GAS_URL}?action=readFile&fileId=${fileId}`);
  const json = await resp.json() as any;
  if (json.error) throw new Error(json.error);
  const buf = Buffer.from(json.content, 'base64');
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const vehiculos = sheet['D26']?.v ? String(sheet['D26'].v).trim() : '';
  return { filename: json.name || '', vehiculos };
}

async function main() {
  console.log('=== Backfill masivo: cfmRef + vehiculos ===\n');
  const snap = await getDocs(collection(db, 'asignacion_cajas'));

  const pending: Array<{ docId: string; layoutUrl: string; op: string; hasCfm: boolean; hasVeh: boolean }> = [];
  snap.forEach(d => {
    const data = d.data();
    if (!data.layoutUrl) return;
    const hasCfm = !!data.cfmRef;
    const hasVeh = !!data.vehiculos;
    if (!hasCfm || !hasVeh) {
      pending.push({ docId: d.id, layoutUrl: data.layoutUrl, op: data.numeroOperacion || d.id, hasCfm, hasVeh });
    }
  });

  console.log(`Registros a procesar: ${pending.length}\n`);
  let updated = 0, errors = 0;

  for (const item of pending) {
    const fileId = extractFileId(item.layoutUrl);
    if (!fileId) { errors++; continue; }
    try {
      const { filename, vehiculos } = await getFileData(fileId);
      const updates: any = {};
      if (!item.hasCfm) {
        const cfmRef = extractCfmRef(filename);
        if (cfmRef) { updates.cfmRef = cfmRef; updates.layoutFileName = filename; }
      }
      if (!item.hasVeh && vehiculos) updates.vehiculos = vehiculos;

      if (Object.keys(updates).length > 0) {
        await updateDoc(doc(db, 'asignacion_cajas', item.docId), updates);
        console.log(`  ✅ ${item.op} → ${JSON.stringify(updates)}`);
        updated++;
      }
    } catch (e: any) {
      console.log(`  ❌ ${item.op}: ${e.message}`);
      errors++;
    }
  }

  console.log(`\n=== RESULTADO ===`);
  console.log(`Actualizados: ${updated} | Errores: ${errors}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
