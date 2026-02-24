import { db } from './firebaseConfig';
import { collection, getDocs, query, where } from 'firebase/firestore';

const ALL_COLUMNS = [
    'Pedimento', 'Fechapago', 'Fechaentrada', 'Tipocambio', 'Clave', 'Patente', 'Aduana', 'Seccion',
    'Val.Seguros', 'Seguros', 'Fletes', 'Embalajes', 'Otrosincrementables', 'PRV', 'IVAPRV', 'CNT', 'DTA', 'IVA',
    'Factura', 'Fecha', 'TipocambioFact', 'Claveproveedor', 'Incoterm', 'MonedaFact.', 'FactorMon.Fact.',
    'EDocument', 'Material', 'CantidadUMTarifa', 'UMTarifa', 'CantidadComercial', 'UMComercial',
    'CANTIDADaDESCARGAR', 'UMDescarga', ' ValorEUR ', 'IDENTIFICADORAF', 'Fraccion(+NICO)', 'Paisorigen',
    'EQUIPOOMAT', 'Metodovaloracion', 'Serie', 'PesoGross', 'PesoNeto', 'DescripcionPed', 'Secuencia',
    'V1IMMEXORFC', 'BULTOS', 'TIPOBULTO', 'OBSERVACIONES', 'ORDENDECOMPRA', 'FRACCIONR8', 'PERMISOR8',
    'PARTIDAR8', 'MARCA', 'MODELO'
];

