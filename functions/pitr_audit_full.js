/**
 * pitr_audit_full.js
 * 
 * Auditoría completa: compara el estado PITR de ayer vs HOY
 * para las colecciones: asignacion_cajas + liberacionesCaja
 * en el rango de julio 2026.
 * 
 * Objetivo: encontrar por qué el conteo de CERRADAS bajó de 1241 a 1199.
 */

const admin = require('firebase-admin');
const path = require('path');

const SERVICE_ACCOUNT_PATH = path.join(__dirname, 'service-account.json');
const PROJECT_ID = 'logimaster-cfmoto';

// Timestamp PITR: Ayer 2026-09-01 a las 23:59 hora México (UTC-6) = 2026-09-02T05:59:00Z
const PITR_TIMESTAMP = new Date('2026-09-02T05:59:00Z');

const FECHA_START = '2026-07-01';
const FECHA_END   = '2026-07-31';

const serviceAccount = require(SERVICE_ACCOUNT_PATH);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: PROJECT_ID,
});
const db = admin.firestore();
const pitrTs = admin.firestore.Timestamp.fromDate(PITR_TIMESTAMP);

async function auditCollection(colName, dateField) {
  // ── PITR ──
  const pitrSnap = await db.collection(colName)
    .where(dateField, '>=', FECHA_START)
    .where(dateField, '<=', FECHA_END)
    .get({ readTime: pitrTs });

  const pitrDocs = {};
  pitrSnap.forEach(d => { pitrDocs[d.id] = d.data(); });

  // ── ACTUAL ──
  const nowSnap = await db.collection(colName)
    .where(dateField, '>=', FECHA_START)
    .where(dateField, '<=', FECHA_END)
    .get();

  const nowDocs = {};
  nowSnap.forEach(d => { nowDocs[d.id] = d.data(); });

  const pitrIds = new Set(Object.keys(pitrDocs));
  const nowIds  = new Set(Object.keys(nowDocs));

  const missing = [...pitrIds].filter(id => !nowIds.has(id));
  const added   = [...nowIds].filter(id => !pitrIds.has(id));

  return { pitrCount: pitrIds.size, nowCount: nowIds.size, missing, added, pitrDocs };
}

async function main() {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  AUDITORÍA PITR COMPLETA — Julio 2026`);
  console.log(`  PITR: ${PITR_TIMESTAMP.toISOString()}`);
  console.log(`${'='.repeat(70)}\n`);

  // ── 1. Asignaciones ───────────────────────────────────────────────────────
  console.log('📦 [1/3] Auditando asignacion_cajas...');
  const asig = await auditCollection('asignacion_cajas', 'fecha');
  console.log(`   PITR: ${asig.pitrCount} | Actual: ${asig.nowCount} | Faltantes: ${asig.missing.length} | Nuevos: ${asig.added.length}`);

  // ── 2. Liberaciones ───────────────────────────────────────────────────────
  console.log('\n📦 [2/3] Auditando liberacionesCaja...');
  const libs = await auditCollection('liberacionesCaja', 'fechaLiberacion');
  console.log(`   PITR: ${libs.pitrCount} | Actual: ${libs.nowCount} | Faltantes: ${libs.missing.length} | Nuevos: ${libs.added.length}`);

  if (libs.missing.length > 0) {
    console.log('\n   ❌ LIBERACIONES FALTANTES:');
    libs.missing.forEach((id, i) => {
      const d = libs.pitrDocs[id];
      console.log(`   ${i+1}. [${id}] asigId=${d.asignacionCajaId} caja=${d.numeroCaja || '?'} fecha=${d.fechaLiberacion} liberadoPor=${d.liberadoPor || '?'}`);
    });
  }

  // ── 3. Simulación del conteo CERRADAS (lógica del frontend) ──────────────
  console.log('\n📊 [3/3] Simulando conteo CERRADAS (lógica del frontend)...');
  
  const CANCELED_DOCKS = ['RECHAZADO', 'DROP', 'NO SHOW', 'CANCELED', 'CANCELADO'];
  
  // PITR
  const pitrAsigSnap = await db.collection('asignacion_cajas')
    .where('fecha', '>=', FECHA_START)
    .where('fecha', '<=', FECHA_END)
    .get({ readTime: pitrTs });

  const pitrLibSnap = await db.collection('liberacionesCaja')
    .where('fechaLiberacion', '>=', FECHA_START)
    .where('fechaLiberacion', '<=', FECHA_END)
    .get({ readTime: pitrTs });

  const pitrLibIds = new Set();
  pitrLibSnap.forEach(d => pitrLibIds.add(d.data().asignacionCajaId));

  let pitrCerradas = 0, pitrCanceladas = 0, pitrPendientes = 0;
  pitrAsigSnap.forEach(d => {
    const data = d.data();
    const dock = (data.dockArribo || '').trim().toUpperCase();
    if (CANCELED_DOCKS.includes(dock)) { pitrCanceladas++; }
    else if (pitrLibIds.has(d.id)) { pitrCerradas++; }
    else { pitrPendientes++; }
  });

  // ACTUAL
  const nowAsigSnap = await db.collection('asignacion_cajas')
    .where('fecha', '>=', FECHA_START)
    .where('fecha', '<=', FECHA_END)
    .get();

  const nowLibSnap = await db.collection('liberacionesCaja')
    .where('fechaLiberacion', '>=', FECHA_START)
    .where('fechaLiberacion', '<=', FECHA_END)
    .get();

  const nowLibIds = new Set();
  nowLibSnap.forEach(d => nowLibIds.add(d.data().asignacionCajaId));

  let nowCerradas = 0, nowCanceladas = 0, nowPendientes = 0;
  nowAsigSnap.forEach(d => {
    const data = d.data();
    const dock = (data.dockArribo || '').trim().toUpperCase();
    if (CANCELED_DOCKS.includes(dock)) { nowCanceladas++; }
    else if (nowLibIds.has(d.id)) { nowCerradas++; }
    else { nowPendientes++; }
  });

  console.log(`\n${'─'.repeat(70)}`);
  console.log(`  ${'Métrica'.padEnd(30)} ${'AYER (PITR)'.padStart(12)} ${'HOY (Actual)'.padStart(14)}`);
  console.log(`${'─'.repeat(70)}`);
  console.log(`  ${'Total Asignaciones Julio'.padEnd(30)} ${String(pitrAsigSnap.size).padStart(12)} ${String(nowAsigSnap.size).padStart(14)}`);
  console.log(`  ${'Total Liberaciones Julio'.padEnd(30)} ${String(libs.pitrCount).padStart(12)} ${String(libs.nowCount).padStart(14)}`);
  console.log(`  ${'CERRADAS (con liberacion)'.padEnd(30)} ${String(pitrCerradas).padStart(12)} ${String(nowCerradas).padStart(14)}`);
  console.log(`  ${'CANCELADAS/DROP/etc'.padEnd(30)} ${String(pitrCanceladas).padStart(12)} ${String(nowCanceladas).padStart(14)}`);
  console.log(`  ${'PENDIENTES/EN_PROCESO'.padEnd(30)} ${String(pitrPendientes).padStart(12)} ${String(nowPendientes).padStart(14)}`);
  console.log(`${'─'.repeat(70)}`);
  console.log(`  ΔCerradas: ${nowCerradas - pitrCerradas} | ΔCanceladas: ${nowCanceladas - pitrCanceladas}`);
  console.log(`${'='.repeat(70)}\n`);
}

main().catch(err => {
  console.error('\n❌ Error fatal:', err);
  process.exit(1);
});
