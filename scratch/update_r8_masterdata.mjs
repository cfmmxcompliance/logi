import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, updateDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
  authDomain: "logimaster-cfmoto.firebaseapp.com",
  projectId: "logimaster-cfmoto",
  storageBucket: "logimaster-cfmoto.firebasestorage.app",
  messagingSenderId: "924452835722",
  appId: "1:924452835722:web:11a7eedec65ba034dc7873",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function runUpdate() {
  console.log("Cargando MasterData (parts)...");
  const partsSnap = await getDocs(collection(db, "parts"));
  const masterData = [];
  partsSnap.forEach(doc => masterData.push(doc.data()));
  console.log(`Se cargaron ${masterData.length} registros de MasterData.`);

  console.log("Cargando registros Rule 8th...");
  const r8Snap = await getDocs(collection(db, "rule_8ths"));
  let updatedCount = 0;

  for (const r8Doc of r8Snap.docs) {
    const rule = r8Doc.data();
    const id = r8Doc.id;

    const r8CleanDesc = (rule.description || '').trim().toUpperCase();
    const r8CleanPermiso = (rule.permisoPrevio || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();

    // MATCH LOGIC (Igual que ReglaOctava.tsx)
    const permisoMatch = r8CleanPermiso
      ? masterData.find(p => (p.R8 || '').replace(/[^A-Z0-9]/gi, '').toUpperCase() === r8CleanPermiso)
      : null;

    let updates = {};

    if (permisoMatch) {
      const displayDesc = permisoMatch.DESCRIPCION_ES || '';
      const mdCleanDesc = displayDesc.trim().toUpperCase();
      const isDescOk = !!r8CleanDesc && mdCleanDesc === r8CleanDesc;

      updates = {
        masterdataMatch: isDescOk ? 'exact' : 'desc_mismatch',
        masterdataPartNumber: permisoMatch.PART_NUMBER || null,
        masterdataDescription: permisoMatch.DESCRIPCION_ES || null,
        masterdataR8: permisoMatch.R8 || null,
        masterdataErrors: isDescOk ? [] : ['Descripción difiere']
      };
      console.log(`[UPDATE] ${r8CleanPermiso} -> Encontrado. Match exacto: ${isDescOk}`);
    } else {
      updates = {
        masterdataMatch: 'not_found',
        masterdataPartNumber: null,
        masterdataDescription: null,
        masterdataR8: null,
        masterdataErrors: ['No se encontró en MasterData']
      };
      console.log(`[SKIP] ${r8CleanPermiso} -> No encontrado en MasterData.`);
    }

    await updateDoc(doc(db, "rule_8ths", id), updates);
    updatedCount++;
  }

  console.log(`\nProceso finalizado. Se actualizaron ${updatedCount} registros en la base de datos.`);
  process.exit(0);
}

runUpdate().catch(e => {
  console.error("Error ejecutando el script:", e);
  process.exit(1);
});
