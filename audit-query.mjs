import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, limit, getDocs } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
    authDomain: "logimaster-cfmoto.firebaseapp.com",
    projectId: "logimaster-cfmoto",
    storageBucket: "logimaster-cfmoto.firebasestorage.app",
    messagingSenderId: "924452835722",
    appId: "1:924452835722:web:11a7eedec65ba034dc7873",
    measurementId: "G-01VXE7L5C3"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkData() {
    console.log("🔍 Consultando BD desde Terminal...");
    const partsRef = collection(db, 'parts');

    // Check strict match for Jan 24 (or greater)
    // Note: If UPDATE_TIME is string, lexicographical comparison works.
    const q = query(partsRef, where("UPDATE_TIME", ">=", "2026-01-24"), limit(5));

    try {
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            console.log("❌ No se encontraron documentos con UPDATE_TIME >= 2026-01-24.");
        } else {
            console.log(`✅ Encontrados ${querySnapshot.size} documentos:`);
            querySnapshot.forEach((doc) => {
                console.log(`ID: ${doc.id} => UPDATE_TIME: ${doc.data().UPDATE_TIME}, PART_NUMBER: ${doc.data().PART_NUMBER}`);
            });
        }
    } catch (error) {
        console.error("⚠️ Error de Permisos o Conexión:", error.message);
        console.log("Nota: Si dice 'Missing or insufficient permissions', es porque la terminal NO está autenticada. Usa el navegador.");
    }
}

checkData();
