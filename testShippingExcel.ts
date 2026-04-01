import * as XLSX from 'xlsx';
import fs from 'fs';

async function testShipping() {
    try {
        const files = fs.readdirSync('.');
        const excelFile = files.find(f => f.includes('shipping') && (f.endsWith('.xlsx') || f.endsWith('.xls')));
        if(!excelFile) throw new Error("Shipping Excel not found");
        console.log("Using file:", excelFile);

        const buffer = fs.readFileSync(excelFile);
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];
        
        let headerIdx = rows.findIndex(r => r.includes('Invoice No.') || r.includes('Model') || r.includes('CFP ORDER'));
        if (headerIdx === -1) headerIdx = 0;

        const headers = rows[headerIdx].map((h: any) => h?.toString().trim() || '');
        console.log("Headers:", headers);
        
        const records = [];
        for (let i = headerIdx + 1; i < rows.length; i++) {
            const row = rows[i];
            if (row.length < 2) continue;
            const model: any = {};
            headers.forEach((h: string, idx: number) => { model[h] = row[idx]?.toString().trim() || ''; });
            
            if(model['Invoice No.']) model.invoiceNo = model['Invoice No.'];
            
            if (model.invoiceNo) {
                records.push({ invoiceNo: model.invoiceNo });
            }
        }
        
        console.log(`Parsed ${records.length} records. Example:`, records[0]);

    } catch(e) {
        console.error("Error:", e);
    }
}
testShipping();
