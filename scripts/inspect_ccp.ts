
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const filePath = '/Users/alex/Downloads/logimaster (2)/CCP EITU9407217.xlsx';

if (fs.existsSync(filePath)) {
    console.log(`Reading file: ${filePath}`);
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Get range
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');

    // Read first row (Headers)
    const headers = [];
    for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = { c: C, r: range.s.r };
        const cellRef = XLSX.utils.encode_cell(cellAddress);
        const cell = sheet[cellRef];
        if (cell && cell.v) {
            headers.push(String(cell.v));
        }
    }

    console.log('--- Headers ---');
    console.log(JSON.stringify(headers, null, 2));

    // Read first row of data
    const firstRow = [];
    for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = { c: C, r: range.s.r + 1 };
        const cellRef = XLSX.utils.encode_cell(cellAddress);
        const cell = sheet[cellRef];
        if (cell && cell.v) {
            firstRow.push(cell.v);
        } else {
            firstRow.push(null);
        }
    }
    console.log('--- First Row Data ---');
    console.log(JSON.stringify(firstRow, null, 2));

} else {
    console.error(`File not found: ${filePath}`);
}
