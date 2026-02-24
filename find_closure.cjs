
const fs = require('fs');
const content = fs.readFileSync('/Users/alex/Downloads/logimaster (2)/services/storageService.ts', 'utf8');
const lines = content.split('\n');

let count = 0;
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cleanLine = line.replace(/\"[^\"]*\"/g, '').replace(/\'[^\']*\'/g, '').replace(/\/\/.*/g, '');

    for (let char of cleanLine) {
        if (char === '{') count++;
        if (char === '}') count--;
    }

    if (i + 1 > 317 && count === 0) {
        console.log(`PREMATURE CLOSURE at line ${i + 1}: ${line}`);
        break;
    }
}
console.log(`End of scan.`);
