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

function getSimilarity(s1, s2) {
  if (!s1 || !s2) return 0;
  s1 = s1.toLowerCase(); s2 = s2.toLowerCase();
  const costs = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) costs[j] = j;
      else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        costs[j - 1] = lastValue; lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return (s1.length - costs[s2.length]) / s1.length;
}

async function runUpdate() {
  console.log("Cargando MasterData (parts)...");
  const partsSnap = await getDocs(collection(db, "parts"));
  const masterData = [];
  partsSnap.forEach(doc => masterData.push(doc.data()));

  console.log("Cargando registros Rule 8th...");
  const r8Snap = await getDocs(collection(db, "rule_8ths"));
  let updatedCount = 0;

  const usedPartNumbers = new Set();

  for (const r8Doc of r8Snap.docs) {
    const rule = r8Doc.data();
    const id = r8Doc.id;

    const r8CleanDesc = (rule.description || '').trim().toUpperCase();
    const r8CleanPermiso = (rule.permisoPrevio || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();

    const candidates = r8CleanPermiso 
        ? masterData.filter(p => 
            (p.R8 || '').replace(/[^A-Z0-9]/gi, '').toUpperCase() === r8CleanPermiso &&
            !usedPartNumbers.has(p.PART_NUMBER)
          )
        : [];

    let permisoMatch = null;
    
    if (candidates.length > 0) {
        const exactMatch = candidates.find(p => (p.DESCRIPCION_ES || '').trim().toUpperCase() === r8CleanDesc);
        
        if (exactMatch) {
            permisoMatch = exactMatch;
        } else {
            let bestMatch = candidates[0];
            let bestScore = -1;
            for (const c of candidates) {
                const score = getSimilarity(r8CleanDesc, (c.DESCRIPCION_ES || '').trim().toUpperCase());
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = c;
                }
            }
            permisoMatch = bestMatch;
        }
    }

    if (permisoMatch && permisoMatch.PART_NUMBER) {
        usedPartNumbers.add(permisoMatch.PART_NUMBER);
    }

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
      console.log(`[UPDATE] ${r8CleanPermiso} -> Match: ${permisoMatch.PART_NUMBER} (${isDescOk ? 'EXACTO' : 'APROXIMADO'})`);
    } else {
      updates = {
        masterdataMatch: 'not_found',
        masterdataPartNumber: null,
        masterdataDescription: null,
        masterdataR8: null,
        masterdataErrors: ['No se encontró en MasterData']
      };
      console.log(`[SKIP] ${r8CleanPermiso} -> No se encontró Permiso Previo.`);
    }

    await updateDoc(doc(db, "rule_8ths", id), updates);
    updatedCount++;
  }
  process.exit(0);
}

runUpdate().catch(e => {
  console.error(e);
  process.exit(1);
});
