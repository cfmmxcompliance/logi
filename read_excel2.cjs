const XLSX = require('xlsx');
const workbook = XLSX.readFile('/Users/alex/Downloads/logimaster (2)/datos para AF.xlsx');
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
data.forEach(row => {
    if (row.length > 0) console.log(JSON.stringify(row));
});
