import AdmZip from 'adm-zip';

const ZIP_PATH = '1798546_solicitudes (1).zip';

async function extractAllHeaders() {
    try {
        const zip = new AdmZip(ZIP_PATH);
        const zipEntries = zip.getEntries();

        const headersMap = {};

        for (const entry of zipEntries) {
            const name = entry.entryName;
            const match = name.match(/(\d{3})\.(asc|txt)$/i);
            if (match) {
                const code = match[1];
                const content = zip.readAsText(entry, 'latin1');
                const lines = content.split('\n');
                if (lines.length > 0) {
                    const firstLine = lines[0].trim();
                    if (firstLine.includes('|')) {
                        const headers = firstLine.split('|').map(h => h.trim().replace(/['"]/g, ''));
                        // Only store if it looks like a header (contains letters)
                        if (/[a-zA-Z]/.test(firstLine)) {
                            headersMap[code] = headers;
                        }
                    }
                }
            }
        }

        console.log("Found DS Headers:");
        Object.keys(headersMap).sort().forEach(code => {
            console.log(`\n--- ds${code} ---`);
            console.log(JSON.stringify(headersMap[code]));
        });

    } catch (e) {
        console.error("Error reading zip:", e);
    }
}

extractAllHeaders();
