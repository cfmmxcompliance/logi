import fs from 'fs';

const data = fs.readFileSync('./extracted_zip/1901508_501.asc', 'utf-8');
const lines = data.split('\n').map(l => l.trim()).filter(l => l);

const header = lines[0].split('|');
const pIdx = header.indexOf('Patente');
const pedIdx = header.indexOf('Pedimento');
const secIdx = header.indexOf('SeccionAduanera');
const tipoOpIdx = header.indexOf('TipoOperacion');
const dateIdx = header.indexOf('FechaPagoReal');

const counts = {};
let total = 0;

for (let i = 1; i < lines.length; i++) {
  const cols = lines[i].split('|');
  if (cols.length < dateIdx) continue;
  
  const patente = cols[pIdx];
  const pedimento = cols[pedIdx];
  const seccion = cols[secIdx];
  const tipoOp = cols[tipoOpIdx] === '1' ? '1 (IMPO)' : (cols[tipoOpIdx] === '2' ? '2 (EXPO)' : cols[tipoOpIdx]);
  const fecha = cols[dateIdx] || '';
  
  const year = fecha.substring(0, 4) || 'Sin Fecha';
  const key = `${patente}|${seccion}|${tipoOp}|${year}`;
  if (!counts[key]) counts[key] = new Set();
  counts[key].add(pedimento);
  total++;
}

console.log('| PATENTE | SECCIÓN ADUANERA | TIPO OPERACIÓN | AÑO | TOTAL PEDIMENTOS |');
console.log('|---|---|---|---|---|');
let totalUnicos = 0;
Object.keys(counts).sort().forEach(key => {
  const [patente, seccion, tipoOp, year] = key.split('|');
  const uniqueCount = counts[key].size;
  totalUnicos += uniqueCount;
  console.log(`| ${patente} | ${seccion} | ${tipoOp} | ${year} | ${uniqueCount} |`);
});
console.log(`| **TOTAL** | | | | **${totalUnicos}** |`);
