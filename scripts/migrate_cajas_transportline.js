/**
 * Migration: Fix cajas.TransportLine
 * 
 * Problem:  caja.TransportLine stores "ARCBEST" (razonSocial/name of carrier)
 *           but the filter expects the Nombre Comercial from transport_lines.TransportLine (e.g. "MXTL")
 * 
 * Strategy: For each caja, match via (carrierCodigo + nombreSubLinea) to find the
 *           corresponding transport_lines document, then update caja.TransportLine to
 *           that document's TransportLine (Nombre Comercial) field.
 */

const admin = require('firebase-admin');
const serviceAccount = require('../logimaster-cfmoto-a59f54d6641a.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'logimaster-cfmoto',
});

const db = admin.firestore();

async function migrate() {
  console.log('🚀 Starting cajas.TransportLine migration...\n');

  // 1. Load all transport_lines
  const tlSnap = await db.collection('transport_lines').get();
  const transportLines = tlSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`📦 Loaded ${transportLines.length} transport lines`);

  // 2. Build lookup: carrierCodigo+nombreSubLinea -> TransportLine (Nombre Comercial)
  const tlMap = {};
  for (const tl of transportLines) {
    if (tl.carrierCodigo && tl.nombreSubLinea) {
      const key = `${tl.carrierCodigo}::${tl.nombreSubLinea}`;
      tlMap[key] = tl.TransportLine; // Nombre Comercial
    }
  }
  console.log(`🗺  Built lookup with ${Object.keys(tlMap).length} keys\n`);

  // 3. Load all cajas
  const cajasSnap = await db.collection('cajas').get();
  console.log(`📋 Loaded ${cajasSnap.docs.length} cajas\n`);

  let updated = 0, skipped = 0, noMatch = 0;
  const noMatchList = [];
  const batch = db.batch();
  let batchCount = 0;

  for (const doc of cajasSnap.docs) {
    const data = doc.data();
    const { carrierCodigo, nombreSubLinea, TransportLine: currentTL } = data;

    if (!carrierCodigo || !nombreSubLinea) {
      console.log(`  ⚠️  ${doc.id}: missing carrierCodigo or nombreSubLinea — skip`);
      skipped++;
      continue;
    }

    const key = `${carrierCodigo}::${nombreSubLinea}`;
    const correctTL = tlMap[key];

    if (!correctTL) {
      console.log(`  ❌  ${doc.id}: no transport_line found for [${key}]`);
      noMatch++;
      noMatchList.push({ id: doc.id, carrierCodigo, nombreSubLinea, currentTL });
      continue;
    }

    if (currentTL === correctTL) {
      skipped++;
      continue; // already correct
    }

    console.log(`  ✅  ${doc.id}: "${currentTL}" → "${correctTL}"`);
    batch.update(doc.ref, { TransportLine: correctTL, updatedAt: new Date().toISOString() });
    updated++;
    batchCount++;

    // Firestore batch limit is 500
    if (batchCount === 499) {
      await batch.commit();
      console.log('  💾 Intermediate batch committed (499 ops)');
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
    console.log(`\n💾 Final batch committed`);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ Updated : ${updated}`);
  console.log(`⏭  Skipped  : ${skipped} (already correct or missing fields)`);
  console.log(`❌ No match : ${noMatch}`);

  if (noMatchList.length > 0) {
    console.log('\n⚠️  Records with no matching transport_line:');
    noMatchList.forEach(r =>
      console.log(`   - Caja ${r.id} | carrier: ${r.carrierCodigo} | subLinea: "${r.nombreSubLinea}" | currentTL: "${r.currentTL}"`)
    );
  }

  console.log('\n🏁 Migration complete.');
}

migrate().catch(err => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
