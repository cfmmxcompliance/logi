import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit, query, where, getDoc, doc } from 'firebase/firestore';

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

async function find502Content() {
    console.log("🔍 BUSCANDO CONTENIDO REAL EN EL ARCHIVO 502...");

    const q = query(collection(db, 'data_stage_reports'), limit(20));
    const snap = await getDocs(q);
    let found = false;

    for (const d of snap.docs) {
        const data = d.data();
        const rawData = data.rawData || [];
        const file502 = rawData.find(r => r.code === '502');

        if (file502 && (file502.content || (file502.rows && file502.rows.length > 0))) {
            console.log(`\n✅ ENCONTRADO en Reporte ID: ${d.id}`);
            console.log("---------------------------------------------------");
            if (file502.content) {
                console.log("CONTENIDO (Primeros 500 chars):");
                console.log(file502.content.substring(0, 500));
            } else {
                console.log("ROWS (Primeros 3 items):");
                console.log(JSON.stringify(file502.rows.slice(0, 3), null, 2));
            }
            found = true;
            break;
        }
    }

    if (!found) {
        console.log("❌ No se encontró contenido en los archivos 502 de los últimos 20 reportes.");
    }

    process.exit(0);
}

find502Content();
