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
              records.push({
                  invoiceNo: String(invoiceKey),
                  cfpContractNo: model.cfpcontractno || model.cfpcontract || '',
                  _row: i
              });
          }
      }
  }

  // Simulate unique key generation 
  const norm = (str) => String(str || '').trim().toLowerCase();
  const getMatchKey = (s) => norm(s.invoiceNo);
  
  const map = new Map();
  records.forEach(r => {
      const key = getMatchKey(r);
      map.set(key, r);
  });
  
  console.log(`Total Extracted Rows: ${records.length}`);
  console.log(`Total Unique Invoices (to be uploaded): ${map.size}`);
  
  const testKey4 = "CFM-25CFTT177765-4".toLowerCase();
  if (map.has(testKey4)) {
      console.log("==> Test invoice -4 in final chunk map:", map.get(testKey4));
  } else {
      console.log("==> Test invoice -4 MISSING from final chunk map!");
  }

} catch(e) { console.error(e.message); }
