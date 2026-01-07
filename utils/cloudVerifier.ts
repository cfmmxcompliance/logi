
// Script de Verificación de Persistencia en Nube
// Propósito: Confirmar que los datos existen realmente en Firestore (Nube de Google)
// Ejecutar manualmente si se requiere auditoría

import { db } from '../services/firebaseConfig';
import { collection, getDocs, limit, query } from 'firebase/firestore';

export const verificarPersistenciaNube = async (reportId: string) => {
    console.log(`☁️ Verificando reporte en la nube: ${reportId}`);

    try {
        // 1. Verificar Documento Principal
        const mainRef = collection(db, 'data_stage_reports');
        // Nota: Esto es solo un script de ejemplo, en realidad usaríamos getDoc(doc(db...))
        // pero para ilustrar la 'búsqueda' en la nube:

        // 2. Verificar Sub-colección 'items' (Donde están los datos pesados)
        const itemsRef = collection(db, 'data_stage_reports', reportId, 'items');
        const q = query(itemsRef, limit(5)); // Solo traer 5 para probar
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            console.error("❌ El reporte existe pero NO tiene items en la nube. (Fallo de subida por lotes)");
            return false;
        }

        console.log(`✅ ÉXITO: Se encontraron ${snapshot.size} registros de muestra en la nube.`);
        snapshot.forEach(doc => {
            console.log(`   - Item ID: ${doc.id} | Datos:`, doc.data().pedimento);
        });
        console.log("Confirmado: Los datos están 'En Línea' y no en tu máquina local.");
        return true;

    } catch (e) {
        console.error("❌ Error de conexión con la nube:", e);
        return false;
    }
};
