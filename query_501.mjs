import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = { apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU", projectId: "logimaster-cfmoto" };
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function check() {
    const snap = await getDocs(collection(db, 'data_stage_reports'));
    let found501 = false;
    snap.docs.forEach(d => {
        const data = d.data();
        if (data.rawFiles) {
            data.rawFiles.forEach(f => {
                if (f.name && f.name.includes('501')) {
                    console.log(`Reporte ${d.id} tiene un archivo 501: ${f.name}. Filas: ${f.content?.split('\\n').length}`);
                    found501 = true;
                }
            });
        }
    });
    if (!found501) console.log("No se encontraron archivos 501 en data_stage_reports");
}
check().then(() => process.exit(0));
