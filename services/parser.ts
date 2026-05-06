import JSZip from 'jszip';
import { GeneralData, DSInvoiceData, DSItemData, PedimentoRecord, DataStageRecordType, DSProcessingStats, RawFileParsed, DSCoveData, DSDigitalizedData } from '../types.ts';

// Monthly revision counts for Dashboard chart
export interface MonthlyRevisionData {
  name: string;
  Import: number;
  Export: number;
}


// Normalize tipoOperacion to canonical 'IMP' | 'EXP' regardless of SAT file version
const normalizeTipoOperacion = (raw: string): string => {
  const v = (raw || '').trim().toUpperCase();
  if (v === '1' || v === 'IMP' || v.startsWith('I')) return 'IMP';
  if (v === '2' || v === 'EXP' || v.startsWith('E')) return 'EXP';
  return raw; // keep original if unknown
};

// Helper to safely parse float
const parseFloatSafe = (val: string): number => {
  if (!val) return 0;
  return parseFloat(val) || 0;
};

const extractCode = (filename: string): string => {
  // Removes standard extensions
  let cleanName = filename.replace(/\.(txt|asc|csv)$/i, '');

  // Try to find 3 digits at the end or after an underscore/dot
  const match = cleanName.match(/[_.](\d{3})$/) || cleanName.match(/^(\d{3})$/);

  if (match) return match[1];

  // Adjusted fallback: if filename is just "501" (without extension logic above)
  if (/^\d{3}$/.test(cleanName)) return cleanName;

  return cleanName;
};

