
import fs from 'fs';
import JSZip from 'jszip';
import path from 'path';

const filePath = '1787939_solicitudes (2).zip';

const analyze = async () => {
    try {
        const data = fs.readFileSync(filePath);
        const zip = await JSZip.loadAsync(data);

        console.log(`Analyzing: ${filePath}`);
        console.log(`Files found: ${Object.keys(zip.files).length}`);

        for (const [filename, file] of Object.entries(zip.files)) {
            if (file.dir) {
                console.log(`[DIR] ${filename}`);
                continue;
            }

            console.log(`[FILE] ${filename}`);
            const content = await file.async('string');
            const lines = content.split('\n').filter(l => l.trim().length > 0);
            console.log(`   Lines: ${lines.length}`);
            if (lines.length > 0) {
                console.log(`   Sample (Line 1): ${lines[0].substring(0, 100)}...`);
            }

            // Basic check for parser compatibility
            const parts = lines[0] ? lines[0].split('|') : [];
            if (parts.length > 1) {
                console.log(`   Detected delimiter '|'. Code maybe: ${parts[1] || 'Unknown'}`);
            } else {
                console.log(`   WARNING: No pipe delimiter found in first line.`);
            }
        }

    } catch (e) {
        console.error("Error reading zip:", e);
    }
};

analyze();
