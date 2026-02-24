
const fs = require('fs');
const content = fs.readFileSync('/Users/alex/Downloads/logimaster (2)/services/storageService.ts', 'utf8');
const lines = content.split('\n');

let count = 0;
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cleanLine = line.replace(/\"[^\"]*\"/g, '').replace(/\'[^\']*\'/g, '').replace(/\/\/.*/g, '');

    const oldCount = count;
    for (let char of cleanLine) {
        if (char === '{') count++;
        if (char === '}') count--;
    }

    // Check lines that look like a property mapping with any indentation
    const match = line.match(/^(\s+)([a-zA-Z0-9]+): /) || line.match(/^(\s+)([a-zA-Z0-9]+)\(/);
    if (match) {
        const indent = match[1].length;
        if (indent > 2) {
            console.log(`PROPERTY at line ${i + 1}: Indent=${indent}, Count=${oldCount} | ${line.trim()}`);
        }
    }
}
console.log(`End of scan. Final count: ${count}`);
