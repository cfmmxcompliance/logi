import AdmZip from 'adm-zip';
import fs from 'fs';

const ZIP_FILES = ['1798546_solicitudes (1).zip', '1839316_solicitudes (1).zip'];
const TARGETS = ['516', '517', '518', '519'];

async function extractHeaders() {
    const headersMap = {};

    for (const zipPath of ZIP_FILES) {
        if (!fs.existsSync(zipPath)) continue;
        console.log(`Checking ${zipPath}...`);
        try {
            const zip = new AdmZip(zipPath);
            const zipEntries = zip.getEntries();

            for (const entry of zipEntries) {
                const name = entry.entryName;
                const match = name.match(/(\d{3})\.(asc|txt)$/i);
                if (match) {
                    const code = match[1];
                    if (TARGETS.includes(code) && !headersMap[code]) {
                        const content = zip.readAsText(entry, 'latin1');
                        const firstLine = content.split('\n')[0].trim();
                        if (firstLine.includes('|') && /[a-zA-Z]/.test(firstLine)) {
                            headersMap[code] = firstLine.split('|').map(h => h.trim().replace(/['"]/g, ''));
                        }
                    }
                }
            }
        } catch (e) {
            console.error(`Error reading ${zipPath}:`, e);
        }
    }

    console.log("Extracted Headers:");
    Object.keys(headersMap).sort().forEach(code => {
        console.log(`\n'ds${code}': ${JSON.stringify(headersMap[code])},`);
    });
}

extractHeaders();
