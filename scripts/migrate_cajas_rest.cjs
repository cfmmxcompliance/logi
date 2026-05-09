#!/usr/bin/env node
/**
 * Migration via Firestore REST API (uses gcloud auth token)
 * Fixes cajas.TransportLine to store Nombre Comercial from transport_lines
 */

const { execSync } = require('child_process');
const https = require('https');

const PROJECT = 'logimaster-cfmoto';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

// Get fresh access token
const token = execSync('gcloud auth print-access-token').toString().trim();

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const r = https.request(options, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); } catch { resolve(raw); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function listDocs(collection, pageToken) {
  let path = `/${collection}?pageSize=300`;
  if (pageToken) path += `&pageToken=${encodeURIComponent(pageToken)}`;
  return req('GET', path);
}

function getStr(doc, field) {
  return doc.fields?.[field]?.stringValue || '';
}

async function main() {
  console.log('🚀 Starting migration via REST API...\n');

  // 1. Load all transport_lines
  const tlDocs = [];
  let pageToken = null;
  do {
    const res = await listDocs('transport_lines', pageToken);
    if (res.documents) tlDocs.push(...res.documents);
    pageToken = res.nextPageToken || null;
  } while (pageToken);
  console.log(`📦 Loaded ${tlDocs.length} transport lines`);

  // Build lookup: carrierCodigo::nombreSubLinea -> TransportLine (Nombre Comercial)
  const tlMap = {};
  for (const doc of tlDocs) {
    const carrier = getStr(doc, 'carrierCodigo').trim();
    const sub    = getStr(doc, 'nombreSubLinea').trim();
    const nc     = getStr(doc, 'TransportLine').trim();
    if (carrier && sub && nc) {
      tlMap[`${carrier}::${sub}`] = nc;
    }
  }
  console.log(`🗺  Lookup built: ${Object.keys(tlMap).length} entries\n`);

  // 2. Load all cajas
  const cajaDocs = [];
  pageToken = null;
  do {
    const res = await listDocs('cajas', pageToken);
    if (res.documents) cajaDocs.push(...res.documents);
    pageToken = res.nextPageToken || null;
  } while (pageToken);
  console.log(`📋 Loaded ${cajaDocs.length} cajas\n`);

  let updated = 0, skipped = 0, noMatch = 0;
  const noMatchList = [];

  for (const doc of cajaDocs) {
    const carrier  = getStr(doc, 'carrierCodigo').trim();
    const sub      = getStr(doc, 'nombreSubLinea').trim();
    const currentTL = getStr(doc, 'TransportLine').trim();
    const docName  = doc.name; // full resource name
    const docId    = docName.split('/').pop();

    if (!carrier || !sub) {
      console.log(`  ⚠️  ${docId}: missing carrierCodigo or nombreSubLinea — skip`);
      skipped++;
      continue;
    }

    const key = `${carrier}::${sub}`;
    const correctTL = tlMap[key];

    if (!correctTL) {
      noMatch++;
      noMatchList.push({ docId, carrier, sub, currentTL });
      continue;
    }

    if (currentTL === correctTL) {
      skipped++;
      continue;
    }

    // PATCH only TransportLine field
    const patchUrl = `/${docId.includes('/') ? docId : 'cajas/' + docId}`;
    const patchBody = {
      fields: {
        TransportLine: { stringValue: correctTL },
        updatedAt:     { stringValue: new Date().toISOString() },
      }
    };
    const patchPath = `/cajas/${docId}?updateMask.fieldPaths=TransportLine&updateMask.fieldPaths=updatedAt`;
    const result = await req('PATCH', patchPath, patchBody);

    if (result.error) {
      console.log(`  ❌  ${docId}: PATCH error — ${result.error.message}`);
    } else {
      console.log(`  ✅  ${docId}: "${currentTL}" → "${correctTL}"`);
      updated++;
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ Updated  : ${updated}`);
  console.log(`⏭  Skipped  : ${skipped} (already correct or missing fields)`);
  console.log(`❌ No match : ${noMatch}`);

  if (noMatchList.length > 0) {
    console.log('\n⚠️  No matching transport_line found for:');
    noMatchList.forEach(r =>
      console.log(`   ${r.docId} | carrier: ${r.carrier} | subLinea: "${r.sub}" | currentTL: "${r.currentTL}"`)
    );
  }
  console.log('\n🏁 Done.');
}

main().catch(e => { console.error('💥', e); process.exit(1); });
