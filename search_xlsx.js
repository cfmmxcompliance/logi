import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';

const dir = '/Users/alex/Downloads/logimaster (2)';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.xlsx'));

for (const f of files) {
  try {
    const p = path.join(dir, f);
    const wb = XLSX.readFile(p);
    for (const s of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[s], { header: 1 });
      rows.forEach((r, idx) => {
        const text = r.join(',');
        if (text.includes('174960C') || text.includes('177765')) {
           console.log(`FOUND in file: ${f} | Sheet: ${s} | Row: ${idx}`);
           console.log(`DATA:`, r);
        }
      });
    }
  } catch(e) { /* ignore */ }
}
