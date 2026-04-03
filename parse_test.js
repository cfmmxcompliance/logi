const XLSX = require('xlsx');

const wb = XLSX.readFile('Productos.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const json = XLSX.utils.sheet_to_json(ws, { defval: null });
console.log("Keys of first row:", Object.keys(json[0] || {}));
console.log("First row data:", json[0]);
console.log("Sample of first few items mapping:");
let ct = 0;
for(const row of json) {
  const vals = Object.values(row).map(v => String(v || '').trim());
  if(vals[0] === 'MODEL' || vals[0] === 'model') continue;
  const keys = Object.keys(row);
  const modelVal = String(row[keys[0]] || '').trim();
  const productVal = String(row[keys[1]] || '').trim();
  if (modelVal && productVal) {
    if(ct < 5) console.log(`[${modelVal}] -> [${productVal}]`);
    ct++;
  }
}
console.log("Total entries mapped:", ct);
