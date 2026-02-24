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

const COLS = [
    'ds501',
    'ds505',
    'ds551',
    'ds506',
    'ds520',
    'ds_files',
    'ds_items'
];

async function verifyCollections() {
    console.log("🔍 Verificando colecciones de Data Stage en Firestore...");
    console.log("---------------------------------------------------------");

    let allGood = true;

    for (const colName of COLS) {
        try {
            const q = query(collection(db, colName), limit(5));
            const snap = await getDocs(q);

            if (snap.empty) {
                console.log(`❌ [${colName}] : VACÍA o NO EXISTE (0 documentos)`);
                allGood = false;
            } else {
                console.log(`✅ [${colName}] : EXISTE (${snap.size} documentos de muestra encontrados)`);
                // Optional: Print one ID to confirm structure
                // console.log(`   Sample ID: ${snap.docs[0].id}`);
            }
        } catch (e) {
            console.error(`❌ [${colName}] : ERROR DE LECTURA`, e.message);
            allGood = false;
        }
    }

    console.log("---------------------------------------------------------");
    if (allGood) {
        console.log("🚀 ÉXITO TOTAL: Todas las colecciones existen y tienen datos.");
    } else {
        console.log("⚠️ ATENCIÓN: Faltan colecciones o están vacías.");
        console.log("   (Esto es normal si no has guardado nada aún, o si las reglas de seguridad siguen bloqueando).");
    }
    process.exit(0);
}

verifyCollections();
