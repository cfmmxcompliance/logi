
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
            _description: "Standard Anexo 22 Field Structure"
        });
        console.log(`✅ Applied Valid M3 Schema to: ${colName}`);
    } catch (e) {
        console.error(`❌ Error on ${colName}:`, e.message);
    }
}

async function run() {
    console.log("🚀 Applying COMPREHENSIVE M3 SCHEMAS (Anexo 22 Standards)...");

    const m3Schemas = {
        // --- GLOBAL RECORDS ---
        'ds501': { // Generales
            patente: "STRING (4)", pedimento: "STRING (7)", seccion: "STRING (3)", tipoOperacion: "STRING", claveDocumento: "STRING", rfc: "STRING",
            curp: "STRING", nombre: "STRING", calle: "STRING", numeroExterior: "STRING", numeroInterior: "STRING", colonia: "STRING", codigoPostal: "STRING"
        },
        'ds502': { // Transporte
            patente: "STRING", pedimento: "STRING", seccion: "STRING", rfcTransportista: "STRING", curpTransportista: "STRING", nombreTransportista: "STRING",
            paisTransportista: "STRING", identificadorTransporte: "STRING", paisPlaca: "STRING", numeroPlaca: "STRING"
        },
        'ds503': { // Guias
            patente: "STRING", pedimento: "STRING", seccion: "STRING", numeroGuia: "STRING", tipoGuia: "STRING (M/H)"
        },
        'ds504': { // Contenedores
            patente: "STRING", pedimento: "STRING", seccion: "STRING", numeroContenedor: "STRING", tipoContenedor: "STRING"
        },
        'ds505': { // Facturas
            patente: "STRING", pedimento: "STRING", seccion: "STRING", fechaFacturacion: "DATE", numeroFactura: "STRING", termFacturacion: "STRING",
            moneda: "STRING", valorDolares: 0.0, valorMonedaExtranjera: 0.0, paisFacturacion: "STRING", proveedor: "STRING"
        },
        'ds506': { // Fechas (Standard M3 is 506 for Dates, Parser maps to COVE too, so we include both potential fields)
            patente: "STRING", pedimento: "STRING", seccion: "STRING", tipoFecha: "STRING", fecha: "DATE",
            cove: "STRING (Optional)", numeroFactura: "STRING (Optional)"
        },
        'ds507': { // Identificadores (Global)
            patente: "STRING", pedimento: "STRING", seccion: "STRING", claveCaso: "STRING", complemento1: "STRING", complemento2: "STRING", complemento3: "STRING"
        },
        'ds508': { // Cuentas Aduaneras
            patente: "STRING", pedimento: "STRING", seccion: "STRING", claveInstitucion: "STRING", numeroCuenta: "STRING", folioConstancia: "STRING", fechaConstancia: "DATE", importeTotal: 0.0
        },
        'ds509': { // Tasas (Global)
            patente: "STRING", pedimento: "STRING", seccion: "STRING", claveContribucion: "STRING", tasa: 0.0, tipoTasa: "STRING"
        },
        'ds510': { // Contribuciones (Global - Pagos)
            patente: "STRING", pedimento: "STRING", seccion: "STRING", claveContribucion: "STRING", formaPago: "STRING", importe: 0.0
        },
        'ds511': { // Observaciones (Global)
            patente: "STRING", pedimento: "STRING", seccion: "STRING", observacion: "STRING"
        },
        'ds512': { // Descargos
            patente: "STRING", pedimento: "STRING", seccion: "STRING", patenteOriginal: "STRING", pedimentoOriginal: "STRING", seccionOriginal: "STRING", fechaOriginal: "DATE"
        },
        'ds520': { // Documentos Digitalizados (E-Documents)
            patente: "STRING", pedimento: "STRING", seccion: "STRING", tipoDocumento: "STRING", numeroDocumento: "STRING", rfc: "STRING", eDocument: "STRING"
        },

        // --- ITEM RECORDS ---
        'ds551': { // Partidas
            patente: "STRING", pedimento: "STRING", seccion: "STRING", fraccion: "STRING", secuencia: "STRING", descripcion: "STRING",
            precioUnitario: 0.0, valorAduana: 0.0, valorComercial: 0.0, valorDolares: 0.0, cantidadComercial: 0.0, unidadMedidaComercial: "STRING",
            cantidadTarifa: 0.0, unidadMedidaTarifa: "STRING"
        },
        'ds552': { // Mercancias (Series)
            patente: "STRING", pedimento: "STRING", seccion: "STRING", fraccion: "STRING", secuencia: "STRING", vin: "STRING", kilometraje: "STRING"
        },
        'ds553': { // Permisos
            patente: "STRING", pedimento: "STRING", seccion: "STRING", fraccion: "STRING", secuencia: "STRING", clavePermiso: "STRING", numeroPermiso: "STRING", firmaDescargo: "STRING", valorComercialDolares: 0.0
        },
        'ds554': { // Identificadores (Nivel Partida)
            patente: "STRING", pedimento: "STRING", seccion: "STRING", fraccion: "STRING", secuencia: "STRING", claveCaso: "STRING", complemento1: "STRING", complemento2: "STRING", complemento3: "STRING"
        },
        'ds555': { // Cuentas Aduaneras (Nivel Partida)
            patente: "STRING", pedimento: "STRING", seccion: "STRING", fraccion: "STRING", secuencia: "STRING", claveInstitucion: "STRING", numeroCuenta: "STRING"
        },
        'ds556': { // Tasas (Nivel Partida)
            patente: "STRING", pedimento: "STRING", seccion: "STRING", fraccion: "STRING", secuencia: "STRING", claveContribucion: "STRING", tasa: 0.0, tipoTasa: "STRING"
        },
        'ds557': { // Contribuciones (Nivel Partida - Pagos)
            patente: "STRING", pedimento: "STRING", seccion: "STRING", fraccion: "STRING", secuencia: "STRING", claveContribucion: "STRING", formaPago: "STRING", importe: 0.0
        },
        'ds558': { // Observaciones (Nivel Partida)
            patente: "STRING", pedimento: "STRING", seccion: "STRING", fraccion: "STRING", secuencia: "STRING", observacion: "STRING"
        }
    };

    // 1. Apply Known M3 Schemas
    for (const [col, schema] of Object.entries(m3Schemas)) {
        await createSchemaExample(col, schema);
    }

    // 2. Apply "Smart Generic" Schema to remaining
    // (Ensure Patente/Pedimento/Seccion is always first)
    const ranges = [
        { start: 501, end: 520 },
        { start: 551, end: 560 },
        { start: 701, end: 702 }
    ];

    for (const range of ranges) {
        for (let i = range.start; i <= range.end; i++) {
            const colName = `ds${i}`;
            if (!m3Schemas[colName]) {
                const smartGeneric = {
                    patente: "STRING (Column 0)",
                    pedimento: "STRING (Column 1)",
                    seccion: "STRING (Column 2)",
                    _generic_columns: "Note: This record type is valid but schema is not explicitly mapped yet."
                };
                for (let j = 3; j <= 20; j++) {
                    smartGeneric[`campo_${j}`] = `Column ${j}`;
                }
                await createSchemaExample(colName, smartGeneric);
            }
        }
    }

    console.log("\n✨ Comprehensive Schema Application Complete.");
    process.exit(0);
}

run();
