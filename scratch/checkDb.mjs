import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

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

async function check() {
    const snap = await getDocs(collection(db, "asignacion_cajas"));
    let found = false;
    snap.forEach(d => {
        const data = d.data();
        if (data.customId === "TL00220260810ARCBMXTL" || data.customId === "TL01320260810ARCBTQLA") {
            console.log("--- FOUND IN ASIGNACION_CAJAS ---");
            console.log("customId:", data.customId);
            console.log("d.id:", d.id);
            console.log("cfmRef:", data.cfmRef);
            console.log("vehiculos:", data.vehiculos);
            found = true;
        }
    });

    if (!found) console.log("Not found in asignacion_cajas!");

    const sellos = await getDocs(collection(db, "sellos"));
    sellos.forEach(d => {
        const data = d.data();
        if (data.selloAsignado === "745916" || data.selloAsignado === "745915" || data.asignacionCajaId === "TL01320260810ARCBTQLA") {
            console.log("--- FOUND IN SELLOS ---");
            console.log("d.id:", d.id);
            console.log("asignacionCajaId:", data.asignacionCajaId);
            console.log("selloAsignado:", data.selloAsignado);
        }
    });
}
check().catch(console.error);
