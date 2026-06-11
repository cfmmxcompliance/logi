import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where } from "firebase/firestore";

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

async function inspect() {
  console.log("Cargando MasterData...");
  const partsSnap = await getDocs(collection(db, "parts"));
  const masterData = [];
  partsSnap.forEach(doc => masterData.push(doc.data()));

  const targetR8 = "1931R826001590";
  const matches = masterData.filter(p => {
    const pR8 = (p.R8 || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
    return pR8 === targetR8;
  });

  console.log(`Encontrados ${matches.length} registros en MasterData con R8 = ${targetR8}`);
  for (const m of matches) {
    console.log(`- Part: ${m.PART_NUMBER} | Desc: [${m.DESCRIPCION_ES}]`);
  }
  process.exit(0);
}

inspect().catch(e => { console.error(e); process.exit(1); });
