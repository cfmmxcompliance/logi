import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

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
  const snap = await getDocs(collection(db, "rule_8ths"));
  snap.forEach(doc => {
    const d = doc.data();
    console.log(`--- ${d.description}`);
    console.log(`  masterdataMatch:       ${d.masterdataMatch}`);
    console.log(`  masterdataPartNumber:  ${d.masterdataPartNumber}`);
    console.log(`  masterdataDescription: ${d.masterdataDescription}`);
    console.log(`  masterdataR8:         ${d.masterdataR8}`);
    console.log(`  masterdataErrors:     ${JSON.stringify(d.masterdataErrors)}`);
    console.log(`  permisoPrevio:        ${d.permisoPrevio}`);
    console.log(`  totalAuthorized:      ${d.totalAuthorized}`);
    console.log(`  unidadMedida:         ${d.unidadMedida}`);
    console.log(`  valorDolares:         ${d.valorDolares}`);
  });
  process.exit(0);
}

inspect().catch(e => { console.error(e); process.exit(1); });
