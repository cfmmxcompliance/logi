const XLSX = require('xlsx');

const wb = XLSX.readFile('bom prueba 2.xlsx');
const sheet = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet);

// Normalizar filas
const rows = data.map(r => ({
  estilo: String(r['ESTILO'] ?? '').trim(),
  insumo: String(r['INSUMO'] ?? '').trim(),
  qty:    Number(r['CANTIDAD'] ?? r['QTY'] ?? 0),
})).filter(r => r.insumo);

// ── 1. Estilos únicos ──────────────────────────────────────────
const estilos = [...new Set(rows.map(r => r.estilo).filter(Boolean))];
console.log('═══════════════════════════════════════════');
console.log('  AUDITORÍA BOM PRUEBA 2.xlsx');
console.log('═══════════════════════════════════════════');
console.log(`\n📦 ESTILOS ÚNICOS: ${estilos.length}`);
estilos.forEach(e => {
  const filas = rows.filter(r => r.estilo === e);
  const uniq  = new Set(filas.map(r => r.insumo)).size;
  console.log(`   • ${e}  →  ${filas.length} filas  |  ${uniq} insumos únicos`);
});

// ── 2. Insumos únicos (global) ─────────────────────────────────
const insumos = new Set(rows.map(r => r.insumo));
console.log(`\n🔩 INSUMOS ÚNICOS (global): ${insumos.size}`);
console.log(`   Total filas en el archivo: ${rows.length}`);

// ── 3. Duplicados (mismo ESTILO+INSUMO) ───────────────────────
const comboMap = {};
rows.forEach(r => {
  const k = `${r.estilo}||${r.insumo}`;
  if (!comboMap[k]) comboMap[k] = [];
  comboMap[k].push(r.qty);
});

const dupCombos   = Object.entries(comboMap).filter(([, v]) => v.length > 1);
const dupSameQty  = dupCombos.filter(([, v]) => new Set(v).size === 1);
const dupDiffQty  = dupCombos.filter(([, v]) => new Set(v).size > 1);

console.log(`\n⚠️  INSUMOS DUPLICADOS (ESTILO+INSUMO repeated):`);
console.log(`   Total combinaciones duplicadas : ${dupCombos.length}`);
console.log(`   → Con misma CANTIDAD           : ${dupSameQty.length}  (deduplicables automáticamente)`);
console.log(`   → Con CANTIDAD diferente       : ${dupDiffQty.length}  (requieren resolución manual)`);

if (dupDiffQty.length > 0) {
  console.log('\n   Detalles de conflictos de cantidad:');
  dupDiffQty.forEach(([k, qtys]) => {
    const [estilo, insumo] = k.split('||');
    console.log(`     • [${estilo}] ${insumo}  →  cantidades: ${[...new Set(qtys)].join(' vs ')}`);
  });
}

// ── 4. CANTIDAD = 0 ────────────────────────────────────────────
const ceroRows = rows.filter(r => r.qty === 0);
console.log(`\n🟡 REGISTROS CON CANTIDAD = 0: ${ceroRows.length}`);
if (ceroRows.length > 0) {
  const ceroByEstilo = {};
  ceroRows.forEach(r => { ceroByEstilo[r.estilo] = (ceroByEstilo[r.estilo] || 0) + 1; });
  Object.entries(ceroByEstilo).forEach(([e, c]) => console.log(`   • ${e}: ${c} registros`));
}

console.log('\n═══════════════════════════════════════════\n');
