import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, doc, setDoc } from "firebase/firestore";
import fs from "fs";

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

const SCHEMA_501 = [
    "Patente Aduanal",
    "Número de Pedimento",
    "Sección aduanera despacho",
    "Tipo de operación",
    "Clave de documento",
    "Sección aduanera entrada",
    "CURP contribuyente",
    "RFC",
    "CURP agente aduanal",
    "Tipo de cambio",
    "Total fletes",
    "Total seguros",
    "Total embalajes",
    "Otros incrementables",
    "Otros deducibles",
    "Peso bruto",
    "Medio transporte salida",
    "Medio transporte arribo",
    "Medio transporte entrada o salida",
    "Destino mercancía",
    "Nombre contribuyente",
    "Calle domicilio",
    "Número interior",
    "Número exterior",
    "Código postal",
    "Municipio o Ciudad",
    "Entidad federativa",
    "País domicilio",
    "Tipo pedimento",
    "Fecha Recepción",
    "Fecha pago real"
];

async function runPoC() {
    const filePath = "/Users/alex/Downloads/logimaster (2)/1406426_Solicitudes/1406426_501.asc";
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split(/\r?\n/).filter(l => l.trim() !== "");

    if (lines.length === 0) {
        console.error("File is empty.");
        return;
    }

    // Process the SECOND line (index 1) since index 0 is a header in this file
    const rawLine = lines[1];
    if (!rawLine) {
        console.error("No data line found at index 1.");
        return;
    }
    const cols = rawLine.split("|"); // NO TRIM

    const record = {};
    SCHEMA_501.forEach((name, idx) => {
        const paddedKey = `${String(idx + 1).padStart(2, '0')}${name}`;
        record[paddedKey] = cols[idx] !== undefined ? cols[idx] : "";
    });

    console.log("🚀 Prepared Record for PoC (Zero Metadata):");
    console.log(JSON.stringify(record, null, 2));

    try {
        const testCol = collection(db, "ds999");
        await addDoc(testCol, record);
        console.log("\n✅ Success! PoC record uploaded to 'ds999' collection.");
        console.log("Check the Firebase Console now to verify the visual order (01, 02...).");
    } catch (e) {
        console.error("Upload failed", e);
    }
}

runPoC().then(() => process.exit(0));
