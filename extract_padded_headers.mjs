import fs from 'fs';

const content = fs.readFileSync('format_ds_layout.txt', 'utf8');
const lines = content.split('\n');

const schemas = {};
let currentCode = null;

lines.forEach(line => {
    // Detect code start (e.g., "501 Datos generales")
    const codeMatch = line.match(/^(\d{3})\s+(.+)$/);
    if (codeMatch) {
        currentCode = codeMatch[1];
        schemas[currentCode] = [];
        return;
    }

    if (!currentCode) return;

    // Detect field (e.g., "   1.   Patente Aduanal")
    const fieldMatch = line.match(/^\s+(\d+)\.\s+([A-ZÁÉÍÓÚÑa-záéíóúñ\s/.-]+)\s{2,}/);
    if (fieldMatch) {
        const index = parseInt(fieldMatch[1]);
        const name = fieldMatch[2].trim();
        // Ensure index is unique or just push
        if (schemas[currentCode]) {
            schemas[currentCode].push({ index, name });
        }
    }
});

// Post-process to ensure Padded Titles
const paddedSchemas = {};
Object.entries(schemas).forEach(([code, fields]) => {
    // Some fields might span multiple lines if the regex missed them, 
    // but the PoC will focus on 501 first.
    paddedSchemas[code] = fields.map(f => {
        const prefix = String(f.index).padStart(2, '0');
        return `${prefix}${f.name}`;
    });
});

console.log(JSON.stringify(paddedSchemas, null, 2));
fs.writeFileSync('padded_schemas.json', JSON.stringify(paddedSchemas, null, 2));
