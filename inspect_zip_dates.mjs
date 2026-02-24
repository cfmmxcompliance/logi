import AdmZip from 'adm-zip';

const files = [
    '1839316_solicitudes (1).zip',
    '1798546_solicitudes (1).zip'
];

function checkZipDates() {
    console.log("🕵️‍♀️ Inspecting Zip Manifests for 2026 Data...");

    for (const file of files) {
        console.log(`\n📦 File: ${file}`);
        try {
            const zip = new AdmZip(file);
            const entries = zip.getEntries();

            // Look for ds501 (headers)
            const entry501 = entries.find(e => e.entryName.includes('_501.asc'));

            if (!entry501) {
                console.log("   ❌ No ds501 file found.");
                continue;
            }

            console.log(`   Found ${entry501.entryName}. Reading samples...`);
            const content = zip.readAsText(entry501);
            const lines = content.split(/\r?\n/).slice(1, 20); // First 20 lines (skip header)

            let found2026 = 0;
            const dates = [];

            lines.forEach(line => {
                // Header usually: CPContribuyente|...|FechaPagoReal|...
                // Only reliable way is to split and scan for date-like strings "2026-"
                const matches = line.match(/2026-\d{2}-\d{2}/);
                if (matches) {
                    found2026++;
                    dates.push(matches[0]);
                }
            });

            if (found2026 > 0) {
                console.log(`   ✅ FOUND 2026 DATA! (${found2026} matches in sample)`);
                console.log(`   Sample Dates: ${dates.slice(0, 3).join(', ')}`);
            } else {
                console.log("   ⚠️ No 2026 dates found in sample.");
                // Check general dates
                const anyDate = lines[0]?.match(/20\d{2}-\d{2}-\d{2}/);
                if (anyDate) console.log(`   Sample Date found: ${anyDate[0]}`);
            }

        } catch (e) {
            console.error(`   ❌ Error reading zip: ${e.message}`);
        }
    }
}

checkZipDates();
