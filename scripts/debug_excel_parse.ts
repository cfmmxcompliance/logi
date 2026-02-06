
import * as xlsx from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

const fileName = 'CI-25CFMABTTP117_for_WHL089G506198.xlsx';
const filePath = path.resolve(process.cwd(), fileName);

if (!fs.existsSync(filePath)) {
    console.error("File not found:", filePath);
    process.exit(1);
}

// 1. Check Filename Regex (Container Logic)
console.log("--- Filename Analysis ---");
const containerRegex = /[A-Z]{4}\d{7}/;
const dhlRegex = /DHL\s+(\d+)/i;
const fedexRegex = /FedEx\s+(\d+)/i;

const matchContainer = fileName.match(containerRegex);
console.log(`Filename: ${fileName}`);
console.log(`Match Standard Container:`, matchContainer ? matchContainer[0] : "NO MATCH");

// 2. Parse Content
try {
    const buffer = fs.readFileSync(filePath);
    const wb = xlsx.read(buffer, { type: 'buffer' });
    const wsname = wb.SheetNames[0];
    const ws = wb.Sheets[wsname];
    const data: any[][] = xlsx.utils.sheet_to_json(ws, { header: 1 });

    console.log(`\n--- Content Analysis ---`);
    console.log(`Rows: ${data.length}`);

    // Mimic Header Detection
    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(data.length, 30); i++) {
        const rowStr = (data[i] || []).join(' ').toUpperCase();
        if (rowStr.includes('ITEM') && rowStr.includes('PART')) {
            headerRowIndex = i;
            console.log(`Header found at Row ${i}:`, data[i]);
            break;
        }
    }

    if (headerRowIndex === -1) {
        console.error("FAIL: Could not find header row (ITEM + PART).");
    } else {
        // Mimic Column Mapping (Updated Logic)
        const headers = (data[headerRowIndex] as any[]).map(c => String(c).toUpperCase().trim());
        const getColIndex = (predicate: (h: string) => boolean) => headers.findIndex(predicate);

        const colMap = {
            invoiceNo: getColIndex(h => h.includes('INVOICE') || h === 'FACTURA' || h === 'NO. DE FACTURA'), // Strict
            partNo: getColIndex(h => (h.replace('.', '').trim() === 'PART NO')),
            unitPrice: getColIndex(h => (h.includes('PRICE') && !h.includes('TOTAL')) || (h.includes('UNIT') && h.includes('USD')) || h === 'PRICE(USD)')
        };

        console.log("Column Mapping:", colMap);

        // Check Invoice Extraction Logic
        let invoiceNo = '';
        if (colMap.invoiceNo !== -1) {
            invoiceNo = String((data[headerRowIndex + 1] || [])[colMap.invoiceNo] || '').trim();
            console.log("Invoice from Column:", invoiceNo);
        } else {
            console.log("Invoice Column NOT found.");
        }

        // Filename Fallback
        if ((!invoiceNo || invoiceNo.length < 3) && fileName.includes('CI-')) {
            const ciMatch = fileName.match(/CI-([^_]+)/);
            if (ciMatch && ciMatch[1]) {
                invoiceNo = ciMatch[1];
                console.log("Invoice from Filename (Fallback):", invoiceNo);
            }
        }
    }

} catch (e) {
    console.error("Parse Error:", e);
}
