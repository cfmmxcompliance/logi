import fs from 'fs';

const parseCSV = (text: string): string[][] => {
  let cleanText = text.replace(/^\uFEFF/, '').trim();
  cleanText = cleanText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++; 
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentField);
      currentField = '';
    } else if (char === '\n' && !inQuotes) {
      currentRow.push(currentField);
      if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0] !== '')) {
          rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }
  return rows;
};

const text = fs.readFileSync('墨西哥2026年度3月出口价格审批+签核版+-2026+carV3-3月用v1 (1).csv', 'utf-8');
const rows = parseCSV(text);

let headerIdx = rows.findIndex(r => r.includes('车型') || r.includes('Model') || r.includes('合同号Contract No.'));
if(headerIdx === -1) headerIdx = 0;
const headers = rows[headerIdx].map(h => h.trim());
console.log("Detected Headers at row", headerIdx, ":", headers);

const records = [];
for (let i = headerIdx + 1; i < rows.length; i++) {
  if (rows[i].length < 2) continue;
  const model: any = {};
  headers.forEach((h, idx) => { model[h] = rows[i][idx]?.trim() || ''; });
  
  if(!model.modelo && (model['车型'] || model['Model'])) model.modelo = model['车型'] || model['Model'];
  if(!model.contratos && model['合同号Contract No.']) model.contratos = model['合同号Contract No.'];
  if(!model.colores && model['颜色']) model.colores = model['颜色'];
  
  const cleanNum = (str: string) => { 
      const n = Number(String(str).replace(/[^0-9.-]+/g, '')); 
      return isNaN(n) ? 0 : n; 
  };
  
  if(model['墨西哥进口价格(CKD)']) model.importPriceCkd = cleanNum(model['墨西哥进口价格(CKD)']);
  if(model['附加值 add value']) model.addValue = cleanNum(model['附加值 add value']);
  if(model['墨西哥F0B价格(México)']) model.fobPriceMx = cleanNum(model['墨西哥F0B价格(México)']);
  if(model['美国海关整车进口价（USA)']) model.usaImportPrice = cleanNum(model['美国海关整车进口价（USA)']);

  if (model.modelo) {
      records.push(model);
  }
}
console.log(`Found ${records.length} valid records`);
console.log("Sample of first record:", records[0]);
