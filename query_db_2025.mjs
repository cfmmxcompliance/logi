import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = { apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU", projectId: "logimaster-cfmoto" };
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function check2025() {
    console.log("Consultando la bóveda de todos los reportes en la base de datos...");
    const reportsSnap = await getDocs(collection(db, 'data_stage_reports'));
    const counts = {};
    
    for (const reportDoc of reportsSnap.docs) {
        const itemsSnap = await getDocs(collection(db, 'data_stage_reports', reportDoc.id, 'items'));
        itemsSnap.docs.forEach(itemDoc => {
            const data = itemDoc.data();
            const patente = data.patente;
            const seccion = data.seccion;
            const tipoOp = data.tipoOperacion === '1' ? '1 (IMPO)' : (data.tipoOperacion === '2' ? '2 (EXPO)' : data.tipoOperacion);
            const fecha = data.fechaPago || data.fechaEntrada || '';
            
            if (fecha.startsWith('2025')) {
                const key = `${patente}|${seccion}|${tipoOp}`;
                if (!counts[key]) counts[key] = new Set();
                counts[key].add(data.pedimento); // unique pedimentos
            }
        });
    }

    console.log('\n| PATENTE | SECCIÓN ADUANERA | TIPO OPERACIÓN | TOTAL PEDIMENTOS (2025) |');
    console.log('|---|---|---|---|');
    let totalUnicos = 0;
    Object.keys(counts).sort().forEach(key => {
        const [patente, seccion, tipoOp] = key.split('|');
        const uniqueCount = counts[key].size;
        totalUnicos += uniqueCount;
        console.log(`| ${patente} | ${seccion} | ${tipoOp} | ${uniqueCount} |`);
    });
    console.log(`| **TOTAL** | | | **${totalUnicos}** |`);
}
check2025().then(() => process.exit(0)).catch(e => console.error(e));
