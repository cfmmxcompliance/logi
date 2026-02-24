import fs from 'fs';

const content = fs.readFileSync('format_ds.txt', 'utf8');

function extractHeaders() {
    const registers = {};
    let currentReg = null;
    let fields = [];

    const lines = content.split('\n');
    let inFields = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Detect register header: "501 Datos generales"
        // Avoid "501" appearing in descriptions by checking if it's at start of line and followed by name
        if (line.match(/^(501|502|503|504|505|506|507|508|509|510|511|512|520|551|552|553|554|555|556|557|558|701|702)\s+[A-Z]/)) {
            if (currentReg) registers[currentReg] = cleanFields(fields);
            currentReg = `ds${line.split(' ')[0]}`;
            fields = [];
            inFields = false;
            // console.log(`Found: ${currentReg}`);
            continue;
        }

        if (line === 'Campos') {
            inFields = true;
            continue;
        }

        if (inFields && currentReg) {
            // Look for field markers like "1.", "2."
            const fieldMatch = line.match(/^(\d+)\.$/);
            if (fieldMatch) {
                let name = "";
                let j = i + 1;
                // Collect lines until next number or a major separator
                while (j < lines.length) {
                    const nextLine = lines[j].trim();
                    if (nextLine.match(/^\d+\.$/)) break; // Next field
                    if (nextLine.match(/^(501|502|551|701)/)) break; // Next register
                    if (nextLine === 'Descripción' || nextLine === 'Tipo de Dato') {
                        j++;
                        continue;
                    }
                    if (nextLine !== "" && !nextLine.match(/^[0-9, \.\(\)]+$/)) {
                        name += (name ? " " : "") + nextLine;
                    }
                    j++;
                }
                if (name) {
                    fields.push({ index: parseInt(fieldMatch[1]), raw: name });
                }
            }
        }
    }
    if (currentReg) registers[currentReg] = cleanFields(fields);

    return registers;
}

function cleanFields(fields) {
    // Sort by index and return just labels
    return fields.sort((a, b) => a.index - b.index).map(f => f.raw);
}

const officialSchema = extractHeaders();
Object.keys(officialSchema).forEach(k => {
    console.log(`\n--- ${k} (${officialSchema[k].length} fields) ---`);
    officialSchema[k].forEach((f, idx) => {
        console.log(`${idx + 1}. ${f.substring(0, 60)}`);
    });
});
