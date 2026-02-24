import AdmZip from 'adm-zip';
import fs from 'fs';

const TARGETS = ['516', '517', '518', '519'];

async function searchAllZips() {
    const files = fs.readdirSync('.').filter(f => f.endsWith('.zip'));
    console.log(`Found zips: ${files.join(', ')}`);

    const headersMap = {};

    for (const zipPath of files) {
        console.log(`\n--- Checking ${zipPath} ---`);
        try {
            const zip = new AdmZip(zipPath);
            const zipEntries = zip.getEntries();

            for (const entry of zipEntries) {
                const name = entry.entryName;
                const match = name.match(/(\d{3})\.(asc|txt|csv)$/i);
                if (match) {
                    const code = match[1];
                    if (TARGETS.includes(code)) {
                        console.log(`   Found match: ${name}`);
                        if (!headersMap[code]) {
                            const content = zip.readAsText(entry, 'latin1');
                            const firstLine = content.split('\n')[0].trim();
                            if (firstLine.includes('|')) {
                                headersMap[code] = firstLine.split('|').map(h => h.trim().replace(/['"]/g, ''));
                                console.log(`   Extracted Headers for ${code}`);
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.error(`   Error reading ${zipPath}: ${e.message}`);
        }
    }

    console.log("\nFinal Extracted Headers:");
    Object.keys(headersMap).sort().forEach(code => {
        console.log(`'ds${code}': ${JSON.stringify(headersMap[code])},`);
    });
}

searchAllZips();
