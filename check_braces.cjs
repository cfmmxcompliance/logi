
const fs = require('fs');
const content = fs.readFileSync('/Users/alex/Downloads/logimaster (2)/services/storageService.ts', 'utf8');
const lines = content.split('\n');

let count = 0;
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Remove strings and comments to avoid false positives
    const cleanLine = line.replace(/\"[^\"]*\"/g, '').replace(/\'[^\']*\'/g, '').replace(/\/\/.*/g, '');

    for (let char of cleanLine) {
        if (char === '{') count++;
        if (char === '}') count--;
    }

    if (count < 0) {
        console.log(`ERROR: Count dropped below 0 at line ${i + 1}`);
        console.log(line);
        break;
    }

    // Optional: print count for specific areas
    if ((i + 1 >= 2500 && i + 1 <= 3332) || (i + 1 === 317)) {
        console.log(`${i + 1}: ${count} | ${line}`);
    }
}
console.log(`Final count: ${count}`);
