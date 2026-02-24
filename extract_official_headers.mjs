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
        const regMatch = line.match(/^(\d{3})\s+(.*)/);
        if (regMatch && !line.includes('Campo')) {
            if (currentReg) registers[currentReg] = fields;
            currentReg = `ds${regMatch[1]}`;
            fields = [];
            inFields = false;
            // console.log(`Found register: ${currentReg}`);
        }

        // Detect field start "Campos"
        if (line === 'Campos') {
            inFields = true;
            continue;
        }

        // If we are in the fields section, look for numbered fields "1.", "2."
        if (inFields && currentReg) {
            const fieldMatch = line.match(/^(\d+)\.$/);
            if (fieldMatch) {
                // The field name is usually on the following lines
                let name = "";
                let j = i + 1;
                while (j < lines.length && lines[j].trim() !== "" && !lines[j].match(/^\d+\.$/) && !lines[j].includes('Descripción') && !lines[j].includes('Tipo de Dato')) {
                    const candidate = lines[j].trim();
                    if (candidate && !candidate.match(/^\d+$/)) {
                        name += (name ? " " : "") + candidate;
                    }
                    j++;
                }
                if (name) {
                    // Clean name: e.g. "Clave de sección aduanera de despacho" -> "SeccionAduanera" or similar
                    // Actually, the user wants me to compare against what I have.
                    // Let's just store the raw name first.
                    fields.push(name);
                }
            }
        }
    }
    if (currentReg) registers[currentReg] = fields;

    return registers;
}

const officialSchema = extractHeaders();
console.log(JSON.stringify(officialSchema, null, 2));
