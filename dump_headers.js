import XLSX from 'xlsx';
import path from 'path';

const filePath = path.join('/Users/alex/Downloads', 'CFM\xA0to\xA0CFP\xA0shipping\xA0schedule\xA02026-3-20 updated.xlsx');
try {
  const wb = XLSX.readFile(filePath);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, hidden: true, raw: false });
  
  let headerIdx = rows.findIndex(r => Array.isArray(r) && r.some(c => {
      const val = String(c).toUpperCase().replace(/[\s\.\-\_]/g, '');
      return val === 'INVOICENO' || val === 'INVOICE' || val === 'MODELO' || val === 'MODEL' || val === 'CFPORDER';
  }));
  
  console.log("Header Idx:", headerIdx);
  
  const headersRaw = rows[headerIdx];
  console.log("Headers at that idx:", headersRaw);
} catch(e) { console.log(e.message); }
