import JSZip from 'jszip';
import { GeneralData, DSInvoiceData, DSItemData, PedimentoRecord, DataStageRecordType, DSProcessingStats, RawFileParsed } from '../types.ts';

// Helper to safely parse float
const parseFloatSafe = (val: string): number => {
  if (!val) return 0;
  return parseFloat(val) || 0;
};

// Helper to extract the code from filename (e.g. M12345.501 -> 501, or 501.txt -> 501)
const extractCode = (filename: string): string => {
  let cleanName = filename.replace('.txt', '');
  const match = cleanName.match(/(\d{3})$/);
  if (match) return match[1];
  return cleanName;
};

export const processZipFile = async (file: File): Promise<{ records: PedimentoRecord[], rawFiles: RawFileParsed[], stats: DSProcessingStats }> => {
  const zip = new JSZip();
  const loadedZip = await zip.loadAsync(file);
  
  const tempGeneral: GeneralData[] = [];
  const tempInvoices: DSInvoiceData[] = [];
  const tempItems: DSItemData[] = [];
  
  const rawFiles: RawFileParsed[] = [];

  let filesProcessed = 0;

  // Iterate over files in ZIP
  const filePromises: Promise<void>[] = [];
  
  loadedZip.forEach((relativePath, zipEntry) => {
    if (zipEntry.dir) return;

    const promise = async () => {
      const content = await zipEntry.async('string');
      // Normalize line endings and filter empty lines
      const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
      const fileName = zipEntry.name;
      const fileCode = extractCode(fileName);

      // --- 1. Store Raw Data for the Table View ---
      const matrix = lines.map(line => line.split('|'));
      if (matrix.length > 0) {
        rawFiles.push({
          fileName: fileName,
          code: fileCode,
          rows: matrix
        });
      }

      // --- 2. Business Logic Parsing ---
      
      if (fileCode === DataStageRecordType.HEADER) {
        lines.forEach(line => {
          const cols = line.split('|');
          if (cols.length < 10) return; 
          tempGeneral.push({
            patente: cols[0],
            pedimento: cols[1],
            seccion: cols[2],
            tipoOperacion: cols[3],
            claveDocumento: cols[4],
            rfc: cols[7],
            tipoCambio: parseFloatSafe(cols[9]),
            fletes: parseFloatSafe(cols[10]),
            seguros: parseFloatSafe(cols[11]),
            embalajes: parseFloatSafe(cols[12]),
            otrosIncrementables: parseFloatSafe(cols[13]),
            pesoBruto: parseFloatSafe(cols[15]),
            fechaPago: cols[30] || '',
          });
        });
      } else if (fileCode === DataStageRecordType.INVOICE) {
        lines.forEach(line => {
          const cols = line.split('|');
          if (cols.length < 10) return;
          tempInvoices.push({
            patente: cols[0],
            pedimento: cols[1],
            seccion: cols[2],
            fechaFacturacion: cols[3],
            numeroFactura: cols[4],
            termFacturacion: cols[5],
            moneda: cols[6],
            valorDolares: parseFloatSafe(cols[7]),
            valorMonedaExtranjera: parseFloatSafe(cols[8]),
            proveedor: cols[12],
            proveedorCalle: cols[13],
          });
        });
      } else if (fileCode === DataStageRecordType.ITEM) {
        lines.forEach(line => {
          const cols = line.split('|');
          if (cols.length < 10) return;
          tempItems.push({
            patente: cols[0],
            pedimento: cols[1],
            seccion: cols[2],
            fraccion: cols[3],
            secuencia: cols[4],
            descripcion: cols[6],
            precioUnitario: parseFloatSafe(cols[7]),
            valorAduana: parseFloatSafe(cols[8]),
            valorComercial: parseFloatSafe(cols[9]),
            valorDolares: parseFloatSafe(cols[10]),
            cantidadComercial: parseFloatSafe(cols[11]),
            unidadMedidaComercial: cols[12],
          });
        });
      }

      filesProcessed++;
    };
    filePromises.push(promise());
  });

  await Promise.all(filePromises);

  // Link data for Dashboard
  const pedimentoMap = new Map<string, PedimentoRecord>();

  tempGeneral.forEach(gen => {
    const id = `${gen.patente}-${gen.pedimento}-${gen.seccion}`;
    pedimentoMap.set(id, {
      ...gen,
      id,
      items: [],
      invoices: [],
      totalValueUsd: 0,
    });
  });

  tempInvoices.forEach(inv => {
    const id = `${inv.patente}-${inv.pedimento}-${inv.seccion}`;
    const record = pedimentoMap.get(id);
    if (record) {
      record.invoices.push(inv);
    }
  });

  tempItems.forEach(item => {
    const id = `${item.patente}-${item.pedimento}-${item.seccion}`;
    const record = pedimentoMap.get(id);
    if (record) {
      record.items.push(item);
      record.totalValueUsd += item.valorDolares;
    }
  });

  // Sort raw files by code for better UI
  rawFiles.sort((a, b) => a.code.localeCompare(b.code));

  return {
    records: Array.from(pedimentoMap.values()),
    rawFiles: rawFiles,
    stats: {
      filesProcessed,
      pedimentosCount: tempGeneral.length,
      invoicesCount: tempInvoices.length,
      itemsCount: tempItems.length,
    }
  };
};