import XLSX from 'xlsx';
import fs from 'fs';

const files = fs.readdirSync('/Users/alex/Downloads/logimaster (2)/');
for(const f of files) {
   if(f.includes('shipping') && f.includes('2026') && f.endsWith('.xlsx')) {
     const wb = XLSX.readFile('/Users/alex/Downloads/logimaster (2)/' + f);
     for(const s of wb.SheetNames) {
        // ADDING HIDDEN: TRUE
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[s], { header: 1, hidden: true });
        let found = 0;
        rows.forEach((r, idx) => {
           // searching specifically for the user's string
           if(r.join(',').includes('17496') || r.join(',').includes('17776')) {
              console.log('--- FUZZY MATCH ON ROW', idx, '---');
              console.log(r);
              found++;
           }
        });
        if (found > 0) console.log('Found', found, 'fuzzy matches in', f);
     }
   }
}
