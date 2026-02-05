
import * as xlsx from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

const filePath = path.resolve(process.cwd(), 'CI-26CFMABTT28019_for_TEMU5746560.xlsx');

if (!fs.existsSync(filePath)) {
    console.error("File not found:", filePath);
    process.exit(1);
}

try {
    const buffer = fs.readFileSync(filePath);
    const wb = xlsx.read(buffer, { type: 'buffer' });
    const wsname = wb.SheetNames[0];
    const ws = wb.Sheets[wsname];
    const data: any[][] = xlsx.utils.sheet_to_json(ws, { header: 1 });

    console.log(`Loaded Excel. Rows: ${data.length}`);

    // Mimic CIExtractor Header Detection
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
        console.error("Could not find header row (ITEM + PART).");
        process.exit(1);
    }

    // Mimic Column Mapping
    const headerRow = data[headerRowIndex].map(c => String(c).toUpperCase().trim());
    const getColIndex = (keywords: string[]) => headerRow.findIndex(h => keywords.some(k => h.includes(k)));

    const colMap = {
        invoiceNo: getColIndex(['INVOICE', 'FACTURA', 'NO.']),
        partNo: getColIndex(['PART', 'MATERIAL']),
        description: getColIndex(['DESC', 'NAME', 'COMMODITY']),
        qty: getColIndex(['QTY', 'QUANTITY', 'PIECES']),
        unitPrice: getColIndex(['UNIT PRICE', 'PRICE/UNIT', 'PRECIO']),
        totalAmount: getColIndex(['TOTAL', 'AMOUNT', 'VALOR']),
        poNumber: getColIndex(['PO', 'ORDER', 'PURCHASE']),
        currency: getColIndex(['CURR', 'MONEDA'])
    };

    console.log("Column Mapping:", colMap);

    // Parse one item to see result
    if (data.length > headerRowIndex + 1) {
        const row = data[headerRowIndex + 1];
        console.log("First Data Row:", row);

        const invoiceNo = colMap.invoiceNo > -1 ? String(row[colMap.invoiceNo] || '').trim() : 'UNKNOWN';
        console.log("Extracted InvoiceNo:", invoiceNo);
    }

} catch (e) {
    console.error("Parse Error:", e);
}
