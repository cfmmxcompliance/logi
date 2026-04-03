const XLSX = require('xlsx');
const wb = XLSX.readFile('Productos.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const json = XLSX.utils.sheet_to_json(ws, { defval: null });
console.log("Headers:", Object.keys(json[0]));
console.log("First row:", json[0]);
