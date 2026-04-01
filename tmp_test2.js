import XLSX from 'xlsx';

const workbook = XLSX.readFile('/Users/alex/Downloads/logimaster (2)/CFM to CFP shipping schedule 2026-2-28 updated.xlsx');
let foundContract = false;

for (const sheetName of workbook.SheetNames) {
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  
  if (rows.length < 2) continue;

  let headerIdx = rows.findIndex(r => Array.isArray(r) && r.some(c => {
      const val = String(c).toUpperCase().replace(/[\s\.\-\_]/g, '');
      return val === 'INVOICENO' || val === 'INVOICE' || val === 'MODELO' || val === 'MODEL' || val === 'CFPORDER';
  }));
  
  if (headerIdx === -1) headerIdx = 0;
  const headers = rows[headerIdx].map(h => h?.toString().trim() || '');

  for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;
      
      const model = {};
      headers.forEach((h, idx) => { 
        if (!h) return;
        const key = String(h).toLowerCase().replace(/[\s\.\-\_]/g, '');
        model[key] = row[idx]?.toString().trim() || ''; 
      });

      const cfpContractRaw = model.cfpcontractno || model.cfpcontract || '';
      const invoiceKeyRaw = model.invoiceno || model.invoice || '';
      
      if (cfpContractRaw.includes('CFM-25MX-CFM174960C-4') || invoiceKeyRaw.includes('177765')) {
          console.log(`\n!!! FOUND in sheet ${sheetName} at row index ${i} !!!`);
          console.log('- RAW ROW:', row);
          console.log('- PARSED INVOICE KEY:', invoiceKeyRaw);
          console.log('- EXPECTED INVOICE KEY CONDITION:', invoiceKeyRaw ? 'WILL SAVE' : 'WILL DROP DUE TO MISSING INVOICE');
          console.log('- PARSED MODEL DATA:', model);
          foundContract = true;
      }
  }
}

if(!foundContract) {
   console.log("NOT FOUND AT ALL IN XLSX. Parsing RAW rows globally...");
   for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      rows.forEach((r, idx) => {
         const str = r.join(',');
         if(str.includes('174960C') || str.includes('177765')) {
             console.log(`Found raw string in sheet ${sheetName} row ${idx}:`, r);
         }
      });
   }
}
