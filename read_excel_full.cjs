const XLSX = require('xlsx');
const workbook = XLSX.readFile('/Users/alex/Downloads/logimaster (2)/datos para AF.xlsx');
console.log("Sheets:", workbook.SheetNames);
for (const sheetName of workbook.SheetNames) {
    console.log("\n--- Sheet:", sheetName, "---");
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    console.log("Total Rows:", data.length);
    if (data.length > 0) {
        console.log("Row 1 (Headers?):", JSON.stringify(data[0]));
        if (data.length > 1) console.log("Row 2:", JSON.stringify(data[1]));
    }
}
