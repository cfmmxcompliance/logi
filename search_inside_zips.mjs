import AdmZip from 'adm-zip';
import fs from 'fs';

const files = fs.readdirSync('.').filter(f => f.endsWith('.zip'));
const targets = ['516', '517', '518', '519'];

async function searchInside() {
    for (const zipPath of files) {
        process.stdout.write(`\n--- Zip: ${zipPath} `);
        try {
            const zip = new AdmZip(zipPath);
            const zipEntries = zip.getEntries();
            for (const entry of zipEntries) {
                if (entry.isDirectory) continue;
                if (!entry.entryName.match(/\.(asc|txt|csv)$/i)) continue;

                const content = zip.readAsText(entry, 'latin1');
                const lines = content.split('\n');
                for (const line of lines) {
                    const trimmed = line.trim();
                    for (const t of targets) {
                        if (trimmed.startsWith(`${t}|`)) {
                            console.log(`\nFound code ${t} in ${entry.entryName}:`);
                            console.log(`   Line: ${trimmed}`);
                            // Stop after finding one for this target in this file
                            break;
                        }
                    }
                }
            }
            process.stdout.write(` Done.`);
        } catch (e) {
            console.error(` Error: ${e.message}`);
        }
    }
    console.log("\nScan complete.");
}

searchInside();
