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
  // Taxes (510): Contribuciones del pedimento — col[7]=FechaPagoReal
  const tempTaxes: { key: string; clave: string; importe: number; formaPago: string; fechaPagoReal: string }[] = [];
  // Taxes 702: Diferencias de contribuciones del pedimento — col[7]=FechaPagoReal
  const tempTaxesFianza: { key: string; clave: string; importe: number; formaPago: string; fechaPagoReal: string }[] = [];
  // Taxes 557: Contribuciones de la partida — col[8]=FechaPagoReal
  const tempTaxesPartida: { key: string; clave: string; importe: number; formaPago: string; fechaPagoReal: string }[] = [];
  // ED documents from 507 (ClaveCaso='ED' = CFDI declarados)
  const tempEdCounts = new Map<string, number>(); // pedimentoId -> count
  // Containers from 504 (NumContenedor por pedimento)
  const tempContainerNums = new Map<string, string[]>(); // pedimentoId -> containerNumbers[]
  // 506: Fechas del pedimento — enriquece fechaEntrada/fechaPago del 501
  const tempFechas: { key: string; claveTipo: string; fechaOp: string; fechaPagoReal: string }[] = [];
  // 520: Destinatarios de la mercancía
  const tempDestinatarios: { key: string; idFiscal: string; nombre: string }[] = [];
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
              patente:    (cols[0] || '').trim(),
              pedimento:  (cols[1] || '').trim(),
              seccion:    (cols[2] || '').trim(),
              tipoOperacion: normalizeTipoOperacion(cols[3]),
              claveDocumento: (cols[4] || '').trim(),
              rfc: (cols[7] || '').trim(),
              tipoCambio: parseFloatSafe(cols[9]),
              fletes: parseFloatSafe(cols[10]),
              seguros: parseFloatSafe(cols[11]),
              embalajes: parseFloatSafe(cols[12]),
              otrosIncrementables: parseFloatSafe(cols[13]),
              pesoBruto: parseFloatSafe(cols[15]),
              fechaEntrada: (cols[29] || '').trim(),
              fechaPago: (cols[30] || '').trim(),
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
          // 510: Contribuciones del pedimento (documento oficial SAT abril 2022)
          // Cols: Patente|Pedimento|Seccion|ClaveContribucion|FormaPago|Importe|TipoPedimento|FechaPagoReal
          // col[7] = FechaPagoReal → fecha real del pago de esta contribución específica
          lines.forEach(line => {
            if (line.startsWith('Patente|') || line.startsWith('NUM_PED|')) return;
            const cols = line.split('|');
            if (cols.length < 6) return;
            const key = `${(cols[0]||'').trim()}-${(cols[1]||'').trim()}-${(cols[2]||'').trim()}`;
            const rawClave = (cols[3] || '').trim().toUpperCase();
            const formaPago = (cols[4] || '').trim();
            const importe = parseFloatSafe(cols[5]);
            const fechaPagoReal = (cols[7] || '').trim();
            tempTaxes.push({ key, clave: rawClave, importe, formaPago, fechaPagoReal });
          });
        } else if (fileCode === '702') {
          // 702: Diferencias de contribuciones del pedimento (documento oficial SAT abril 2022)
          // Layout idéntico al 510: Patente|Pedimento|Seccion|ClaveContribucion|FormaPago|Importe|TipoPedimento|FechaPagoReal
          // col[7] = FechaPagoReal → fecha real en que se pagó esta diferencia
          lines.forEach(line => {
            if (line.startsWith('Patente|') || line.startsWith('NUM_PED|')) return;
            const cols = line.split('|');
            if (cols.length < 6) return;
            const key = `${(cols[0]||'').trim()}-${(cols[1]||'').trim()}-${(cols[2]||'').trim()}`;
            const rawClave = (cols[3] || '').trim().toUpperCase();
            const formaPago = (cols[4] || '').trim();
            const importe = parseFloatSafe(cols[5]);
            const fechaPagoReal = (cols[7] || '').trim();
            if (importe > 0) tempTaxesFianza.push({ key, clave: rawClave, importe, formaPago, fechaPagoReal });
          });
        } else if (fileCode === '557') {
          // 557: Contribuciones de la partida (documento oficial SAT abril 2022)
          // Cols: Patente|Pedimento|Seccion|Fraccion|Secuencia|ClaveContribucion|FormaPago|Importe|FechaPagoReal
          // col[8] = FechaPagoReal → fecha real del pago de esta contribución a nivel partida
          lines.forEach(line => {
            if (line.startsWith('Patente|') || line.startsWith('NUM_PED|')) return;
            const cols = line.split('|');
            if (cols.length < 8) return;
            const key = `${(cols[0]||'').trim()}-${(cols[1]||'').trim()}-${(cols[2]||'').trim()}`;
            const rawClave = (cols[5] || '').trim().toUpperCase();
            const formaPago = (cols[6] || '').trim();
            const importe = parseFloatSafe(cols[7]);
            const fechaPagoReal = (cols[8] || '').trim();
            tempTaxesPartida.push({ key, clave: rawClave, importe, formaPago, fechaPagoReal });
          });
        } else if (fileCode === '506') {
          // 506: Fechas del pedimento (ANTES mappeado erróneamente como COVE — BUG CORREGIDO)
          // Cols: Patente|Pedimento|Seccion|ClaveTipoFecha|FechaOperacion|FechaValidacionPagoReal
          // ClaveTipoFecha: ENTRADA, PAGO, EXTRACCION, PRESENTACION, IMP.EUA/CAN, ORIGINAL
          lines.forEach(line => {
            if (line.startsWith('Patente|') || line.startsWith('NUM_PED|')) return;
            const cols = line.split('|');
            if (cols.length < 5) return;
            const key = `${cols[0]}-${cols[1]}-${cols[2]}`;
            tempFechas.push({
              key,
              claveTipo: (cols[3] || '').trim().toUpperCase(),
              fechaOp: (cols[4] || '').trim(),
              fechaPagoReal: (cols[5] || '').trim(),
            });
          });
        } else if (fileCode === '520') {
          // 520: Destinatarios de la mercancía (ANTES mappeado erróneamente como eDigital — BUG CORREGIDO)
          // Cols: Patente|Pedimento|Seccion|IdFiscalDestinatario|NombreDestinatario|Calle|...|Pais|FechaPago
          lines.forEach(line => {
            if (line.startsWith('Patente|') || line.startsWith('NUM_PED|')) return;
            const cols = line.split('|');
            if (cols.length < 5) return;
            const key = `${cols[0]}-${cols[1]}-${cols[2]}`;
            // Solo guardar el primer destinatario por pedimento
            if (!tempDestinatarios.find(d => d.key === key)) {
              tempDestinatarios.push({
                key,
                idFiscal: (cols[3] || '').trim(),
                nombre: (cols[4] || '').trim(),
              });
            }
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
            const numCont = (cols[3] || '').trim();
            if (!numCont) return;
            if (!tempContainerNums.has(key)) tempContainerNums.set(key, []);
            const arr = tempContainerNums.get(key)!;
            if (!arr.includes(numCont)) arr.push(numCont);
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
      destinatario: '',
      destinatarioRfc: '',
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

  // === CRUCE: 504 → 501 (Contenedores) ===
  tempContainerNums.forEach((nums, id) => {
    const record = pedimentoMap.get(id);
    if (record) {
      record.containerNumbers = nums;
      record.containerCount = nums.length;
    }
  });

  // === CRUCE: 507-ED → 501 (CFDIs de Exportación) ===
  tempEdCounts.forEach((count, id) => {
    const record = pedimentoMap.get(id);
    if (record && record.tipoOperacion === 'EXP') {
      record.edDocuments = count;
    }
  });

  // === CRUCE: 506 → 501 (Fechas del pedimento) ===
  // TipoFecha: '1' = FechaEntrada, '2' = FechaPago  (valores numéricos confirmados en ZIPs reales)
  // FechaOperacion (col[4]) = fecha sin hora; FechaValidacionPagoR (col[5]) = timestamp con hora (más preciso)
  tempFechas.forEach(f => {
    const record = pedimentoMap.get(f.key);
    if (!record) return;
    if ((f.claveTipo === '1' || f.claveTipo === 'ENTRADA') && f.fechaOp && !record.fechaEntrada) {
      record.fechaEntrada = f.fechaOp;
    } else if ((f.claveTipo === '2' || f.claveTipo === 'PAGO') && !record.fechaPago) {
      // Preferir FechaValidacionPagoR (más preciso) sobre FechaOperacion
      record.fechaPago = f.fechaPagoReal || f.fechaOp;
    }
  });

  // === CRUCE: 520 → 501 (Destinatarios de la mercancía — BUG CORREGIDO) ===
  tempDestinatarios.forEach(d => {
    const record = pedimentoMap.get(d.key);
    if (record) {
      (record as any).destinatario = d.nombre;
      (record as any).destinatarioRfc = d.idFiscal;
    }
  });

  tempDigitalized.forEach(doc => {
    const id = `${doc.patente}-${doc.pedimento}-${doc.seccion}`;
    const record = pedimentoMap.get(id);
    if (record) {
      record.digitalDocuments.push(doc);
    }
  });

  // Link taxes: accumulate IVA, IGI, DTA, CNT per pedimento
  // Extended clave matching: SAT M3 uses variants across versions
  tempTaxes.forEach(tax => {
    // Only accumulate taxes that were actually paid in Cash (FormaPago 0) or Fianza (FormaPago 22)
    if (tax.formaPago !== '0' && tax.formaPago !== '22') return;

    const record = pedimentoMap.get(tax.key);
    if (!record) return;
    const amt = tax.importe;
    const c = tax.clave;
    // Extended clave matching: SAT M3 uses variants across versions including numeric
    // 6=IGI, 15=PRV, 1=DTA, 23=IVA/PRV, 3=IVA, 2=CNT
    // IGI variants: IGI, DBA (derecho de barco/aeronave), IGI1, IGI2, 6
    if (c === 'IGI' || c === 'DBA' || c.startsWith('IGI') || c === '6') {
      record.igiTotal = (record.igiTotal || 0) + amt;
    // IVA & PRV variants: IVA, PRV, IVA16, RIVA, PIVA, 3 (IVA), 15 (PRV), 23 (IVA/PRV)
    } else if (c === 'IVA' || c === 'PRV' || c === 'IVA16' || c === 'RIVA' || c === 'PIVA' || c.startsWith('IVA') || c === '3' || c === '15' || c === '23') {
      record.ivaPrvTotal = (record.ivaPrvTotal || 0) + amt;
    // DTA variants: DTA, DAN (derecho de almacenaje/no-almacenaje), 1
    } else if (c === 'DTA' || c === 'DAN' || c === '1') {
      record.dtaTotal = (record.dtaTotal || 0) + amt;
    // CNT = Cuota Compensatoria, 2 (NOT 3!)
    } else if (c === 'CNT' || c === '2') {
      record.cntTotal = (record.cntTotal || 0) + amt;
    }
  });

  // Fallback for missing IGI: Many custom broker systems omit IGI from 510.asc if it is not paid in cash,
  // but they DO declare it at the item level in 557.asc. To prevent zero IGI, sum from 557 if 510 has none.
  const uniqueKeys = Array.from(new Set(tempTaxesPartida.map(t => t.key)));
  uniqueKeys.forEach(key => {
    const record = pedimentoMap.get(key);
    if (!record) return;
    if (!record.igiTotal) {
      const myTaxesPartida = tempTaxesPartida.filter(t => t.key === key && (t.formaPago === '0' || t.formaPago === '22'));
      myTaxesPartida.forEach(tax => {
        const c = tax.clave;
        if (c === 'IGI' || c === 'DBA' || c.startsWith('IGI') || c === '6') {
          record.igiTotal = (record.igiTotal || 0) + tax.importe;
        }
      });
    }
  });

  // === PRECOMPUTE monthlyDuties ===
  // Fuente: documento oficial SAT "Consulta Data Stage" abril 2022
  // Regla: cada registro de 510, 702 y 557 tiene su propia FechaPagoReal
  // que define a qué mes pertenece esa contribución.
  // El 501 se usa SOLO para tipoOperacion (IMP/EXP).
  // Fallback: si el registro no tiene FechaPagoReal, se usa FechaPagoReal del 501.

  const parseSATDate = (s: string): number => {
    if (!s || !s.trim()) return -1;
    const raw = s.trim().replace(' ', 'T');
    const d = new Date(raw.length > 10 ? raw : raw + 'T12:00:00');
    return isNaN(d.getTime()) ? -1 : d.getMonth();
  };

  const parseSATYear = (s: string): number => {
    if (!s || !s.trim()) return -1;
    const raw = s.trim().replace(' ', 'T');
    const d = new Date(raw.length > 10 ? raw : raw + 'T12:00:00');
    return isNaN(d.getTime()) ? -1 : d.getFullYear();
  };

  const monthlyDutiesAccum = Array.from({length: 12}, () => ({
    igi_imp: 0, iva_imp_efectivo: 0, iva_imp_fianza: 0, dta_imp: 0,
    igi_exp: 0, iva_exp: 0, dta_exp: 0,
    year: new Date().getFullYear(),
  }));

  // Helper: obtener acumulador del mes según FechaPagoReal del registro (con fallback al 501)
  const getAccAndYear = (taxFecha: string, pedKey: string): { acc: typeof monthlyDutiesAccum[0]; month: number } | null => {
    const record = pedimentoMap.get(pedKey);
    // Prioridad: FechaPagoReal del propio registro → FechaPagoReal del 501
    const fechaStr = taxFecha || (record ? (record.fechaPago || record.fechaEntrada) : '');
    const month = parseSATDate(fechaStr);
    if (month < 0 || month > 11) return null;
    const yr = parseSATYear(fechaStr);
    if (yr > 2000) monthlyDutiesAccum[month].year = yr;
    return { acc: monthlyDutiesAccum[month], month };
  };

  // Helper: yield al hilo UI cada N iteraciones para no congelar el browser
  const yieldEvery = async (i: number, n = 5000) => { if (i > 0 && i % n === 0) await new Promise(r => setTimeout(r, 0)); };

  // 510 → Contribuciones del pedimento: usar col[7] FechaPagoReal de cada registro
  for (let i = 0; i < tempTaxes.length; i++) {
    await yieldEvery(i);
    const tax = tempTaxes[i];
    const record = pedimentoMap.get(tax.key);
    if (!record) continue;
    const result = getAccAndYear(tax.fechaPagoReal, tax.key);
    if (!result) continue;
    const { acc } = result;
    const isExp = record.tipoOperacion === 'EXP';
    if (isExp) {
      if (tax.formaPago === '0') {
        if (tax.clave === 'IGI' || tax.clave === 'DBA' || tax.clave === '6') acc.igi_exp += tax.importe;
        else if (tax.clave === 'IVA' || tax.clave === 'PRV' || tax.clave === '15' || tax.clave === '23') acc.iva_exp += tax.importe;
        else if (tax.clave === 'DTA' || tax.clave === 'DAN' || tax.clave === '1') acc.dta_exp += tax.importe;
      }
    } else {
      if (tax.formaPago === '0') {
        if (tax.clave === 'IGI' || tax.clave === 'DBA' || tax.clave === '6') acc.igi_imp += tax.importe;
        else if (tax.clave === 'IVA' || tax.clave === 'PRV' || tax.clave === '15' || tax.clave === '23') acc.iva_imp_efectivo += tax.importe;
        else if (tax.clave === 'DTA' || tax.clave === 'DAN' || tax.clave === '1') acc.dta_imp += tax.importe;
      }
    }
  }

  // 702 → Diferencias del pedimento: usar col[7] FechaPagoReal
  // FormaPago=6 = "Pendiente de pago" (Apéndice 13 Anexo 22 RGCE) → excluir
  for (let i = 0; i < tempTaxesFianza.length; i++) {
    await yieldEvery(i);
    const tax = tempTaxesFianza[i];
    const record = pedimentoMap.get(tax.key);
    if (!record) continue;
    if (tax.formaPago === '6') continue; // Pendiente de pago → excluir
    const result = getAccAndYear(tax.fechaPagoReal, tax.key);
    if (!result) continue;
    const { acc } = result;
    const isExp = record.tipoOperacion === 'EXP';
    if (isExp) {
      if (tax.clave === 'IGI' || tax.clave === 'DBA' || tax.clave === '6') acc.igi_exp += tax.importe;
      else if (tax.clave === 'IVA' || tax.clave === 'PRV' || tax.clave === '15' || tax.clave === '23') acc.iva_exp += tax.importe;
      else if (tax.clave === 'DTA' || tax.clave === 'DAN' || tax.clave === '1') acc.dta_exp += tax.importe;
    } else {
      if (tax.clave === 'IGI' || tax.clave === 'DBA' || tax.clave === '6') acc.igi_imp += tax.importe;
      else if (tax.clave === 'IVA' || tax.clave === 'PRV' || tax.clave === '15' || tax.clave === '23') acc.iva_imp_fianza += tax.importe;
      else if (tax.clave === 'DTA' || tax.clave === 'DAN' || tax.clave === '1') acc.dta_imp += tax.importe;
    }
  }

  // 557 → Contribuciones de la partida: usar col[8] FechaPagoReal
  // Acumula TODOS los tipos (IGI=6, IVA=3, DTA=1) — excluye fp=6 (Pendiente de pago)
  // fp=22 (Garantía IVA/IEPS) → iva_imp_fianza
  for (let i = 0; i < tempTaxesPartida.length; i++) {
    await yieldEvery(i); // yield cada 5000 — evita congelar el browser
    const tax = tempTaxesPartida[i];
    const record = pedimentoMap.get(tax.key);
    if (!record) continue;
    if (tax.formaPago === '6') continue; // Pendiente de pago → excluir
    const result = getAccAndYear(tax.fechaPagoReal, tax.key);
    if (!result) continue;
    const { acc } = result;
    const isExp = record.tipoOperacion === 'EXP';
    const fp = tax.formaPago;
    if (isExp) {
      if (tax.clave === '6' || tax.clave === 'IGI' || tax.clave === 'DBA') acc.igi_exp += tax.importe;
      else if (tax.clave === '3' || tax.clave === 'IVA' || tax.clave === 'PRV') acc.iva_exp += tax.importe;
      else if (tax.clave === '1' || tax.clave === 'DTA' || tax.clave === 'DAN') acc.dta_exp += tax.importe;
    } else {
      if (tax.clave === '6' || tax.clave === 'IGI' || tax.clave === 'DBA') acc.igi_imp += tax.importe;
      else if (tax.clave === '3' || tax.clave === 'IVA' || tax.clave === 'PRV') {
        if (fp === '22') acc.iva_imp_fianza += tax.importe;
        else             acc.iva_imp_efectivo += tax.importe;
      }
      else if (tax.clave === '1' || tax.clave === 'DTA' || tax.clave === 'DAN') acc.dta_imp += tax.importe;
    }
  }

  // Sort raw files by code for better UI
  rawFiles.sort((a, b) => a.code.localeCompare(b.code));

  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const reviewsByMonth: MonthlyRevisionData[] = MONTHS_SHORT.map((name, i) => ({
    name,
    Import: monthRevisions[i].imp,
    Export: monthRevisions[i].exp,
  }));

  const monthlyDuties = MONTHS_SHORT.map((name, i) => ({
    year: monthlyDutiesAccum[i].year,
    name,
    'IGI Import': parseFloat(monthlyDutiesAccum[i].igi_imp.toFixed(1)),
    'IVA Import': parseFloat((monthlyDutiesAccum[i].iva_imp_efectivo + monthlyDutiesAccum[i].iva_imp_fianza).toFixed(1)),
    'IVA Import Efectivo': parseFloat(monthlyDutiesAccum[i].iva_imp_efectivo.toFixed(1)),
    'IVA Import Fianza': parseFloat(monthlyDutiesAccum[i].iva_imp_fianza.toFixed(1)),
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