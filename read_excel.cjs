const XLSX = require('xlsx');
const workbook = XLSX.readFile('/Users/alex/Downloads/logimaster (2)/datos para AF.xlsx');
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
console.log("Sheet Name:", sheetName);
console.log("Total Rows:", data.length);
if (data.length > 0) {
    console.log("Headers:", JSON.stringify(data[0]));
    console.log("First Row:", JSON.stringify(data[1]));
    console.log("Second Row:", JSON.stringify(data[2]));
}
