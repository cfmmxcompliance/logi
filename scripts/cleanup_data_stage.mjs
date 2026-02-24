import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, deleteDoc, doc, writeBatch } from 'firebase/firestore';

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

async function deleteCollectionSafe(db, collectionPath) {
    console.log(`Buscando en: ${collectionPath}`);
    const colRef = collection(db, collectionPath);
    const snapshot = await getDocs(colRef);

    if (snapshot.empty) {
        console.log(` - Vacía.`);
        return;
    }

    console.log(` - Encontrados ${snapshot.size} documentos. Borrando...`);

    const BATCH_LIMIT = 400;
    let batch = writeBatch(db);
    let count = 0;

    for (const doc of snapshot.docs) {
        batch.delete(doc.ref);
        count++;

        if (count >= BATCH_LIMIT) {
            await batch.commit();
            console.log(`   * Lote de ${count} borrado.`);
            batch = writeBatch(db); // Reset
            count = 0;
        }
    }

    if (count > 0) {
        await batch.commit();
        console.log(`   * Lote final de ${count} borrado.`);
    }
}

async function cleanupDataStageSafe() {
    console.log("🧹 Iniciando Limpieza PROFUNDA de Data Stage...");
    const reportsRef = collection(db, 'data_stage_reports');
    const reportsSnapshot = await getDocs(reportsRef);

    if (reportsSnapshot.empty) {
        console.log("⚠️ No hay reportes activos.");
    }

    for (const reportDoc of reportsSnapshot.docs) {
        const reportId = reportDoc.id;
        console.log(`\n🗑️ Procesando Reporte: ${reportId}`);
        await deleteCollectionSafe(db, `data_stage_reports/${reportId}/items`);
        await deleteCollectionSafe(db, `data_stage_reports/${reportId}/files`);
        await deleteDoc(reportDoc.ref);
        console.log(`✅ Reporte ${reportId} eliminado totalmente.`);
    }
    console.log("\n✨ Limpieza Completada.");
}

cleanupDataStageSafe();
