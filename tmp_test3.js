import XLSX from 'xlsx';
import fs from 'fs';

const files = fs.readdirSync('/Users/alex/Downloads/logimaster (2)/');
for(const f of files) {
   if(f.includes('shipping') && f.includes('2026') && f.endsWith('.xlsx')) {
     console.log('Examining:', f);
     const wb = XLSX.readFile('/Users/alex/Downloads/logimaster (2)/' + f);
     for(const s of wb.SheetNames) {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[s], { header: 1 });
        let found = 0;
        rows.forEach((r, idx) => {
           if(r.join(',').includes('174960C-4') || r.join(',').includes('177765')) {
              console.log('--- FOUND ON ROW', idx, 'IN SHEET', s, '---');
              console.log(r);
              found++;
           }
        });
        if(found === 0) console.log('Did not find in sheet', s);
     }
   }
}
