import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, updateDoc, deleteDoc, getDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
  projectId: "logimaster-cfmoto"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function simulate() {
  console.log("=== INICIANDO SIMULACION EN FIREBASE ===");
  console.log("Coleccion: historico_expo");
  
  const docRef = doc(collection(db, 'historico_expo'), 'SIMULACION_TEST_001');
  
  // 1. ESCRITURA
  console.log("\n[1/3] Simulando Creacion de Registro...");
  await setDoc(docRef, {
    id: "SIMULACION_TEST_001",
    trailer: "CFM-TEST-999",
    pickupDayCFM: "2026-06-16",
    cfmRef: "SIM-CREACION",
    comments: "Registro creado desde script de simulacion",
    createdAt: Date.now()
  });
  console.log("✅ Registro CREADO exitosamente en Firestore.");
  
  await sleep(4000); // Pausa para que el usuario pueda comprobar o ver el log
  
  // 2. EDICION
  console.log("\n[2/3] Simulando Edicion de Registro (Agregando DODA)...");
  await updateDoc(docRef, {
    cfmRef: "SIM-EDICION",
    dodaUrl: "https://drive.google.com/file/d/test-url/view",
    comments: "Registro actualizado exitosamente con URL de DODA"
  });
  console.log("✅ Registro EDITADO exitosamente en Firestore.");
  
  await sleep(4000);
  
  // 3. ELIMINACION
  console.log("\n[3/3] Simulando Eliminacion de Registro...");
  await deleteDoc(docRef);
  console.log("✅ Registro ELIMINADO exitosamente de Firestore.");
  
  console.log("\n=== SIMULACION COMPLETADA ===");
}

simulate().then(() => process.exit(0)).catch(e => {
  console.error("Error durante simulacion:", e);
  process.exit(1);
});
