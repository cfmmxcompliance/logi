// backfill_tl064.mjs — Replica la lógica de autoFillLayout para TL064
import admin from 'firebase-admin';
import { createRequire } from 'module';
import { readFileSync } from 'fs';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const sa = JSON.parse(readFileSync('./service-account.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: 'logimaster-cfmoto' });
const db = admin.firestore();

const GAS_READ = 'https://script.google.com/macros/s/AKfycbzX3ctF0kOxbw2M4uHbkPp8gsIy-EMQX64M5IEzMHTQs0gUxR-7BOx9BMe2RVEFKeWh/exec';

async function backfillRecord(snap) {
  const data = snap.data();
  const docId = snap.id;

  console.log(`\n📋 Doc: ${docId}`);
  console.log(`   numeroOperacion: ${data.numeroOperacion}`);
  console.log(`   fecha: ${data.fecha}`);
  console.log(`   cfmRef: ${data.cfmRef || 'VACÍO'}`);
  console.log(`   vehiculos: ${data.vehiculos || 'VACÍO'}`);
  console.log(`   layoutUrl: ${data.layoutUrl ? data.layoutUrl.substring(0, 80) : 'NONE'}`);

  if (!data.layoutUrl) { console.log('   ⚠️  Sin layoutUrl, saltando.'); return; }
  if (data.cfmRef && data.vehiculos) { console.log('   ✅ Ya completo, no requiere backfill.'); return; }

  // Extraer fileId
  const url = data.layoutUrl || '';
  let fileId = data.layoutFileId || '';
  if (!fileId) {
    const parts = url.split('/d/');
    if (parts.length > 1) fileId = parts[1].split(/[/?#]/)[0];
    else { const m = url.match(/[?&]id=([\w-]+)/); fileId = m ? m[1] : ''; }
  }
  if (!fileId) { console.log('   ❌ Sin fileId.'); return; }
  console.log(`   fileId: ${fileId}`);

  // Llamar GAS
  let json;
  try {
    const resp = await fetch(`${GAS_READ}?action=readFile&fileId=${fileId}`);
    json = await resp.json();
    console.log(`   📄 GAS nombre: ${json.name}`);
  } catch (e) { console.error('   ❌ GAS error:', e.message); return; }

  const updates = {};

  // cfmRef desde nombre del archivo
  if (!data.cfmRef && json.name) {
    const raw = json.name.replace(/\.[^/.]+$/, '');
    const pi = raw.toUpperCase().indexOf('LAY OUT CCP_');
    if (pi !== -1) updates.cfmRef = raw.substring(pi + 12).trim();
    else {
      // fallback: tomar todo después del último "_"
      const parts2 = raw.split('_');
      if (parts2.length > 1) updates.cfmRef = parts2[parts2.length - 1].trim();
    }
  }

  // vehiculos desde celda D27
  if (!data.vehiculos && json.content) {
    try {
      const wb = XLSX.read(json.content, { type: 'base64' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const v = sheet['D27']?.v;
      if (v !== undefined) updates.vehiculos = String(v).trim();
    } catch (e) { console.warn('   ⚠️  XLSX error:', e.message); }
  }

  if (!data.layoutFileId && fileId) updates.layoutFileId = fileId;

  if (Object.keys(updates).length > 0) {
    await snap.ref.update(updates);
    console.log(`   ✅ Actualizado:`, JSON.stringify(updates));
  } else {
    console.log('   ℹ️  Sin cambios que aplicar.');
  }
}

async function main() {
  console.log('🔍 Buscando TL064 con fecha 2026-07-06...\n');

  const snap = await db.collection('asignacion_cajas')
    .where('numeroOperacion', '==', 'TL064')
    .where('fecha', '==', '2026-07-06')
    .get();

  if (snap.empty) {
    console.log('❌ No se encontró TL064 para 2026-07-06');
    // Buscar sin filtro de fecha por si acaso
    console.log('   Buscando sin filtro de fecha...');
    const snap2 = await db.collection('asignacion_cajas')
      .where('numeroOperacion', '==', 'TL064')
      .get();
    console.log(`   Encontrados (sin fecha): ${snap2.size}`);
    snap2.forEach(d => console.log(`   - ${d.id} | fecha: ${d.data().fecha}`));
    process.exit(0);
  }

  for (const doc of snap.docs) {
    await backfillRecord(doc);
  }

  console.log('\n✅ Backfill completo.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
