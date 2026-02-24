import fs from 'fs';
import unzipper from 'unzipper';

const ZIP_FILE = '1406426_Solicitudes.zip';

async function inspect() {
    if (!fs.existsSync(ZIP_FILE)) {
        console.log(`❌ File ${ZIP_FILE} not found.`);
        return;
    }

    console.log(`Analyzing ${ZIP_FILE}...`);
    const directory = await unzipper.Open.file(ZIP_FILE);

    console.log(`Found ${directory.files.length} files.`);

    // Sample a few names
    directory.files.slice(0, 10).forEach(f => console.log(' -', f.path));

    // Check for 501/551
    const has501 = directory.files.some(f => f.path.includes('501'));
    const has551 = directory.files.some(f => f.path.includes('551'));

    console.log(`Contains 501 (Headers)? ${has501}`);
    console.log(`Contains 551 (Items)? ${has551}`);
}

inspect().catch(console.error);
