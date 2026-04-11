#!/usr/bin/env node
/**
 * Import Modelos_Export_2026-03-27-1.csv → Firestore collection 'models'
 * Uses authorized_user credentials from Firebase CLI to get an access token.
 */
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const https = require('https');

const PROJECT_ID = 'logimaster-cfmoto';
const COLLECTION = 'models';
const CSV_PATH   = path.join(__dirname, '..', 'Modelos_Export_2026-03-27-1.csv');
const CRED_FILE  = path.join(os.homedir(), '.config', 'firebase',
                             'cfm_mx.compliance_gmail.com_application_default_credentials.json');

// ── HTTP helpers ────────────────────────────────────────────────────────────
function httpsPost(hostname, pathname, body) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(body);
    const req = https.request({
      hostname, method: 'POST', path: pathname,
      headers: { 'Content-Type':'application/x-www-form-urlencoded','Content-Length':data.length }
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => resolve({ status: res.statusCode, body: raw }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function httpsPatch(hostname, pathname, token, body) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(body);
    const req = https.request({
      hostname, method: 'PATCH', path: pathname,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => resolve({ status: res.statusCode, body: raw }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ── CSV parser ──────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
  const rawHeaders = lines[0].split(',').map(h => h.trim().replace(/^\uFEFF/, ''));
  // Normalize "Peso unit Net / Gross Acero" → pesoAcero
  const headers = rawHeaders.map(h =>
    h.toLowerCase().includes('peso unit') ? 'pesoAcero' : h
  );
  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const rec = {};
    headers.forEach((h, idx) => { rec[h] = (cols[idx] || '').trim(); });
    if (rec['expo']) records.push(rec);
  }
  return records;
}

const NUMERIC = [
  'pesoNetoUnitarioKg','pesoBrutoUnitarioKg',
  'pesoBrutoUnitarioLb','pesoNetoUnitarioLb',
  'volumenUnitario','valorUsdUnitario',
  'ValAcero','pesoAcero','cantidadAduana','puAduana'
];

function toFirestoreFields(rec) {
  const fields = {};
  for (const [key, val] of Object.entries(rec)) {
    if (val === '' || val === undefined) continue;
    if (key === 'materialPeligroso') {
      const l = String(val).toLowerCase();
      fields[key] = { booleanValue: l==='true'||l==='1'||l==='si'||l==='yes' };
    } else if (NUMERIC.includes(key)) {
      fields[key] = { doubleValue: Number(val) || 0 };
    } else {
      fields[key] = { stringValue: String(val) };
    }
  }
  return fields;
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  // 1. Load credentials
  if (!fs.existsSync(CRED_FILE)) {
    console.error('❌ Credential file not found:', CRED_FILE);
    process.exit(1);
  }
  const cred = JSON.parse(fs.readFileSync(CRED_FILE, 'utf8'));

  // 2. Refresh access token
  console.log('🔑 Refreshing access token...');
  const tokenRes = await httpsPost(
    'oauth2.googleapis.com',
    '/token',
    `client_id=${encodeURIComponent(cred.client_id)}&client_secret=${encodeURIComponent(cred.client_secret)}&refresh_token=${encodeURIComponent(cred.refresh_token)}&grant_type=refresh_token`
  );
  const tokenData = JSON.parse(tokenRes.body);
  if (!tokenData.access_token) {
    console.error('❌ Failed to get token:', tokenData);
    process.exit(1);
  }
  const token = tokenData.access_token;
  console.log('✅ Token obtained.');

  // 3. Parse CSV
  const text = fs.readFileSync(CSV_PATH, 'utf8');
  const records = parseCSV(text);
  console.log(`📄 ${records.length} records to import into '${COLLECTION}' collection.\n`);

  // 4. Upsert each record
  let ok = 0, fail = 0;
  for (const rec of records) {
    const docId = rec['expo'];
    const pathname = `/v1/projects/${PROJECT_ID}/databases/(default)/documents/${COLLECTION}/${docId}`;
    const body = JSON.stringify({ fields: toFirestoreFields(rec) });
    const res = await httpsPatch('firestore.googleapis.com', pathname, token, body);
    if (res.status === 200) {
      process.stdout.write(`  ✅ ${docId}\n`);
      ok++;
    } else {
      const errSnippet = res.body.slice(0, 100);
      process.stdout.write(`  ❌ ${docId} [HTTP ${res.status}] ${errSnippet}\n`);
      fail++;
    }
  }

  console.log(`\n🎯 Importación finalizada. ${ok} registros OK, ${fail} fallidos.`);
}

main().catch(e => { console.error(e); process.exit(1); });
