import fs from 'fs';
import unzipper from 'unzipper';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
    authDomain: "logimaster-cfmoto.firebaseapp.com",
    projectId: "logimaster-cfmoto",
    storageBucket: "logimaster-cfmoto.firebasestorage.app",
    messagingSenderId: "924452835722",
    appId: "1:924452835722:web:11a7eedec65ba034dc7873",
    measurementId: "G-01VXE7L5C3"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const ZIP_FILE = '1406426_Solicitudes.zip';

async function run() {
    console.log("🔍 Extracting one file for Deep Verification...");

    fs.createReadStream(ZIP_FILE)
        .pipe(unzipper.Parse())
        .on('entry', async (entry) => {
            if (entry.path.endsWith('.asc') || entry.path.endsWith('.txt')) {
                // Determine Collection
                const codeMatch = entry.path.match(/_(\d{3})\./);
                const code = codeMatch ? codeMatch[1] : '000';
                const colName = `ds${code}`;

                // Only check ds551 for consistency with previous checks if possible, or any
                if (code !== '551') {
                    entry.autodrain();
                    return;
                }

                console.log(`-> Found candidate: ${entry.path} (Collection: ${colName})`);

                const buffer = await entry.buffer();
                const text = buffer.toString('latin1');
                const lines = text.split(/\r?\n/).filter(l => l.trim());

                if (lines.length < 2) {
                    console.log("File too short, skipping.");
                    return;
                }

                // Assume header is first line
                const headerLine = lines[0];
                const dataLine = lines[1]; // First data row (Index 0 for parser logic if header detected)

                // Parser Logic Simulation
                const headers = headerLine.split('|').map(h => h.trim().replace(/['"]/g, ''));
                const values = dataLine.split('|').map(v => v.trim().replace(/['"]/g, ''));

                // Construct ID
                const safeFileName = entry.path.replace(/[.#$/[\]]/g, '_');
                const customId = `${safeFileName}_0`;

                console.log(`Checking Doc ID: ${customId}`);

                try {
                    const docRef = doc(db, colName, customId);
                    const snap = await getDoc(docRef);

                    if (!snap.exists()) {
                        console.error("❌ Document NOT FOUND in Firestore!");
                        process.exit(1);
                    }

                    const data = snap.data();
                    console.log("✅ Document Found!");
                    console.log("-------------------------------------------------");
                    console.log(`RAW HEADER: ${headerLine}`);
                    console.log(`RAW DATA  : ${dataLine}`);
                    console.log("-------------------------------------------------");
                    console.log("FIRESTORE DATA:");
                    console.log(JSON.stringify(data, null, 2));
                    console.log("-------------------------------------------------");

                    // Verification
                    let match = true;
                    headers.forEach((h, i) => {
                        if (data[h] !== values[i]) {
                            // Handle undefined if header missing in data?
                            if (data[h] === undefined && values[i] === '') return;
                            console.error(`❌ MISMATCH at column '${h}': File='${values[i]}' vs DB='${data[h]}'`);
                            match = false;
                        }
                    });

                    if (match) {
                        console.log("✅ PERFECT MATCH!");
                    } else {
                        console.log("⚠️ CONTENT MISMATCH DETECTED.");
                    }
                    process.exit(0);

                } catch (e) {
                    console.error("Error fetching doc:", e);
                    process.exit(1);
                }
            } else {
                entry.autodrain();
            }
        });
}

run();
