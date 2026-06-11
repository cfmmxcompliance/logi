import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, updateDoc, doc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
  authDomain: "logimaster-cfmoto.firebaseapp.com",
  projectId: "logimaster-cfmoto",
  storageBucket: "logimaster-cfmoto.firebasestorage.app",
  messagingSenderId: "924452835722",
  appId: "1:924452835722:web:11a7eedec65ba034dc7873",
  measurementId: "G-01VXE7L5C3"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function fixInaccurateData() {
  try {
    const snap = await getDocs(collection(db, "rule_8ths"));
    let referenceData = null;
    let targetDocId = null;

    snap.forEach(document => {
      const data = document.data();
      // Find a valid record to copy the correct numbers from
      if (data.totalAuthorized === 50417000 && !referenceData) {
        referenceData = data;
      }
      // Find the record I injected with 1000
      if (data.description === "TAPON DEL CINTURON DE SEGURIDAD" && data.totalAuthorized === 1000) {
        targetDocId = document.id;
      }
    });

    if (targetDocId && referenceData) {
      await updateDoc(doc(db, "rule_8ths", targetDocId), {
        totalAuthorized: referenceData.totalAuthorized,
        balance: referenceData.totalAuthorized,
        unidadMedida: referenceData.unidadMedida,
        valorDolares: referenceData.valorDolares
      });
      console.log(`Corregido el documento ${targetDocId} copiando datos de referencia.`);
    } else {
      console.log("No se encontro el documento a corregir o datos de referencia.");
    }

    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

fixInaccurateData();
