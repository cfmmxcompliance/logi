
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc } from 'firebase/firestore';

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

async function createSchemaExample(colName, data) {
    try {
        const ref = doc(db, colName, '_schema_example');
        await setDoc(ref, {
            ...data,
            _isSchemaExample: true,
            _description: "Field structure definition for Firebase Console Columns"
        });
        console.log(`✅ Applied schema to: ${colName}`);
    } catch (e) {
        console.error(`❌ Error on ${colName}:`, e.message);
    }
}

async function run() {
    console.log("🚀 Applying COMPLETE SCHEMA to ALL Data Stage Collections (501-600)...");

    // 1. KNOWN SCHEMAS (Defined in parser.ts)
    const knownSchemas = {
        'ds501': { // Header
            patente: "STRING (4)", pedimento: "STRING (7)", seccion: "STRING (3)", tipoOperacion: "STRING (1)", claveDocumento: "STRING (2)", rfc: "STRING",
            tipoCambio: 0.0, fletes: 0.0, seguros: 0.0, embalajes: 0.0, otrosIncrementables: 0.0, pesoBruto: 0.0, fechaEntrada: "DATE", fechaPago: "DATE"
        },
        'ds505': { // Invoice
            patente: "STRING", pedimento: "STRING", seccion: "STRING", fechaFacturacion: "DATE", numeroFactura: "STRING", termFacturacion: "STRING",
            moneda: "STRING", valorDolares: 0.0, valorMonedaExtranjera: 0.0, proveedor: "STRING", proveedorCalle: "STRING"
        },
        'ds551': { // Items
            patente: "STRING", pedimento: "STRING", seccion: "STRING", fraccion: "STRING", secuencia: "STRING", descripcion: "STRING",
            precioUnitario: 0.0, valorAduana: 0.0, valorComercial: 0.0, valorDolares: 0.0, cantidadComercial: 0.0, unidadMedidaComercial: "STRING",
            cantidadTarifa: 0.0, unidadMedidaTarifa: "STRING", paisVendedor: "STRING", paisOrigen: "STRING", nico: "STRING", vinculacion: "STRING", metodoValoracion: "STRING"
        },
        'ds506': { // COVE
            patente: "STRING", pedimento: "STRING", seccion: "STRING", numeroFactura: "STRING", cove: "STRING"
        },
        'ds520': { // Digitalized
            patente: "STRING", pedimento: "STRING", seccion: "STRING", eDocument: "STRING"
        }
    };

    // Apply Known Schemas
    for (const [col, schema] of Object.entries(knownSchemas)) {
        await createSchemaExample(col, schema);
    }

    // 2. DYNAMIC SCHEMAS (ds500 - ds600)
    // For any collection NOT in knownSchemas, apply a generic "Raw Row" schema
    // This ensures that even unknown file types show up with "c0, c1, c2..." columns.

    // Generate generic "c0...c30" object
    const genericSchema = {
        _sourceFile: "filename.txt",
        _rowIndex: 0
    };
    for (let i = 0; i <= 30; i++) {
        genericSchema[`c${i}`] = `Column ${i}`;
    }

    // Loop ranges
    const ranges = [
        { start: 501, end: 520 }, // Main imports
        { start: 551, end: 560 }, // Items/Taxes
        { start: 701, end: 702 }  // Rectifications
    ];

    for (const range of ranges) {
        for (let i = range.start; i <= range.end; i++) {
            const colName = `ds${i}`;
            if (!knownSchemas[colName]) {
                await createSchemaExample(colName, genericSchema);
            }
        }
    }

    console.log("\n✨ System-Wide Schema Application Complete.");
    process.exit(0);
}

run();
