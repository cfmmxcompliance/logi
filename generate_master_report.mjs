import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';
import { createObjectCsvWriter } from 'csv-writer';

// --- CONFIG ---
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

// --- ARGS ---
const args = process.argv.slice(2);
const START_DATE = args[0]; // Format: YYYY-MM-DD
const END_DATE = args[1];   // Format: YYYY-MM-DD

if (!START_DATE || !END_DATE) {
    console.error("❌ Usage: node generate_master_report.mjs <YYYY-MM-DD> <YYYY-MM-DD>");
    process.exit(1);
}

// --- HELPERS ---
const formatDate = (d) => d ? d.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3') : '';

// --- MAIN ---
// --- CONFIG ---
const ALL_COLUMNS = [
    'Pedimento', 'Fechapago', 'Fechaentrada', 'Tipocambio', 'Clave', 'Patente', 'Aduana', 'Seccion',
    'Val.Seguros', 'Seguros', 'Fletes', 'Embalajes', 'Otrosincrementables', 'PRV', 'IVAPRV', 'CNT', 'DTA',
    'Factura', 'Fecha', 'TipocambioFact', 'Claveproveedor', 'Incoterm', 'MonedaFact.', 'FactorMon.Fact.',
    'EDocument', 'Material', 'CantidadUMTarifa', 'UMTarifa', 'CantidadComercial', 'UMComercial',
    'CANTIDADaDESCARGAR', 'UMDescarga', ' ValorEUR ', 'IDENTIFICADORAF', 'Fraccion(+NICO)', 'Paisorigen',
    'EQUIPOOMAT', 'Metodovaloracion', 'Serie', 'PesoGross', 'PesoNeto', 'DescripcionPed', 'Secuencia',
    'V1IMMEXORFC', 'BULTOS', 'TIPOBULTO', 'OBSERVACIONES', 'ORDENDECOMPRA', 'FRACCIONR8', 'PERMISOR8',
    'PARTIDAR8', 'MARCA', 'MODELO'
];

