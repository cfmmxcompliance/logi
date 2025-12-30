
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const fs = require('fs');

const refFile = '/Users/alex/Downloads/logimaster (2)/CCP EITU9407217.xlsx';
const genFile = '/Users/alex/Downloads/logimaster (2)/CCP GAOU7310729.xlsx'; // Assuming user saved it here? Or I will check specific cells of Ref.

function inspectFile(filePath) {
    if (!fs.existsSync(filePath)) {
        console.log(`File not found: ${filePath}`);
        return;
    }
    console.log(`--- Inspecting ${filePath.split('/').pop()} ---`);
    const wb = XLSX.readFile(filePath);
    const sheet = wb.Sheets[wb.SheetNames[0]];

    // Check specific keys in Header block A1:L31
    const keysToCheck = [
        'A1', 'C1', // Client Row
        'A6', 'C6', // Domicilio
        'A8', 'C8', // RFC
        'G8', 'H8', // Date
        'F7', 'I7', // Pedimento Label/Value
        'F8', 'I8', // Ejecutivo Label/Value
        'F10', 'I10', // BL Label/Value
        'F11', 'I11', // Service Label/Value
        'A31', 'B31', 'C31', 'D31', 'E31', 'F31' // Table Headers
    ];

    keysToCheck.forEach(key => {
        const cell = sheet[key];
        const val = cell ? JSON.stringify(cell.v) : 'EMPTY';
        console.log(`${key}: ${val}`);
    });

    // Check Merges
    if (sheet['!merges']) {
        console.log('Merges:', JSON.stringify(sheet['!merges'].map(m => XLSX.utils.encode_range(m))));
    } else {
        console.log('No Merges found.');
    }
}

inspectFile(refFile);
