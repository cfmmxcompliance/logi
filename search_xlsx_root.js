import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';

function findXLSX(dir, depth, maxDepth) {
   let files = [];
   if(depth > maxDepth) return files;
   try {
     const items = fs.readdirSync(dir, { withFileTypes: true });
     for(const item of items) {
       if(item.name.startsWith('.')) continue;
       const fullPath = path.join(dir, item.name);
       if(item.isDirectory()) {
          files = files.concat(findXLSX(fullPath, depth+1, maxDepth));
       } else if(item.name.endsWith('.xlsx')) {
          files.push(fullPath);
       }
     }
   } catch(e) {}
   return files;
}

const allFiles = findXLSX('/Users/alex/Downloads', 0, 1);
console.log(`Scanning ${allFiles.length} XLSX files in Downloads...`);
for (const f of allFiles) {
  try {
    const wb = XLSX.readFile(f);
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
  } catch(e) { }
}