export const generateMasterReport = async (startDate: string, endDate: string) => {
    console.log(`📊 Generating Master Report for range: ${startDate} to ${endDate}`);

    if (!startDate || !endDate) {
        alert("Por favor selecciona un rango de fechas.");
        return;
    }

    try {
        // 1. Fetch Headers (ds501) with Server-Side Filtering
        console.log("   Fetching ds501 (Headers)...");

        // Ensure date format matches DB (YYYY-MM-DD HH:mm:ss vs YYYY-MM-DD)
        // String comparison works: "2026-01-01" <= "2026-01-07..."
        const startStr = `${startDate} 00:00:00`;
        const endStr = `${endDate} 23:59:59`;

        const q = query(
            collection(db, 'ds501'),
            where('FechaPagoReal', '>=', startStr),
            where('FechaPagoReal', '<=', endStr)
        );

        const snap501 = await getDocs(q);
        const headers: any[] = [];
        const pedimentoSet = new Set<string>();

        snap501.forEach(doc => {
            const d = doc.data();
            headers.push(d);
            if (d.Pedimento) pedimentoSet.add(d.Pedimento);
        });

        console.log(`   ✅ Found ${headers.length} headers in range.`);

        if (headers.length === 0) {
            // TRIES Fallback: Maybe format is different? Or field is missing?
            // Let's try fetching by 'fechaPagoReal' (camelCase) just in case?
            // Or just alert.
            alert(`No se encontraron pedimentos entre ${startDate} y ${endDate}. \n(Revisando ${snap501.size} registros)`);
            return;
        }

        // 2. Fetch Related Data (Optimized In-Chunks if needed, but Map is fine for <1000 items)
        // Since we filters headers, we only care about their pedimentos.
        // We can't filter ds551 by Pedimento easily if there are too many (limit 10 'in' clause).
        // Standard approach: Fetch ALL matches? 
        // Logic in script fetched ALL ds551. That is DANGEROUS in browser (20k+ items).
        // Optim: We MUST loop and fetch by batch or use a smart query?
        // Querying ds551 by 'Pedimento' is fast IF indexed.
        // But doing 300 queries is slow.
        // Alternative: Fetch ds551 where _sourceFile matches the headers' source? (Complex)
        // Alternative: Fetch ds551 by Date? It usually has 'FechaPagoReal' too if we propagated it?
        // Yes! nuclear_fix propagated it? 
        // Step 5145: "ds551 does have FechaPagoReal".
        // GREAT! We can filter ds551 by Date too!

        const fetchByDate = async (col: string) => {
            console.log(`   Fetching ${col} by date...`);
            // Some collections might NOT have FechaPagoReal propagated.
            // ds551: Checked, YES.
            // ds505: Invoices? Usually distinct. Might not match exactly.
            // ds509/510: Taxes? Usually linked by Pedimento.

            // FAILSAFE: If connection doesn't have date, we might miss data.
            // But let's try strict date filter on ds551 first.
            const qCol = query(
                collection(db, col),
                where('FechaPagoReal', '>=', startStr),
                where('FechaPagoReal', '<=', endStr)
            );

            try {
                const snap = await getDocs(qCol);
                const map = new Map<string, any[]>();
                snap.forEach(doc => {
                    const d = doc.data();
                    if (d.Pedimento) {
                        if (!map.has(d.Pedimento)) map.set(d.Pedimento, []);
                        map.get(d.Pedimento)?.push(d);
                    }
                });
                return map;
            } catch (e) {
                console.warn(`Collection ${col} might not have FechaPagoReal indexed or field. Defaulting to empty.`);
                return new Map<string, any[]>();
            }
        };

        // For small collections (taxes), fetching all might be ok? 
        // Or we loop headers and fetch?
        // Let's use the script logic: Fetch ALL? 
        // No, script fetched entire collection. Browser will die.
        // Let's TRY to fetch by date for ds551.
        // For taxes (ds509/510), they are small usually? No, taxes are per pedimento.
        // Let's assume user wants speed.

        // STRATEGY: 
        // Fetch ds551 by Date (Fast).
        // Fetch ds505, ds509, ds510 by Date? (Do they have it?)
        // If not, we iterate headers and fire parallel queries (e.g. 10 at a time).

        const itemsMap = await fetchByDate('ds551');

        // Helper for others:
        const fetchByPedimentos = async (col: string, peds: string[]) => {
            // divide in chunks of 10 for 'in' query
            const map = new Map<string, any[]>();
            const chunks = [];
            for (let i = 0; i < peds.length; i += 10) chunks.push(peds.slice(i, i + 10));

            const promises = chunks.map(async chunk => {
                const qC = query(collection(db, col), where('Pedimento', 'in', chunk));
                const s = await getDocs(qC);
                s.forEach(d => {
                    const data = d.data();
                    if (!map.has(data.Pedimento)) map.set(data.Pedimento, []);
                    map.get(data.Pedimento)?.push(data);
                });
            });

            await Promise.all(promises);
            return map;
        };

        const peds = Array.from(pedimentoSet);
        const [invoicesMap, taxesMap509, taxesMap510, casesMap] = await Promise.all([
            fetchByPedimentos('ds505', peds),
            fetchByPedimentos('ds509', peds),
            fetchByPedimentos('ds510', peds),
            fetchByPedimentos('ds507', peds)
        ]);

        // 3. Assemble Rows (Same logic)
        const rows: any[] = [];

        for (const h of headers) {
            const p = h.Pedimento;
            const items = itemsMap.get(p) || [{}]; // If missing items, still show header?
            // If ds551 fetch failed or empty, we might have 0 items.
            // Script logic: "const items = itemsMap.get(p) || [{}];"

            const invoices = invoicesMap.get(p) || [{}];
            const taxes509 = taxesMap509.get(p) || [];
            const taxes510 = taxesMap510.get(p) || [];
            const cases = casesMap.get(p) || [];

            const getTax = (code: string) => {
                const t = taxes509.find(x => x.ClaveContribucion == code) || taxes510.find(x => x.ClaveContribucion == code);
                return t ? t.ImportePago : '0';
            };

            const inv = invoices[0] || {};
            const v1Case = cases.find(c => c.ClaveCaso === 'V1' || c.IdentificadorCaso === 'V1');
            const v1String = v1Case ? (v1Case.ComplementoCaso || 'V1') : '';

            for (const item of items) {
                const row: any = {
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
                    'PRV': getTax('15'),
                    'IVAPRV': '',
                    'CNT': getTax('16'),
                    'DTA': getTax('1'),
                    'IVA': getTax('3'),
                    'Factura': inv.NumeroFactura,
                    'Fecha': inv.FechaFacturacion,
                    'TipocambioFact': '',
                    'Claveproveedor': inv.IndentFiscalProveedor,
                    'Incoterm': inv.TerminoFacturacion,
                    'MonedaFact.': inv.MonedaFacturacion,
                    'FactorMon.Fact.': inv.FactorMonedaFacturacion || '',
                    'EDocument': '',
                    'Material': item.DescripcionMercancia,
                    'CantidadUMTarifa': item.CantidadUMTarifa,
                    'UMTarifa': item.UnidadMedidaTarifa,
                    'CantidadComercial': item.CantidadUMComercial,
                    'UMComercial': item.UnidadMedidaComercial,
                    'CANTIDADaDESCARGAR': item.CantidadUMComercial,
                    'UMDescarga': item.UnidadMedidaComercial,
                    ' ValorEUR ': '',
                    'IDENTIFICADORAF': '',
                    'Fraccion(+NICO)': item.Fraccion,
                    'Paisorigen': item.PaisOrigenDestino,
                    'EQUIPOOMAT': '',
                    'Metodovaloracion': item.MetodoValorizacion,
                    'Serie': '',
                    'PesoGross': h.PesoBrutoMercancia,
                    'PesoNeto': '',
                    'DescripcionPed': '',
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

        // 4. Generate CSV String
        console.log(`   Writing ${rows.length} rows to CSV...`);

        // CSV BOM for Excel
        const BOM = "\uFEFF";
        const csvContent = BOM + [
            ALL_COLUMNS.join(','), // Header
            ...rows.map(row => ALL_COLUMNS.map(col => {
                let val = row[col] || '';
                if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
                    val = `"${val.replace(/"/g, '""')}"`;
                }
                return val;
            }).join(','))
        ].join('\n');

        // 5. Trigger Download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `master_report_${startDate}_${endDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        console.log("   ✅ Download triggered.");

    } catch (error: any) {
        console.error("Master Report Error:", error);
        alert(`Error al generar reporte: ${error.message}`);
    }
};
