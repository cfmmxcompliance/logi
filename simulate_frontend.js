import XLSX from 'xlsx';
import path from 'path';

const fileStr = 'CFM\xA0to\xA0CFP\xA0shipping\xA0schedule\xA02026-3-20 updated.xlsx';
const filePath = path.join('/Users/alex/Downloads', fileStr);

try {
  const wb = XLSX.readFile(filePath);
  const records = [];
  
  for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false, hidden: true });
      
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

          const invoiceKey = model.invoiceno || model.invoice || '';
          if (invoiceKey) {
              const sanitizedModel = {
                  invoiceNo: invoiceKey,
                  cfpContractNo: model.cfpcontractno || model.cfpcontract || '',
                  _originalRowIndex: i
              };
              records.push(sanitizedModel);
          }
      }
  }
  
  console.log("Total records parsed:", records.length);
  const found = records.filter(r => r.invoiceNo.includes('177765') || r.cfpContractNo.includes('174960C'));
  console.log("Found matches in records array:", found.length);
  if(found.length > 0) {
     console.log("Example:", found[0]);
  }
} catch (e) {
  console.log("Error:", e.message);
}
