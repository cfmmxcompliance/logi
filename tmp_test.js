import fs from 'fs';
try {
  const text = fs.readFileSync('/Users/alex/Downloads/logimaster (2)/墨西哥2026年度3月出口价格审批+签核版+-2026+carV3-3月用v1 (1).csv', 'utf-8');
  const lines = text.split('\n');
  let found = 0;
  for (let i = 0; i < lines.length; i++) {
     if (lines[i].includes('CFM-25MX-CFM174960C-4') || lines[i].includes('177765')) {
         console.log('Line ' + i + ':', lines[i]);
         found++;
     }
  }
  if (found === 0) console.log("Not found in the CSV. Checking the Excel file directly using grep..");
} catch (e) {
  console.log("Error reading CSV:", e.message);
}
