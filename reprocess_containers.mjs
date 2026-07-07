import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, writeBatch } from 'firebase/firestore';
import { mkdirSync, existsSync, readFileSync, rmSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

const TMP = './tmp_reprocess';

function downloadFromDrive(url, destPath) {
    const match = url.match(/\/d\/([^/]+)\//);
    if (!match) return false;
    const fileId = match[1];
    const directUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    try {
        execSync(`curl -sL "${directUrl}" -o "${destPath}"`, { timeout: 30000 });
        return existsSync(destPath) && readFileSync(destPath).length > 100;
    } catch(e) { return false; }
}

function extract504ContainerNumbers(extractDir) {
    // Find all 504 files and parse container numbers
    const containerMap = new Map(); // patente-pedimento-seccion -> string[]
    try {
        const files = execSync(`find "${extractDir}" -name "*_504*" -o -name "*504*" 2>/dev/null || true`, { encoding: 'utf-8' })
            .trim().split('\n').filter(Boolean);
        
        files.forEach(filePath => {
            try {
                const content = readFileSync(filePath, 'latin1');
                content.split('\n').forEach(line => {
                    if (line.startsWith('Patente|') || line.startsWith('NUM_PED|') || !line.trim()) return;
                    const cols = line.split('|');
                    if (cols.length < 4) return;
                    const key = `${cols[0].trim()}-${cols[1].trim()}-${cols[2].trim()}`;
                    const num = (cols[3] || '').trim();
                    if (!num) return;
                    if (!containerMap.has(key)) containerMap.set(key, []);
                    const arr = containerMap.get(key);
                    if (!arr.includes(num)) arr.push(num);
                });
            } catch(e) {}
        });
    } catch(e) {}
    return containerMap;
}

async function main() {
    const firebaseConfig = {
      apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
      projectId: "logimaster-cfmoto"
    };
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);

    mkdirSync(TMP, { recursive: true });

    const reportsSnap = await getDocs(collection(db, 'data_stage_reports'));
    const reports = reportsSnap.docs.map(d => ({ docId: d.id, ...d.data() }));
    console.log(`Reports: ${reports.length}`);

    let totalUpdated = 0;
    let totalSkipped = 0;
    let reportIdx = 0;

    for (const report of reports) {
        reportIdx++;
        const prefix = `[${reportIdx}/${reports.length}] ${(report.name || report.docId).substring(0, 30)}`;

        if (!report.storageUrl) {
            console.log(`${prefix}: Sin URL, skip`);
            totalSkipped++;
            continue;
        }

        // Download ZIP
        const zipPath = join(TMP, `${report.docId}.zip`);
        const extractDir = join(TMP, report.docId);
        const ok = downloadFromDrive(report.storageUrl, zipPath);
        if (!ok) {
            console.log(`${prefix}: Download failed, skip`);
            totalSkipped++;
            continue;
        }

        // Extract
        mkdirSync(extractDir, { recursive: true });
        try {
            execSync(`unzip -o -q "${zipPath}" -d "${extractDir}" 2>/dev/null || true`, { timeout: 10000 });
        } catch(e) {
            console.log(`${prefix}: Unzip failed, skip`);
            totalSkipped++;
            continue;
        }

        // Parse 504 container numbers
        const containerMap = extract504ContainerNumbers(extractDir);

        if (containerMap.size === 0) {
            console.log(`${prefix}: No containers in 504, skip`);
            // Cleanup
            try { rmSync(zipPath); rmSync(extractDir, { recursive: true }); } catch(e) {}
            continue;
        }

        // Get items and update containerNumbers
        const itemsSnap = await getDocs(collection(db, 'data_stage_reports', report.docId, 'items'));
        let updatedInReport = 0;
        
        // Batch updates (max 500 per batch)
        const updates = [];
        itemsSnap.docs.forEach(d => {
            const data = d.data();
            const key = `${data.patente}-${data.pedimento}-${data.seccion}`;
            const nums = containerMap.get(key);
            if (nums && nums.length > 0) {
                updates.push({ docId: d.id, containerNumbers: nums, containerCount: nums.length });
            }
        });

        // Write in batches of 450
        for (let i = 0; i < updates.length; i += 450) {
            const batch = writeBatch(db);
            const chunk = updates.slice(i, i + 450);
            chunk.forEach(u => {
                const ref = doc(db, 'data_stage_reports', report.docId, 'items', u.docId);
                batch.update(ref, { containerNumbers: u.containerNumbers, containerCount: u.containerCount });
            });
            await batch.commit();
        }

        updatedInReport = updates.length;
        totalUpdated += updatedInReport;
        console.log(`${prefix}: ${updatedInReport} items actualizados con containerNumbers (${containerMap.size} contenedores únicos)`);

        // Cleanup
        try { rmSync(zipPath); rmSync(extractDir, { recursive: true }); } catch(e) {}
    }

    // Cleanup tmp dir
    try { rmSync(TMP, { recursive: true }); } catch(e) {}

    console.log(`\n=== RESUMEN ===`);
    console.log(`Reports procesados: ${reportIdx}`);
    console.log(`Items actualizados: ${totalUpdated}`);
    console.log(`Reports sin datos: ${totalSkipped}`);

    process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