async function generate() {
    console.log(`📊 Generating Master Report for range: ${START_DATE} to ${END_DATE}`);

    // 1. Fetch Headers (ds501) and Filter
    console.log("   Fetching ds501 (Headers)...");
    const snap501 = await getDocs(collection(db, 'ds501'));
    const headers = [];
    const pedimentoSet = new Set();

    snap501.forEach(doc => {
        const d = doc.data();
        let dateStr = d.FechaPagoReal;
        if (!dateStr) return;

        // Normalize date to YYYY-MM-DD for comparison
        // Assuming format in DB is YYYYMMDD or DD/MM/YYYY?
        // Based on previous inspections, it looks like standard strings.
        // Let's assume standard sortable string or YYYYMMDD used in DataStage.
        // Actually, typical DataStage is YYYYMMDD? No, let's treat as string comparison for now
        // effectively YYYYMMDD usually.
        // Let's reformat user input YYYY-MM-DD to YYYYMMDD if needed?
        // Let's assume the DB has raw strings. Most likely "20240101".

        // Date format in DB: "2023-03-06 17:03:02" -> "20230306"
        const compDate = dateStr.substring(0, 10).replace(/-/g, '');
        const s = START_DATE.replace(/-/g, '');
        const e = END_DATE.replace(/-/g, '');

        if (compDate >= s && compDate <= e) {
            headers.push(d);
            pedimentoSet.add(d.Pedimento);
        }
    });

    console.log(`   ✅ Found ${headers.length} headers in range.`);
    if (headers.length === 0) {
        console.log("   ❌ No records found in this range.");
        process.exit(0);
    }

    // 2. Fetch Related Data
    const fetchCollection = async (col) => {
        console.log(`   Fetching ${col}...`);
        const snapshot = await getDocs(collection(db, col));
        const map = new Map();
        snapshot.forEach(doc => {
            const d = doc.data();
            if (pedimentoSet.has(d.Pedimento)) {
                if (!map.has(d.Pedimento)) map.set(d.Pedimento, []);
                map.get(d.Pedimento).push(d);
            }
        });
        return map;
    };

    const [invoicesMap, itemsMap, taxesMap509, taxesMap510, casesMap] = await Promise.all([
        fetchCollection('ds505'),
        fetchCollection('ds551'),
        fetchCollection('ds509'),
        fetchCollection('ds510'),
        fetchCollection('ds507') // Cases/Identificadores
    ]);

    // 3. Assemble Rows
    const rows = [];

    for (const h of headers) {
        const p = h.Pedimento;
        const items = itemsMap.get(p) || [{}];
        const invoices = invoicesMap.get(p) || [{}];
        const taxes509 = taxesMap509.get(p) || [];
        const taxes510 = taxesMap510.get(p) || [];
        const cases = casesMap.get(p) || [];

        // Helper to find tax
        const getTax = (code) => {
            // Try 509 first (tasas nivel pedimento), then 510? Or logic varies.
            // DTA=1, VAT=3, PRV=15/20?
            const t = taxes509.find(x => x.ClaveContribucion == code) || taxes510.find(x => x.ClaveContribucion == code);
            return t ? t.ImportePago : '0';
        };

        const inv = invoices[0] || {};

        // Identify V1 case?
        const v1Case = cases.find(c => c.ClaveCaso === 'V1' || c.IdentificadorCaso === 'V1');
        const v1String = v1Case ? (v1Case.ComplementoCaso || 'V1') : '';

        for (const item of items) {
            const row = {
                // Header (ds501)
                'Pedimento': h.Pedimento,
                'Fechapago': h.FechaPagoReal,
                'Fechaentrada': h.FechaRecepcionPedimento || '',
                'Tipocambio': h.TipoCambio,
                'Clave': h.ClaveDocumento,
                'Patente': h.Patente,
                'Aduana': h.SeccionAduanera ? h.SeccionAduanera.substring(0, 2) : '',
                'Seccion': h.SeccionAduanera ? h.SeccionAduanera.substring(2) : '',
                'Val.Seguros': h.TotalSeguros,
                'Seguros': h.TotalSeguros,
                'Fletes': h.TotalFletes,
                'Embalajes': h.TotalEmbalajes,
                'Otrosincrementables': h.TotalIncrementables,

                // Taxes (ds509/510)
                'PRV': getTax('15'), // PRV usually 15 or 21?
                'IVAPRV': '',
                'CNT': getTax('16'), // CNT usually 16?
                'DTA': getTax('1'),

                // Invoice (ds505)
                'Factura': inv.NumeroFactura,
                'Fecha': inv.FechaFacturacion,
                'TipocambioFact': '', // In 505?
                'Claveproveedor': inv.IndentFiscalProveedor,
                'Incoterm': inv.TerminoFacturacion,
                'MonedaFact.': inv.MonedaFacturacion,
                'FactorMon.Fact.': inv.FactorMonedaFacturacion || '',
                'EDocument': '', // Not found generic

                // Item (ds551)
                'Material': item.DescripcionMercancia,
                'CantidadUMTarifa': item.CantidadUMTarifa,
                'UMTarifa': item.UnidadMedidaTarifa,
                'CantidadComercial': item.CantidadUMComercial,
                'UMComercial': item.UnidadMedidaComercial,
                'CANTIDADaDESCARGAR': item.CantidadUMComercial, // Copy commercial?
                'UMDescarga': item.UnidadMedidaComercial,
                ' ValorEUR ': '',
                'IDENTIFICADORAF': '', // Asset id?
                'Fraccion(+NICO)': item.Fraccion,
                'Paisorigen': item.PaisOrigenDestino,
                'EQUIPOOMAT': '',
                'Metodovaloracion': item.MetodoValorizacion,
                'Serie': '',
                'PesoGross': h.PesoBrutoMercancia, // Global header weight
                'PesoNeto': '', // Not in item standard?
                'DescripcionPed': '', // Helper desc?
                'Secuencia': item.SecuenciaFraccion,
                'V1IMMEXORFC': v1String,
                'BULTOS': h.TotalBultos || '',
                'TIPOBULTO': '',
                'OBSERVACIONES': '',
                'ORDENDECOMPRA': '',
                'FRACCIONR8': '',
                'PERMISOR8': '',
                'PARTIDAR8': '',
                'MARCA': item.MarcaMercanciaProducto,
                'MODELO': item.ModeloMercanciaProducto
            };
            rows.push(row);
        }
    }

    // 4. Write CSV
    console.log(`   Writing ${rows.length} rows to master_report.csv...`);
    const headerConfig = ALL_COLUMNS.map(titulo => ({ id: titulo, title: titulo }));

    const csvWriter = createObjectCsvWriter({
        path: `master_report_${START_DATE}_${END_DATE}.csv`,
        header: headerConfig
    });

    await csvWriter.writeRecords(rows);
    console.log("   ✅ Done.");
    process.exit(0);
}

generate();
