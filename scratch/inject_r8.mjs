import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc } from "firebase/firestore";

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

async function injectMissing() {
  try {
    console.log("Inyectando el registro faltante...");
    await addDoc(collection(db, "rule_8ths"), {
      folio: "0201300100220261931000344-000337",
      partNumber: "PENDIENTE",
      description: "TAPON DEL CINTURON DE SEGURIDAD",
      originalTariffFraction: "8708.29.23",
      fraccionReglaOctava: "9802.00.19",
      permisoPrevio: "1931R826001590",
      totalAuthorized: 1000,
      balance: 1000,
      consumed: 0,
      unidadMedida: "Unidad",
      valorDolares: 0,
      status: "Vigente",
      issueDate: new Date().toISOString(),
      expirationDate: new Date(Date.now() + 31536000000).toISOString(),
      masterdataMatch: "not_found",
      masterdataErrors: ["No se encontró en MasterData"],
      masterdataPartNumber: null,
      masterdataDescription: null,
      masterdataR8: null
    });
    console.log("Registro inyectado exitosamente.");
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

injectMissing();
