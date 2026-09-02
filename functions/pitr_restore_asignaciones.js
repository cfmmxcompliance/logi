/**
 * pitr_restore_asignaciones.js
 * 
 * Recuperación selectiva de documentos en `asignacion_cajas` usando PITR.
 * 
 * MODO DE OPERACIÓN:
 *  1. Lee la colección `asignacion_cajas` tal como estaba AYER a las 23:59 PM (hora México)
 *     usando el readTime del PITR de Firestore.
 *  2. Lee el estado ACTUAL de la colección.
 *  3. Encuentra los documentos presentes AYER pero AUSENTES hoy.
 *  4. Reinserta SOLO esos documentos en Firestore (sin tocar los existentes).
 * 
 * ZERO RISK: No modifica documentos existentes. Solo escribe los que faltan.
 */

const admin = require('firebase-admin');
const path = require('path');

// ──────────────────────────────────────────────────────────
// CONFIG
// ──────────────────────────────────────────────────────────
const SERVICE_ACCOUNT_PATH = path.join(__dirname, 'service-account.json');
const PROJECT_ID = 'logimaster-cfmoto';
const COLLECTION = 'asignacion_cajas';

// Timestamp PITR: Ayer 2026-09-01 a las 23:59:00 hora México (UTC-6) = 2026-09-02T05:59:00Z
const PITR_TIMESTAMP = new Date('2026-09-02T05:59:00Z');

// Filtro: solo documentos de julio 2026 (fecha del campo `fecha` en formato YYYY-MM-DD)
const FECHA_START = '2026-07-01';
const FECHA_END   = '2026-07-31';

// ──────────────────────────────────────────────────────────
// INIT
// ──────────────────────────────────────────────────────────
const serviceAccount = require(SERVICE_ACCOUNT_PATH);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: PROJECT_ID,
});
const db = admin.firestore();

// ──────────────────────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────────────────────
async function main() {
  const DRY_RUN = process.argv.includes('--dry-run');
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  PITR RESTORE — asignacion_cajas`);
  console.log(`  Modo: ${DRY_RUN ? '🟡 DRY-RUN (sin escrituras)' : '🟢 REAL (escribirá en Firestore)'}`);
  console.log(`  PITR Timestamp: ${PITR_TIMESTAMP.toISOString()}`);
  console.log(`  Rango de fechas auditadas: ${FECHA_START} → ${FECHA_END}`);
  console.log(`${'='.repeat(60)}\n`);

  // ── PASO 1: Leer estado de AYER (PITR) ──────────────────
  console.log('📡 PASO 1: Leyendo estado PITR (ayer 23:59 PM MX)...');
  const pitrTimestamp = admin.firestore.Timestamp.fromDate(PITR_TIMESTAMP);
  
  const pitrSnapshot = await db.collection(COLLECTION)
    .where('fecha', '>=', FECHA_START)
    .where('fecha', '<=', FECHA_END)
    .get({ readTime: pitrTimestamp });

  const pitrDocs = {};
  pitrSnapshot.forEach(doc => {
    pitrDocs[doc.id] = doc.data();
  });
  console.log(`   → Documentos encontrados en PITR (julio): ${Object.keys(pitrDocs).length}`);

  // ── PASO 2: Leer estado ACTUAL ──────────────────────────
  console.log('\n📡 PASO 2: Leyendo estado ACTUAL de Firestore...');
  const currentSnapshot = await db.collection(COLLECTION)
    .where('fecha', '>=', FECHA_START)
    .where('fecha', '<=', FECHA_END)
    .get();

  const currentIds = new Set();
  currentSnapshot.forEach(doc => {
    currentIds.add(doc.id);
  });
  console.log(`   → Documentos actuales (julio): ${currentIds.size}`);

  // ── PASO 3: Identificar faltantes ──────────────────────
  console.log('\n🔍 PASO 3: Calculando diferencia...');
  const missingIds = Object.keys(pitrDocs).filter(id => !currentIds.has(id));
  
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  Documentos en PITR (ayer):  ${Object.keys(pitrDocs).length}`);
  console.log(`  Documentos actuales (hoy):  ${currentIds.size}`);
  console.log(`  Documentos FALTANTES:       ${missingIds.length}`);
  console.log(`${'─'.repeat(60)}\n`);

  if (missingIds.length === 0) {
    console.log('✅ No hay documentos faltantes. La colección está completa.');
    process.exit(0);
  }

  console.log('📋 Documentos a restaurar:');
  missingIds.forEach((id, i) => {
    const doc = pitrDocs[id];
    console.log(`   ${i + 1}. [${id}] fecha=${doc.fecha} caja=${doc.numeroCaja || '?'} op=${doc.numeroOperacion || '?'} dock=${doc.dockArribo || '—'}`);
  });

  // ── PASO 4: Restaurar faltantes ─────────────────────────
  if (DRY_RUN) {
    console.log('\n🟡 DRY-RUN: No se escribió nada. Corre sin --dry-run para aplicar.');
    process.exit(0);
  }

  console.log('\n✍️  PASO 4: Restaurando documentos faltantes en Firestore...');
  
  // Usamos batches de 500 (límite de Firestore)
  const BATCH_SIZE = 400;
  let restored = 0;
  let errors = 0;

  for (let i = 0; i < missingIds.length; i += BATCH_SIZE) {
    const batchIds = missingIds.slice(i, i + BATCH_SIZE);
    const batch = db.batch();

    for (const id of batchIds) {
      const data = pitrDocs[id];
      const docRef = db.collection(COLLECTION).doc(id);
      // Preservar todos los campos originales + anotar la restauración
      batch.set(docRef, {
        ...data,
        _restoredAt: new Date().toISOString(),
        _restoredFrom: `PITR_${PITR_TIMESTAMP.toISOString()}`,
      });
    }

    try {
      await batch.commit();
      restored += batchIds.length;
      console.log(`   ✅ Batch ${Math.floor(i/BATCH_SIZE)+1}: ${batchIds.length} documentos restaurados`);
    } catch (err) {
      errors += batchIds.length;
      console.error(`   ❌ Batch ${Math.floor(i/BATCH_SIZE)+1} falló:`, err.message);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  RESTAURACIÓN COMPLETADA`);
  console.log(`  ✅ Restaurados: ${restored}`);
  console.log(`  ❌ Errores:     ${errors}`);
  console.log(`  📊 Total julio ahora: ${currentIds.size + restored}`);
  console.log(`${'='.repeat(60)}\n`);

  if (errors > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\n❌ Error fatal:', err);
  process.exit(1);
});
