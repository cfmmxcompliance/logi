
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const fs = require('fs');

const filePath = '/Users/alex/Downloads/logimaster (2)/CCP EITU9407217.xlsx';

if (fs.existsSync(filePath)) {
    console.log(`Reading file: ${filePath}`);
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Get range
    const range = XLSX.utils.decode_range(sheet['!ref']);

    console.log('--- Rows 20-60 ---');
    const rows = [];
    const maxRow = Math.min(range.e.r, 60);

    for (let R = 19; R <= maxRow; ++R) { // Start from index 19 (Row 20)
        const row = [];
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const cellAddress = { c: C, r: R };
            const cellRef = XLSX.utils.encode_cell(cellAddress);
            const cell = sheet[cellRef];
            row.push(cell ? cell.v : null);
        }
        rows.push({ row: R + 1, data: row });
    }

    console.log(JSON.stringify(rows, null, 2));

} else {
    console.error(`File not found: ${filePath}`);
}
