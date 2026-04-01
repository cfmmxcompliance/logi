import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

const fileStr = 'CFM\xA0to\xA0CFP\xA0shipping\xA0schedule\xA02026-3-20 updated.xlsx';
const filePath = path.join('/Users/alex/Downloads', fileStr);

try {
  const wb = XLSX.readFile(filePath);
  console.log("Reading file:", filePath);
  let globalFound = 0;
  for (const s of wb.SheetNames) {
     const rows = XLSX.utils.sheet_to_json(wb.Sheets[s], { header: 1, hidden: true, raw: false });
     console.log(`Sheet: ${s} - Parsed Rows: ${rows.length}`);
     
     rows.forEach((r, idx) => {
        const text = String(r.join(','));
        // Find specifically either variations of the contract or the invoice
        if (text.includes('17496') || text.includes('17776')) {
            console.log(`==> MATCH FOUND on sheet ${s} row ${idx}:`, r);
            globalFound++;
        }
     });
  }
  if (globalFound === 0) console.log("Absolutely 0 matches found for any variant of 17496 or 17776 in this entire workbook, even reading hidden nodes.");
} catch (e) {
  console.log("Error reading specific file:", e.message);
}
