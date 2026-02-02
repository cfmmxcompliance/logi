import ExcelJS from 'exceljs';
import path from 'path';

const FILE_PATH = 'VUCEM_Financial_Report_2026-02-02 (7).xlsx';

async function analyze() {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(FILE_PATH);
    const sheet = workbook.getWorksheet(1);

    console.log(`\n📊 Analyzing Styles: ${FILE_PATH}`);

    let yellowCount = 0;
    const yellowMapping = {};

    sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Skip headers

        row.eachCell((cell, colNumber) => {
            const fill = cell.fill;
            let isYellow = false;

            if (fill && fill.type === 'pattern' && fill.fgColor) {
                const color = fill.fgColor.argb || fill.fgColor.theme;
                // Yellow ARGB is usually FFFFFF00 or similar
                if (color === 'FFFFFF00' || color === 'FFFFFFE0' || color === 'FFFFFFC0') {
                    isYellow = true;
                }
            }

            if (isYellow || !cell.value || cell.value === 0) {
                const header = sheet.getRow(1).getCell(colNumber).value;
                if (!yellowMapping[header]) yellowMapping[header] = 0;
                yellowMapping[header]++;
                yellowCount++;
            }
        });
    });

    console.log(`\nFound ${yellowCount} problematic/highlighted cells.`);
    console.table(Object.keys(yellowMapping).map(h => ({
        Column: h,
        Count: yellowMapping[h]
    })));
}

analyze().catch(err => console.error(err));
