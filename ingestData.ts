import fs from 'fs';
import { pricingService } from './services/pricingService';
import { shippingService } from './services/shippingService';

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

async function processPricing() {
  console.log("==> Starting Pricing CSV Ingestion");
  const text = fs.readFileSync('墨西哥2026年度3月出口价格审批+签核版+-2026+carV3-3月用v1 (1).csv', 'utf-8');
  const rows = parseCSV(text);

  let headerIdx = rows.findIndex(r => r.includes('车型') || r.includes('Model') || r.includes('合同号Contract No.'));
  if(headerIdx === -1) headerIdx = 0;
  const headers = rows[headerIdx].map(h => h.trim());

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
        records.push({
            modelo: model.modelo,
            contratos: model.contratos || '',
            colores: model.colores || '',
            importPriceCkd: model.importPriceCkd || 0,
            addValue: model.addValue || 0,
            fobPriceMx: model.fobPriceMx || 0,
            usaImportPrice: model.usaImportPrice || 0
        });
    }
  }

  let saved = 0;
  for(const r of records) {
      try {
          await pricingService.addPricing(r);
          saved++;
      } catch(e) {
          console.error("Failed to add pricing:", r.modelo, e);
      }
  }
  console.log(`Saved ${saved} Pricing Matrix Records successfully.`);
}

async function processShipping() {
  console.log("==> Starting Shipping CSV Ingestion");
  const files = fs.readdirSync('.');
  const csvFile = files.find(f => f.includes('shipping') && f.endsWith('.csv'));
  if(!csvFile) throw new Error("Shipping CSV not found");
  console.log("Using file:", csvFile);
  const text = fs.readFileSync(csvFile, 'utf-8');
  const rows = parseCSV(text);

  let headerIdx = rows.findIndex(r => r.includes('Invoice No.') || r.includes('Model') || r.includes('CFP ORDER'));
  if (headerIdx === -1) headerIdx = 0;

  const headers = rows[headerIdx].map(h => h.trim());
  const records = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length < 2) continue;
      const model: any = {};
      headers.forEach((h, idx) => { model[h] = row[idx]?.trim() || ''; });
      
      if(model['Invoice No.'] && !model.invoiceNo) model.invoiceNo = model['Invoice No.'];
      if(model['Model'] && !model.modelo) model.modelo = model['Model'];
      if(model['CFP Contract No.'] && !model.cfpContractNo) model.cfpContractNo = model['CFP Contract No.'];
      if(model['Color'] && !model.color) model.color = model['Color'];
      if(model['Truck'] && !model.truck) model.truck = model['Truck'];
      if(model['ETD'] && !model.etd) model.etd = model['ETD'];
      if(model['ETA to door'] && !model.etaToDoor) model.etaToDoor = model['ETA to door'];

      if (model.invoiceNo) {
          records.push({
              invoiceNo: model.invoiceNo,
              modelo: model.modelo || '',
              cfpContractNo: model.cfpContractNo || '',
              color: model.color || '',
              truck: model.truck || '',
              etd: model.etd || '',
              etaToDoor: model.etaToDoor || '',
              cfcContractNo: model.cfcContractNo || '',
              qty: Number(model.qty) || 0,
              destination: model.destination || ''
          });
      }
  }

  let saved = 0;
  for(const r of records) {
      try {
          await shippingService.addSchedule(r);
          saved++;
      } catch(e) {
          console.error("Failed to add shipping:", r.invoiceNo, e);
      }
  }
  console.log(`Saved ${saved} Shipping Schedule Records successfully.`);
}

async function run() {
    await processPricing();
    await processShipping();
    console.log("==> ALL DONE");
    process.exit(0);
}

run();
