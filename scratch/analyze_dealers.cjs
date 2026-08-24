const XLSX = require('xlsx');
const fs = require('fs');

try {
  const workbook = XLSX.readFile('scratch/DEALERS.xlsx');
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet);
  
  if (data.length > 0) {
    console.log("Headers:");
    console.log(Object.keys(data[0]));
    console.log("\nFirst Row:");
    console.log(data[0]);
    console.log(`\nTotal rows: ${data.length}`);
  } else {
    console.log("Sheet is empty.");
  }
} catch (error) {
  console.error("Error reading file:", error);
}
