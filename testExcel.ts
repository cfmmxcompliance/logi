import * as XLSX from 'xlsx';
import fs from 'fs';

async function test() {
    try {
        console.log("Reading file...");
        const buffer = fs.readFileSync('墨西哥2026年度3月出口价格审批+签核版+-2026+carV3-3月用v1 (1).xlsx');
        console.log("Buffer size:", buffer.length);
        
        console.log("Parsing with XLSX...");
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        console.log("SheetName:", sheetName);
        
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];
        console.log(`Parsed ${rows.length} rows`);
        
        if (rows.length > 5) {
            console.log("Row 0:", rows[0]);
            console.log("Row 1:", rows[1]);
            console.log("Row 2:", rows[2]); 
        }

        let headerIdx = rows.findIndex(r => r.includes('车型') || r.includes('Model') || r.includes('合同号Contract No.'));
        if(headerIdx === -1) headerIdx = 0;
        
        console.log("Detected Header Index:", headerIdx);
        console.log("Headers:", rows[headerIdx]);
        
    } catch(e) {
        console.error("Error details:", e);
    }
}

test();