export const processZipFile = async (file: File, onProgress?: (current: number, total: number) => void): Promise<{ records: PedimentoRecord[], rawFiles: RawFileParsed[], stats: DSProcessingStats }> => {
  const zip = new JSZip();
  const loadedZip = await zip.loadAsync(file);

  const tempGeneral: GeneralData[] = [];
  const tempInvoices: DSInvoiceData[] = [];
  const tempItems: DSItemData[] = [];
  const tempCoves: DSCoveData[] = [];
  const tempDigitalized: DSDigitalizedData[] = [];
  // Taxes (510): { key: pedimentoId, clave, importe }
  const tempTaxes: { key: string; clave: string; importe: number }[] = [];
  // ED documents from 507 (ClaveCaso='ED' = CFDI declarados)
  const tempEdCounts = new Map<string, number>(); // pedimentoId -> count
  // Containers from 504 (NumContenedor por pedimento)
  const tempContainerCounts = new Map<string, number>(); // pedimentoId -> count
  // Revisiones: _Sel.asc (semáforo rojo/naranja) + _Inci.asc (reconocimientos)
  // monthRevisions[monthIndex] = { imp: count, exp: count }
  const monthRevisions: { imp: number; exp: number }[] = Array.from({ length: 12 }, () => ({ imp: 0, exp: 0 }));

  const rawFiles: RawFileParsed[] = [];

  let filesProcessed = 0;

  // Iterate over files in ZIP
  // Iterate over files in ZIP with CHUNKING to prevent UI Freeze
  const entries = Object.values(loadedZip.files);
  const CHUNK_SIZE = 5;
  const totalFiles = entries.length;

  for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
    const chunk = entries.slice(i, i + CHUNK_SIZE);

    const chunkPromises = chunk.map(async (zipEntry) => {
      try {
        if (zipEntry.dir) return;

        // CRITICAL: Read as binary and decode as Latin1 (ISO-8859-1)
        const binaryContent = await zipEntry.async('uint8array');
        const decoder = new TextDecoder('iso-8859-1');
        const content = decoder.decode(binaryContent);
        // Normalize line endings and filter empty lines
        const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
        const fileName = zipEntry.name;
        const fileCode = extractCode(fileName);

        // ... (Rest of parsing logic remains same, just ensuring it's wrapped)

        // --- 1. Store Raw Data ---
        const matrix = lines.map(line => line.split('|'));
        if (matrix.length > 0) {
          rawFiles.push({
            fileName: fileName,
            code: fileCode,
            rows: matrix
          });
        }

        // --- 2. Business Logic ---
        if (fileCode === DataStageRecordType.HEADER) {
          lines.forEach(line => {
            if (line.startsWith('Patente|') || line.startsWith('NUM_PED|')) return;
            const cols = line.split('|');
            if (cols.length < 10) return;
            tempGeneral.push({
              patente: cols[0],
              pedimento: cols[1],
              seccion: cols[2],
              tipoOperacion: normalizeTipoOperacion(cols[3]), // normalized: 'IMP' | 'EXP'
              claveDocumento: cols[4],
              rfc: cols[7],
              tipoCambio: parseFloatSafe(cols[9]),
              fletes: parseFloatSafe(cols[10]),
              seguros: parseFloatSafe(cols[11]),
              embalajes: parseFloatSafe(cols[12]),
              otrosIncrementables: parseFloatSafe(cols[13]),
              pesoBruto: parseFloatSafe(cols[15]),
              fechaEntrada: cols[29] || '',
              fechaPago: cols[30] || '',
              isFixedAsset: (cols[4] || '').trim().toUpperCase() === 'AF',
            });
          });
        } else if (fileCode === DataStageRecordType.INVOICE) {
          lines.forEach(line => {
            if (line.startsWith('Patente|') || line.startsWith('NUM_PED|')) return;
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
            if (line.startsWith('Patente|') || line.startsWith('NUM_PED|')) return;
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
              cantidadTarifa: parseFloatSafe(cols[13]) || 0,
              unidadMedidaTarifa: cols[14] || '',
              paisVendedor: '',
              paisOrigen: '',
              nico: '',
              vinculacion: '',
              metodoValoracion: ''
            });
          });
        } else if (fileCode === DataStageRecordType.COVE_ASSOCIATION) {
          lines.forEach(line => {
            if (line.startsWith('Patente|') || line.startsWith('NUM_PED|')) return;
            const cols = line.split('|');
            if (cols.length < 6) return;
            tempCoves.push({
              patente: cols[0],
              pedimento: cols[1],
              seccion: cols[2],
              numeroFactura: cols[4],
              cove: cols[5],
            });
          });
        } else if (fileCode === DataStageRecordType.DIGITALIZED_DOC) {
          lines.forEach(line => {
            if (line.startsWith('Patente|') || line.startsWith('NUM_PED|')) return;
            const cols = line.split('|');
            if (cols.length < 5) return;
            tempDigitalized.push({
              patente: cols[0],
              pedimento: cols[1],
              seccion: cols[2],
              eDocument: cols[4],
            });
          });
        } else if (fileCode === DataStageRecordType.TAXES) {
          // 510: Contribuciones — cols: Patente|Pedimento|Seccion|Clave|Tasa|TipoTasa|FormaPago|Importe
          lines.forEach(line => {
            if (line.startsWith('Patente|') || line.startsWith('NUM_PED|')) return;
            const cols = line.split('|');
            if (cols.length < 8) return;
            const key = `${cols[0]}-${cols[1]}-${cols[2]}`;
            tempTaxes.push({
              key,
              clave: (cols[3] || '').trim().toUpperCase(),
              importe: parseFloatSafe(cols[7]),
            });
          });
        } else if (fileCode === '507') {
          // 507: Casos de pedimento
          // Cols: Patente|Pedimento|Seccion|ClaveCaso|IdentificadorCaso|TipoPedimento|ComplementoCaso|FechaPago
          // ClaveCaso='ED' = Documento Electrónico (CFDI) — cada fila es un CFDI declarado
          lines.forEach(line => {
            if (line.startsWith('Patente|') || line.startsWith('NUM_PED|')) return;
            const cols = line.split('|');
            if (cols.length < 4) return;
            const claveCaso = (cols[3] || '').trim().toUpperCase();
            if (claveCaso !== 'ED') return; // solo CFDIs
            const key = `${cols[0]}-${cols[1]}-${cols[2]}`;
            tempEdCounts.set(key, (tempEdCounts.get(key) || 0) + 1);
          });
        } else if (fileCode === '504') {
          // 504: Contenedores
          // Cols: Patente|Pedimento|Seccion|NumContenedor|TipoContenedor|FechaPagoReal
          // Cada fila = 1 contenedor. Cruce con 501 via pedimentoMap para saber IMP/EXP.
          lines.forEach(line => {
            if (line.startsWith('Patente|') || line.startsWith('NUM_PED|')) return;
            const cols = line.split('|');
            if (cols.length < 4) return;
            const key = `${cols[0]}-${cols[1]}-${cols[2]}`;
            tempContainerCounts.set(key, (tempContainerCounts.get(key) || 0) + 1);
          });
        } else if (fileName.endsWith('_Sel.asc') || fileName.toLowerCase().endsWith('_sel.asc')) {
          // _Sel.asc — Selecciones de reconocimiento
          // Cols: Patente|Pedimento|Seccion|Remesa|NumSel|FechaSeleccion|Hora|SemaforoFiscal|ClaveDoc|TipoOperacion
          // SemaforoFiscal: 1=Verde(desaduanamiento automático), 2=Rojo(reconocimiento físico), 3=Naranja(doc)
          lines.forEach(line => {
            if (line.startsWith('Patente|')) return;
            const cols = line.split('|');
            if (cols.length < 10) return;
            const semaforo = (cols[7] || '').trim();
            // Solo contar selecciones con reconocimiento (rojo=2 o naranja=3)
            if (semaforo !== '2' && semaforo !== '3') return;
            const fechaRaw = (cols[5] || '').trim(); // YYYY-MM-DD
            const month = fechaRaw ? new Date(fechaRaw + 'T12:00:00').getMonth() : -1;
            if (month < 0 || month > 11) return;
            const tipoOper = normalizeTipoOperacion(cols[9] || '');
            if (tipoOper === 'IMP') monthRevisions[month].imp++;
            else if (tipoOper === 'EXP') monthRevisions[month].exp++;
          });
        } else if (fileName.endsWith('_Inci.asc') || fileName.toLowerCase().endsWith('_inci.asc')) {
          // _Inci.asc — Incidencias de reconocimiento
          // Cols: Patente|Pedimento|Seccion|Remesa|NumSel|FechaInicioRec|HoraInicioRec|FechaFinRec|HoraFinRec
          //       |Fraccion|SecuenciaFraccion|ClaveDoc|TipoOperacion|GradoIncidencia|FechaSeleccion
          // GradoIncidencia: C=Con Incidencia, S=Sin Incidencia, A=Advertencia
          lines.forEach(line => {
            if (line.startsWith('Patente|')) return;
            const cols = line.split('|');
            if (cols.length < 14) return;
            const grado = (cols[13] || '').trim().toUpperCase();
            // Solo contar incidencias reales (no "S"in incidencia)
            if (grado !== 'C' && grado !== 'A') return;
            const fechaRaw = (cols[14] || cols[5] || '').trim(); // FechaSeleccion o FechaInicioRec
            const month = fechaRaw ? new Date(fechaRaw + 'T12:00:00').getMonth() : -1;
            if (month < 0 || month > 11) return;
            const tipoOper = normalizeTipoOperacion(cols[12] || '');
            if (tipoOper === 'IMP') monthRevisions[month].imp++;
            else if (tipoOper === 'EXP') monthRevisions[month].exp++;
          });
        }
        filesProcessed++;
      } catch (err: any) {
        throw new Error(`Error procesando archivo '${zipEntry.name}': ${err.message}`);
      }
    });

    await Promise.all(chunkPromises);

    // Update Progress
    if (onProgress) {
      onProgress(Math.min(i + CHUNK_SIZE, totalFiles), totalFiles);
    }

    // Yield to main thread every chunk - Increased delay for stability with binary decoding
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  // Link data for Dashboard
  const pedimentoMap = new Map<string, PedimentoRecord>();

  tempGeneral.forEach(gen => {
    const id = `${gen.patente}-${gen.pedimento}-${gen.seccion}`;
    pedimentoMap.set(id, {
      ...gen,
      id,
      items: [],
      invoices: [],
      coves: [],
      digitalDocuments: [],
      totalValueUsd: 0,
      igiTotal: 0,
      ivaPrvTotal: 0,
      dtaTotal: 0,
      cntTotal: 0,
      edDocuments: 0,
      containerCount: 0,
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
      // Bug Fix: usar valorDolares (USD real del archivo 551) — valorAduana está en MXN ajustado
      // y causaba que el Dashboard mostrara valores inflados por tipo de cambio.
      record.totalValueUsd += item.valorDolares || item.valorAduana;

    }
  });

  tempCoves.forEach(cove => {
    const id = `${cove.patente}-${cove.pedimento}-${cove.seccion}`;
    const record = pedimentoMap.get(id);
    if (record) {
      record.coves.push(cove);
    }
  });

  // === CRUCE EXPLÍCITO: 504 → 501 ===
  // Cada contenedor (504) se asigna al pedimento identificado por Patente|Pedimento|Seccion.
  // La clave IMP/EXP viene del tipoOperacion del pedimento (501).
  tempContainerCounts.forEach((count, id) => {
    const record = pedimentoMap.get(id);
    if (record) record.containerCount = count;
  });

  // === CRUCE EXPLÍCITO: 507-ED → 501 ===
  // Regla: Un CFDI del 507 (ClaveCaso='ED') solo cuenta como factura de EXPORTACIÓN.
  // Validación: el Patente|Pedimento|Seccion del 507 debe existir en 501 Y tener TipoOperacion=2 (EXP).
  // Si el pedimento es tipo 1 (IMP), el ED no se cuenta (no aplica para importaciones).
  tempEdCounts.forEach((count, id) => {
    const record = pedimentoMap.get(id);
    if (record && record.tipoOperacion === 'EXP') {
      record.edDocuments = count;
    }
    // Si record.tipoOperacion === 'IMP' o el pedimento no existe en 501: se descarta.
  });

  tempDigitalized.forEach(doc => {
    const id = `${doc.patente}-${doc.pedimento}-${doc.seccion}`;
    const record = pedimentoMap.get(id);
    if (record) {
      record.digitalDocuments.push(doc);
    }
  });

  // Link taxes: accumulate IVA, IGI, DTA, CNT per pedimento
  tempTaxes.forEach(tax => {
    const record = pedimentoMap.get(tax.key);
    if (!record) return;
    const amt = tax.importe;
    if (tax.clave === 'IGI' || tax.clave === 'DBA') {
      record.igiTotal = (record.igiTotal || 0) + amt;
    } else if (tax.clave === 'IVA' || tax.clave === 'PRV') {
      record.ivaPrvTotal = (record.ivaPrvTotal || 0) + amt;
    } else if (tax.clave === 'DTA') {
      record.dtaTotal = (record.dtaTotal || 0) + amt;
    } else if (tax.clave === 'CNT') {
      record.cntTotal = (record.cntTotal || 0) + amt;
    }
  });

  // === PRECOMPUTE monthlyDuties — cruce 501 (key+tipoOp+fecha) × 510 (key+clave+importe) ===
  // Función robusta de fecha — maneja ISO (YYYY-MM-DD), DD/MM/YYYY, YYYYMMDD
  const parseSATDate = (s: string): number => {
    if (!s || !s.trim()) return -1;
    const raw = s.trim();
    // ISO format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss
    let d = new Date(raw.length > 10 ? raw : raw + 'T12:00:00');
    if (!isNaN(d.getTime())) return d.getMonth();
    // DD/MM/YYYY
    const slash = raw.split('/');
    if (slash.length === 3) {
      d = new Date(`${slash[2]}-${slash[1].padStart(2,'0')}-${slash[0].padStart(2,'0')}T12:00:00`);
      if (!isNaN(d.getTime())) return d.getMonth();
    }
    // YYYYMMDD (8 digits)
    if (/^\d{8}$/.test(raw)) {
      d = new Date(`${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}T12:00:00`);
      if (!isNaN(d.getTime())) return d.getMonth();
    }
    return -1;
  };

  const monthlyDutiesAccum = Array.from({length: 12}, () => ({
    igi_imp: 0, iva_imp: 0, dta_imp: 0,
    igi_exp: 0, iva_exp: 0, dta_exp: 0,
  }));

  // Cross-reference: para cada tax en 510, buscar el pedimento en pedimentoMap (del 501)
  // y obtener tipoOperacion + fecha directamente de la fuente correcta (el 501 row ya parseado)
  tempTaxes.forEach(tax => {
    const record = pedimentoMap.get(tax.key);
    if (!record) return;
    // Intentar fecha de pago primero, luego entrada
    const month = parseSATDate(record.fechaPago) !== -1
      ? parseSATDate(record.fechaPago)
      : parseSATDate(record.fechaEntrada);
    if (month < 0 || month > 11) return;
    const acc = monthlyDutiesAccum[month];
    const isExp = record.tipoOperacion === 'EXP';
    if (isExp) {
      if (tax.clave === 'IGI' || tax.clave === 'DBA') acc.igi_exp += tax.importe;
      else if (tax.clave === 'IVA' || tax.clave === 'PRV') acc.iva_exp += tax.importe;
      else if (tax.clave === 'DTA') acc.dta_exp += tax.importe;
    } else {
      if (tax.clave === 'IGI' || tax.clave === 'DBA') acc.igi_imp += tax.importe;
      else if (tax.clave === 'IVA' || tax.clave === 'PRV') acc.iva_imp += tax.importe;
      else if (tax.clave === 'DTA') acc.dta_imp += tax.importe;
    }
  });

  // Sort raw files by code for better UI
  rawFiles.sort((a, b) => a.code.localeCompare(b.code));

  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const reviewsByMonth: MonthlyRevisionData[] = MONTHS_SHORT.map((name, i) => ({
    name,
    Import: monthRevisions[i].imp,
    Export: monthRevisions[i].exp,
  }));

  const monthlyDuties = MONTHS_SHORT.map((name, i) => ({
    name,
    'IGI Import': parseFloat(monthlyDutiesAccum[i].igi_imp.toFixed(1)),
    'IVA Import': parseFloat(monthlyDutiesAccum[i].iva_imp.toFixed(1)),
    'DTA Import': parseFloat(monthlyDutiesAccum[i].dta_imp.toFixed(1)),
    'IGI Export': parseFloat(monthlyDutiesAccum[i].igi_exp.toFixed(1)),
    'IVA Export': parseFloat(monthlyDutiesAccum[i].iva_exp.toFixed(1)),
    'DTA Export': parseFloat(monthlyDutiesAccum[i].dta_exp.toFixed(1)),
  }));

  return {
    records: Array.from(pedimentoMap.values()),
    rawFiles: rawFiles,
    reviewsByMonth,
    monthlyDuties,
    stats: {
      filesProcessed,
      pedimentosCount: tempGeneral.length,
      invoicesCount: tempInvoices.length,
      itemsCount: tempItems.length,
    }
  };
};