import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

const fileStr = 'CFM\xA0to\xA0CFP\xA0shipping\xA0schedule\xA02026-3-20 updated.xlsx';
const filePath = path.join('/Users/alex/Downloads', fileStr);

try {
  const wb = XLSX.readFile(filePath);
  const s = wb.SheetNames[0]; // assuming 'MY2026 CFM to CFP'
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[s], { header: 1, hidden: true, raw: false });
  console.log("DUMPING ROWS 4525 - 4535");
  for(let i=4525; i<=4535; i++) {
     if(rows[i]) {
        console.log(`ROW ${i+1}:`);
        console.log(rows[i]);
     }
  }
} catch(e) {
  console.log("Error:", e.message);
}
