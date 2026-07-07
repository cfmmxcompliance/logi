import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
  projectId: "logimaster-cfmoto"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function testDataStage() {
  console.log("Testeando conexión a data_stage_reports...");
  try {
    const q = query(collection(db, 'data_stage_reports'));
    const snap = await getDocs(q);
    console.log(`Se encontraron ${snap.docs.length} reportes cargados en Data Stage.`);
    
    snap.docs.forEach((d, i) => {
      const data = d.data();
      console.log(`\n--- Reporte ${i+1} ---`);
      console.log(`ID: ${data.id}`);
      console.log(`Nombre del archivo: ${data.fileName}`);
      console.log(`Fecha de subida: ${new Date(data.timestamp).toLocaleString()}`);
      console.log(`Total Pedimentos (records): ${data.stats?.totalRecords || (data.records ? data.records.length : 'No extraídos')}`);
      console.log(`Total Archivos en ZIP: ${data.stats?.totalRawFiles || (data.rawFiles ? data.rawFiles.length : 'No extraídos')}`);
      if (data.fileUrl) {
          console.log(`ZIP URL en Storage: Sí existe (${data.fileUrl.substring(0, 50)}...)`);
      } else {
          console.log(`ZIP URL en Storage: No`);
      }
    });

  } catch(e) {
    console.error("Error al leer data stage:", e);
  }
}
testDataStage().then(() => process.exit(0));
