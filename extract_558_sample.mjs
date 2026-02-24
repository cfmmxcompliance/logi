import AdmZip from 'adm-zip';

const ZIP_FILE = '1798546_solicitudes (1).zip';

async function extractSample() {
    const zip = new AdmZip(ZIP_FILE);
    const entry = zip.getEntry('1798546_558.asc');
    if (entry) {
        const content = zip.readAsText(entry, 'latin1');
        const lines = content.split('\n');
        console.log("Sample Line (ds558):");
        console.log(lines[0]);
        console.log("Pipe count:", (lines[0].match(/\|/g) || []).length);
        console.log("Fields:", lines[0].split('|').map((f, i) => `${i + 1}: ${f}`).join(', '));
    } else {
        console.log("File not found.");
    }
}

extractSample();
