import XLSX from 'xlsx';

const wb = XLSX.readFile('bom prueba 2.xlsx');
const sheet = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet);

const rows = data.map(r => ({ estilo: String(r.ESTILO || '').trim(), insumo: String(r.INSUMO || '').trim(), qty: Number(r.CANTIDAD || r.QTY || 0) }));

const estilos = [...new Set(rows.map(r => r.estilo).filter(Boolean))];
console.log('--- ESTILOS ---');
console.log('Total:', estilos.length);
console.log('¿Cuales?:', estilos.join(' | '));

console.log('\n--- INSUMOS ---');
const insumos = new Set(rows.map(r => r.insumo).filter(Boolean));
console.log('Total insumos únicos:', insumos.size);

console.log('\n--- INSUMOS POR ESTILO ---');
estilos.forEach(e => {
  const rs = rows.filter(r => r.estilo === e);
  const unq = new Set(rs.map(r => r.insumo));
  console.log(`- Estilo ${e}: ${rs.length} filas brutas -> ${unq.size} insumos únicos.`);
});

console.log('\n--- REPETIDOS (DUPLICADOS DENTRO DEL MISMO ARCHIVO) ---');
let comboCount = {};
rows.forEach(r => {
  if (!r.estilo || !r.insumo) return;
  const k = r.estilo + '||' + r.insumo;
  if(!comboCount[k]) comboCount[k] = [];
  comboCount[k].push(r.qty);
});

let repMismo = 0;
let repDiff = 0;

for (const k in comboCount) {
  const qs = comboCount[k];
  if(qs.length > 1) {
    const unqQtys = [...new Set(qs)];
    if(unqQtys.length === 1) {
       repMismo++;
    } else {
       repDiff++;
       console.log('  ⚠️ Conflicto:', k, '-> Cantidades:', unqQtys.join(', '));
    }
  }
}
console.log(`- Combinaciones que se repiten con MISMA cantidad: ${repMismo}`);
console.log(`- Combinaciones que se repiten con DISTINTA cantidad (Conflictos Críticos): ${repDiff}`);

console.log('\n--- INSUMOS CRUZADOS (COMPARTIDOS ENTRE 2 O MAS ESTILOS) ---');
const insToEst = {};
rows.forEach(r => {
  if (!r.insumo || !r.estilo) return;
  if(!insToEst[r.insumo]) insToEst[r.insumo] = new Set();
  insToEst[r.insumo].add(r.estilo);
});
const cruzados = Object.entries(insToEst).filter(([i, e]) => e.size > 1);
console.log('Total insumos usados en múltiples estilos al mismo tiempo:', cruzados.length);

let cruzMismo = 0;
let cruzDiff = 0;
cruzados.forEach(([ins, ests]) => {
  const qtys = new Set(rows.filter(r => r.insumo === ins).map(r => r.qty));
  if(qtys.size === 1) cruzMismo++; else cruzDiff++;
});
console.log(`- ${cruzMismo} insumos mantienen la misma cantidad cruzando estilos.`);
console.log(`- ${cruzDiff} insumos tienen distintas cantidades dependiendo del estilo.`);
