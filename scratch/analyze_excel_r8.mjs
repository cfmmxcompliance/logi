import fs from 'fs';
import * as XLSX from 'xlsx';

const filePath = '/Users/alex/Downloads/logimaster (2)/REGLAS 8VAS.xlsx';
console.log(`Analyzing: ${filePath}`);

try {
    const fileData = fs.readFileSync(filePath);
    const workbook = XLSX.read(fileData, { type: 'buffer' });
    
    console.log(`\nWorkbook contains ${workbook.SheetNames.length} sheets:`);
    console.log(workbook.SheetNames.join(', '));

    for (const sheetName of workbook.SheetNames) {
        console.log(`\n--- Sheet: ${sheetName} ---`);
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet, { defval: null });
        
        console.log(`Total Rows: ${data.length}`);
        
        if (data.length > 0) {
            console.log(`Columns: ${Object.keys(data[0]).join(', ')}`);
            console.log(`\nFirst 5 rows sample:`);
            console.log(JSON.stringify(data.slice(0, 5), null, 2));
        } else {
            console.log('Sheet is empty.');
        }
    }
} catch (e) {
    console.error("Error reading Excel file:", e.message);
}
