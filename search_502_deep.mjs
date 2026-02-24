import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit, query } from 'firebase/firestore';

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

async function deepSearch502() {
    console.log("🔍 BÚSQUEDA EXHAUSTIVA DE DATOS 502...");

    const snap = await getDocs(collection(db, 'data_stage_reports'));
    let foundCount = 0;

    snap.forEach(d => {
        const data = d.data();
        const files = data.rawFiles || data.rawData || [];

        const file502 = files.find(f => String(f.code) === '502');

        if (file502) {
            const rowCount = file502.rows ? file502.rows.length : 0;
            const contentLen = file502.content ? file502.content.length : 0;

            if (rowCount > 0 || contentLen > 0) {
                console.log(`✅ ID: ${d.id} | Filas: ${rowCount} | ContentLen: ${contentLen}`);
                // Print sample
                if (rowCount > 0 && foundCount < 1) {
                    console.log("MUESTRA (Primeras 2 filas):");
                    console.log(JSON.stringify(file502.rows.slice(0, 2), null, 2));
                }
                foundCount++;
            }
        }
    });

    if (foundCount === 0) {
        console.log("❌ No se encontró ningún archivo 502 con datos en toda la colección.");
    } else {
        console.log(`\n✨ Se encontraron ${foundCount} reportes con datos 502.`);
    }

    process.exit(0);
}

deepSearch502();
