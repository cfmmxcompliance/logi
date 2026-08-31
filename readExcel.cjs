const xlsx = require('xlsx');
const workbook = xlsx.readFile('/Users/alex/Downloads/logimaster (2)/可发运车辆清单.xlsx');
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
console.log(data.slice(0, 5));
