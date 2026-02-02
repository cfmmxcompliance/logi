import * as XLSX from 'xlsx';
import fs from 'fs';

const FILE_PATH = 'VUCEM_Financial_Report_2026-02-02 (7).xlsx';

try {
    const buf = fs.readFileSync(FILE_PATH);
    const workbook = XLSX.read(buf, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);

    console.log(`\n📊 Analyzing: ${FILE_PATH}`);
    console.log(`Total Rows: ${data.length}`);

    if (data.length === 0) {
        console.log("⚠️ File is empty.");
        process.exit(0);
    }

    const headers = Object.keys(data[0]);
    const entires = data.length;
    const stats = {};

    headers.forEach(h => stats[h] = 0);

    data.forEach(row => {
        headers.forEach(h => {
            const val = row[h];
            // Check if empty/null/0
            if (!val || val === 0 || val === '0' || val === '' || val === 'N/A') {
                stats[h]++;
            }
        });
    });

    console.log("\n📉 Missing/Zero Values Report:");
    console.table(headers.map(h => ({
        Column: h,
        Missing: stats[h],
        Percentage: Math.round((stats[h] / entires) * 100) + '%'
    })));

    // Print sample of first row to see column names mapping
    console.log("\n🔍 Sample Row 1:");
    console.log(JSON.stringify(data[0], null, 2));

} catch (e) {
    console.error("Error:", e.message);
}
