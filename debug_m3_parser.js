
// Mock file content simulation
const testContent = `
501|HEADER|DATE|...
502|TRANSPORT|TRUCK|...
503|GUIDE|12345|...
510|ERROR|...
|511|BAD FORMAT|...
512 | TRIM TEST | ...
`;

const lines = testContent.split(/\r?\n/).filter(line => line.trim() !== '');
console.log(`Lines found: ${lines.length}`);

const matrix = lines.map(line => line.split('|'));

const codeGroups = new Map();
const fileCode = "501"; // Assume parsing detected Header

matrix.forEach(row => {
    const rowCode = row[0] ? row[0].trim() : '';
    console.log(`Row[0]: '${row[0]}' -> Code: '${rowCode}' -> Match: ${/^\d{3}$/.test(rowCode)}`);

    if (/^\d{3}$/.test(rowCode)) {
        if (!codeGroups.has(rowCode)) codeGroups.set(rowCode, []);
        codeGroups.get(rowCode).push(row);
    }
});

console.log("\n--- Groups Found ---");
for (const [code, rows] of codeGroups.entries()) {
    console.log(`Code ${code}: ${rows.length} rows`);
    if (code !== fileCode) {
        console.log(`-> WOULD CREATE VIRTUAL FILE: [${code}]`);
    } else {
        console.log(`-> SKIPPED (Matches Main File Code)`);
    }
}
