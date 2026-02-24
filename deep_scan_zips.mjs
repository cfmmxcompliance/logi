import AdmZip from 'adm-zip';
import fs from 'fs';

const files = fs.readdirSync('.').filter(f => f.endsWith('.zip'));

async function deepScan() {
    for (const zipPath of files) {
        console.log(`\n--- Zip: ${zipPath} ---`);
        try {
            const zip = new AdmZip(zipPath);
            const zipEntries = zip.getEntries();
            for (const entry of zipEntries) {
                if (entry.entryName.includes('516') || entry.entryName.includes('517') || entry.entryName.includes('518') || entry.entryName.includes('519')) {
                    console.log(`Found relevant file: ${entry.entryName}`);
                    const content = zip.readAsText(entry, 'latin1');
                    const firstLine = content.split('\n')[0].trim();
                    console.log(`   First Line: ${firstLine}`);
                }
            }
        } catch (e) {
            console.error(`   Error: ${e.message}`);
        }
    }
}

deepScan();
