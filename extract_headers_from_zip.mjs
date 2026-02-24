import AdmZip from 'adm-zip';

const ZIP_PATH = '1798546_solicitudes (1).zip'; // Using the one confirmed to have data
const targetFiles = ['505', '551', '553', '554', '556', '557'];

async function extractHeaders() {
    try {
        const zip = new AdmZip(ZIP_PATH);
        const zipEntries = zip.getEntries();

        const headersMap = {};

        for (const entry of zipEntries) {
            const name = entry.entryName;
            // Match 505.asc, 551.txt etc.
            const match = name.match(/(\d{3})\.(asc|txt)$/i);
            if (match) {
                const code = match[1];
                if (targetFiles.includes(code)) {
                    const content = zip.readAsText(entry, 'latin1'); // latin1 usually for these files
                    const firstLine = content.split('\n')[0].trim();
                    if (firstLine.includes('|')) {
                        headersMap[code] = firstLine.split('|').map(h => h.trim().replace(/['"]/g, ''));
                    }
                }
            }
        }

        console.log("export const STANDARD_HEADERS = {");
        Object.keys(headersMap).forEach(k => {
            console.log(`  'ds${k}': ${JSON.stringify(headersMap[k])},`);
        });
        console.log("};");

    } catch (e) {
        console.error("Error reading zip:", e);
    }
}

extractHeaders();
