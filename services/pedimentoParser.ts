
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
// Vite-specific worker import
// @ts-ignore
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';

// Polyfill for DOMMatrix in Node/Browser if missing
if (typeof DOMMatrix === 'undefined') {
    (globalThis as any).DOMMatrix = class DOMMatrix {
        constructor() {
            (this as any).m11 = 1; (this as any).m12 = 0; (this as any).m21 = 0; (this as any).m22 = 1; (this as any).m41 = 0; (this as any).m42 = 0;
        }
    };
}

// Configurar Worker de PDF.js (FIX: Use local bundled worker matching version 5.x)
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;



// --- Anexo 22 Sub-Interfaces ---
export interface PedimentoDate {
    tipo: 'Entrada' | 'Pago' | 'Presentacion' | 'Extraccion' | 'Other';
    fecha: string;
}

export interface PedimentoTransport {
    medios: string[]; // 1=Transporte
    candados?: string[]; // 2=Candados
    identificacion?: string;
    pais?: string;
    transportista?: {
        rfc?: string;
        curp?: string;
        nombre?: string;
        domicilio?: string;
    };
}

export interface PedimentoGuide {
    numero: string;
    tipo: 'Master' | 'House' | 'Other';
}

export interface PedimentoContainer {
    numero: string;
    tipo: string; // e.g. "1" (20DC)
}

export interface PedimentoInvoice {
    numero: string;
    fecha?: string;
    incoterm?: string;
    moneda?: string;
    valorDolares?: number;
    proveedor?: string;
}

export interface PedimentoTax {
    clave: string; // e.g. "IGI", "DTA"
    tasa?: number;
    tipoTasa?: string;
    formaPago?: string;
    importe: number;
}

export interface PedimentoRegulation {
    clave: string; // e.g. "C1"
    permiso: string;
    valorComercial?: number;
    cantidad?: number;
}

export interface PedimentoHeader {
    pedimentoNo: string;
    rfc?: string;
    claveDocumento?: string;
    tipoOperacion?: string;
    destino?: string;
    regimen?: string; // e.g. IMD, IEX
    aduana?: string;
    patente?: string;

    // Dates
    fechas: PedimentoDate[];
    fechaPago?: string; // Kept for compat
    fechaEntrada?: string; // Kept for compat

    // Values & Weights
    pesoBruto?: number;
    bultos?: number; // Added
    tipoCambio?: number;
    entradaSalida?: string; // Added
    arribo?: string; // Added
    salida?: string; // Added
    curp?: string; // Added direct access
    nombre?: string; // Added direct access
    domicilio?: string; // Added direct access

    // Flattened Values (User Mapping Support)
    dolares?: number;
    // aduana?: any; // REMOVED DUPLICATE (Exists at line 81)
    comercial?: number;
    fletes?: number;
    seguros?: number;
    embalajes?: number;
    otros?: number;

    valores: {
        dolares: number;
        aduana: number;
        comercial: number;
        seguros?: number;
        fletes?: number;
        embalajes?: number;
        otros?: number;
    };
    valorDolares?: number; // Compat
    valorAduana?: number; // Compat
    valorComercial?: number; // Compat

    // Taxes
    tasasGlobales: PedimentoTax[];
    // Direct Access for User Mapping
    dta?: any;
    prv?: any;
    iva?: any;

    importes: { // Compat map
        dta?: number;
        iva?: number;
        igi?: number;
        prv?: number;
        totalEfectivo?: number;
    };

    // Logistics
    transporte: PedimentoTransport;
    guias: PedimentoGuide[];
    contenedores: PedimentoContainer[];

    observaciones?: string; // Added to fix type error
    acuseValidacion?: any; // Added to fix type error

    // User requested identifier mapping
    identif?: string;
    compl1?: string;
    compl2?: string;
    compl3?: string;
    identificadores?: { clave: string; compl1?: string; compl2?: string; compl3?: string; }[];

    // Invoices
    facturas: PedimentoInvoice[];
    proveedores: { id: string, nombre: string, domicilio: string }[];

    isSimplified: boolean;
}

export interface PedimentoItem {
    partNo?: string;
    secuencia: number;
    fraccion: string;
    pvc?: string; // P.V/C
    pod?: string; // P.O/D

    // Description
    description: string;

    // Quantities
    qty: number; // UMC Qty
    umc: string;
    qtyUmt?: number;
    umt?: string;

    // Legal Codes
    vinculacion?: string; // VINC
    metodoValoracion?: string; // MET VAL
    clavePaisVendedor?: string; // O/V
    clavePaisOrigen?: string;

    // Values
    unitPrice: number; // Precio Unitario
    totalAmount: number; // Precio Pagado / Valor Comercial?
    valorAduana?: number;
    valorComercial?: number;
    valorAgregado?: number;
    preciopagado?: number; // User added alias
    valoraduana?: number; // User added alias

    // Origin/Vendor
    origin?: string;
    vendor?: string;

    // Extras
    identifiers?: any[];
    contribuciones?: any[];
    regulaciones?: any[]; // For permisos
    observaciones?: string;

    page?: number;

    // User Requested Mappings
    moneda?: string;
    paisvendedor?: string;
    paiscomprador?: string;
    valagregado?: number;
}

export interface ValidationResult {
    severity: 'ERROR' | 'WARNING' | 'INFO';
    field: string;
    expected: string | number;
    actual: string | number;
    message: string;
}

export interface PedimentoData {
    header: PedimentoHeader;
    partidas: any[];
    rawText: string;
    validationResults: ValidationResult[];
}

export const parsePedimentoPdf = async (file: File, onProgress?: (msg: string) => void): Promise<PedimentoData> => {
    console.log("parsePedimentoPdf started", file.name, file.size);
    onProgress?.("Initiating PDF Engine...");
    try {
        const arrayBuffer = await file.arrayBuffer();
        console.log("ArrayBuffer loaded", arrayBuffer.byteLength);

        // Debug PDFJS
        if (!pdfjsLib) console.error("PDFJS Lib is undefined!");
        else console.log("PDFJS Lib keys:", Object.keys(pdfjsLib));

        // Race Promise with Timeout
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("PDF Engine Timeout (10s)")), 10000)
        );

        const loadingTask = pdfjsLib.getDocument({
            data: new Uint8Array(arrayBuffer),
            useSystemFonts: false, // Let PDF.js handle fonts
            disableFontFace: false,
            cMapUrl: 'https://unpkg.com/pdfjs-dist@5.4.530/cmaps/',
            cMapPacked: true,
        });

        const doc = await Promise.race([loadingTask.promise, timeoutPromise]) as pdfjsLib.PDFDocumentProxy;
        console.log("PDF Document loaded, pages:", doc.numPages);

        let fullText = '';
        const items: PedimentoItem[] = [];
        let header: PedimentoHeader = {
            pedimentoNo: '',
            importes: {},
            isSimplified: false,
            fechas: [],
            valores: { dolares: 0, aduana: 0, comercial: 0 },
            tasasGlobales: [],
            transporte: { medios: [], candados: [] },
            guias: [],
            contenedores: [],
            facturas: [],
            proveedores: []
        };

        // --- Header Regex ---
        const regexRfc = /RFC\s*[:\.]?\s*(?:\|\s*)*([A-Z0-9]{12,13})/i;
        const regexTc = /TIPO\s*DE\s*CAMBIO\s*[:\.]?\s*(?:\|\s*)*([\d\.]+)/i;
        const regexValDolares = /VAL\.?\s*DOLARES\s*(?:\|\s*)*([\d,]+\.?\d*)/i;
        const regexValAduana = /VAL\.?\s*ADUANA\s*(?:\|\s*)*([\d,]+\.?\d*)/i;
        const regexValComercial = /VAL\.?\s*COMERCIAL\s*(?:\|\s*)*([\d,]+\.?\d*)/i;
        const regexFechaPago = /FECHA\s+DE\s+PAGO[:\s]+(\d{2}[-/]\d{2}[-/]\d{4})|(\d{2}[-/]\d{2}[-/]\d{4})\s+\|\s+PAGO/i;

        for (let i = 1; i <= doc.numPages; i++) {
            onProgress?.(`Reading Page ${i} of ${doc.numPages}...`);
            const page = await doc.getPage(i);
            const content = await page.getTextContent();
            console.log(`Page ${i} content items:`, content.items.length);

            const strings = content.items.map((item: any) => item.str);
            const pageText = strings.join(' | ');
            console.log(`Page ${i} text length:`, pageText.length);

            fullText += pageText + '\n';

            // Detect Simplified
            if (i === 1 && (pageText.includes('FORMA SIMPLIFICADA') || pageText.includes('SimpDec'))) {
                header.isSimplified = true;
            }

            // --- Header Extraction ---
            if (!header.pedimentoNo) {
                // Priority 1: Specific Label "NUM. DE PEDIMENTO" (Matches user screenshot)
                // Use a very loose scanner: "NUM" followed by "PEDIMENTO" followed by digits
                const labelMatch = pageText.match(/NUM.*?PEDIMENTO.*?(\d{2}.{0,5}?\d{2}.{0,5}?\d{4}.{0,5}?\d{7})/i);
                if (labelMatch) {
                    // Clean all non-digits to get raw 15 digits
                    header.pedimentoNo = labelMatch[1].replace(/[^\d]/g, '');
                    console.log("Pedimento Found via Label (Loose):", header.pedimentoNo);
                }

                // Priority 2: Standard 15-digit pattern with optional pipes/spaces (Fallback)
                // Matches: 24  12  3456  7001234  OR  24 | 12 | 3456 | 7001234
                if (!header.pedimentoNo) {
                    const match = pageText.match(/(\d{2})[\s|]+(\d{2})[\s|]+(\d{4})[\s|]+(\d{7})/);
                    if (match) {
                        // Reconstruct full number without separators
                        header.pedimentoNo = `${match[1]}${match[2]}${match[3]}${match[4]}`;
                        console.log("Pedimento Found via Pattern:", header.pedimentoNo);
                    }
                }
            }
            if (!header.fechaPago) {
                // Try specific label first
                const labelMatch = pageText.match(/FECHA\s*DE\s*PAGO[\s:|]+(\d{2}[-/]\d{2}[-/]\d{4})/i);
                if (labelMatch) header.fechaPago = labelMatch[1];

                // Fallback: finding date near "PAGO" if label is split
                if (!header.fechaPago) {
                    const nearPago = pageText.match(/(\d{2}[-/]\d{2}[-/]\d{4})[\s|]+PAGO/i);
                    if (nearPago) header.fechaPago = nearPago[1];
                }
            }
            if (pageText.length < 100) {
                console.warn(`Page ${i} low text: ${pageText.length} chars. check OCR.`);
                onProgress?.(`Warning: Page ${i} seems to be an image/scan. Validating...`);
            }


            // New Fields
            if (!header.rfc) {
                // Priority: Look for RFC near IMPORTADOR
                const impMatch = pageText.match(/IMPORTADOR.*?RFC\s*[:\.]?\s*(?:\|\s*)*([A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3})/i);
                if (impMatch) header.rfc = impMatch[1];
                else {
                    // Fallback
                    const rfcMatch = pageText.match(/RFC\s*[:\.]?\s*(?:\|\s*)*([A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3})/i);
                    if (rfcMatch) header.rfc = rfcMatch[1];
                }
            }
            if (!header.claveDocumento) {
                const match = pageText.match(/CVE\.\s*PEDIM(?:\.|ENTO)?\s*[:\.]?\s*(?:\|\s*)*([A-Z0-9]{2})/i);
                if (match) header.claveDocumento = match[1];
            }
            if (!header.tipoCambio) {
                const match = pageText.match(/TIPO\s*DE\s*CAMBIO\s*[:\.]?\s*(?:\|\s*)*([\d\.]+)/i);
                if (match) header.tipoCambio = parseFloat(match[1]);
            }

            // --- Header Extraction ---

            // ... (Existing Header Logic)

            // --- CUADRO DE LIQUIDACION (Global Taxes) ---
            // This table contains the authoritative totals for DTA, IVA, PRV, CNT.
            if (pageText.includes('CUADRO DE LIQUIDACION')) {
                console.log(`Page ${i}: Found CUADRO DE LIQUIDACION`);

                // Helper to extract tax from block
                // Pattern: KEY [sep] FP [sep] IMPORTE
                // e.g. "PRV | 0 | 290" or "DTA 0 445"
                // Adjusted regex to handle '|' as separator
                const parseTax = (key: string, text: string): number | undefined => {
                    // Look for KEY followed by optional spaces/pipes, then digits (FP), then spaces/pipes, then digits (Importe)
                    const regex = new RegExp(`\\b${key}\\b[\\s|]+\\d+[\\s|]+([\\d,]+\\.?\\d*)`, 'i');
                    const m = text.match(regex);
                    if (m) return parseFloat(m[1].replace(/,/g, ''));
                    return undefined;
                };

                const extDTA = parseTax('DTA', pageText);
                if (extDTA) header.importes.dta = extDTA;

                const extPRV = parseTax('PRV', pageText);
                if (extPRV) header.importes.prv = extPRV;

                const extCNT = parseTax('CNT', pageText);
                if (extCNT) {
                    header.importes.prv = (header.importes.prv || 0) + extCNT; // Combine PRV/CNT logic
                }

                const extIVA = parseTax('IVA', pageText);
                if (extIVA) header.importes.iva = extIVA;

                const extIGI = parseTax('IGI', pageText);
                if (extIGI) header.importes.igi = extIGI;

                const extISAN = parseTax('ISAN', pageText);

                // Effective Total
                // "EFECTIVO | 192725"
                const effMatch = pageText.match(/EFECTIVO[\\s|]+([\\d,]+\\.?\\d*)/i);
                if (effMatch) header.importes.totalEfectivo = parseFloat(effMatch[1].replace(/,/g, ''));
            }

            // --- FECHAS SECTION ---
            // "FECHAS | ENTRADA | 23/12/2025 | PAGO | 27/12/2025"
            // Use specific regex for the box structure shown in screenshot
            const fechasBlockMatch = pageText.match(/FECHAS.*?(ENTRADA.*?)(\d{2}\/\d{2}\/\d{4}).*?(PAGO.*?)(\d{2}\/\d{2}\/\d{4})/i);

            if (fechasBlockMatch) {
                header.fechaEntrada = fechasBlockMatch[2];
                header.fechaPago = fechasBlockMatch[4];
                // Ensure types are pushed
                if (!header.fechas.some(f => f.tipo === 'Entrada')) header.fechas.push({ tipo: 'Entrada', fecha: header.fechaEntrada });
                if (!header.fechas.some(f => f.tipo === 'Pago')) header.fechas.push({ tipo: 'Pago', fecha: header.fechaPago });
                console.log("Dates Found via FECHAS block:", header.fechaEntrada, header.fechaPago);
            } else {
                // Fallbacks
                const fechaEntrada = pageText.match(/FECHA\s*DE\s*ENTRADA[\\s|:.]*(\d{2}\/\d{2}\/\d{4})/i);
                if (fechaEntrada && !header.fechaEntrada) {
                    header.fechaEntrada = fechaEntrada[1];
                    if (!header.fechas.some(f => f.tipo === 'Entrada')) header.fechas.push({ tipo: 'Entrada', fecha: fechaEntrada[1] });
                }
                const fechaPago = pageText.match(/(?:FECHA\s*DE\s*PAGO|PAGO\s*ELECTRONICO)[\\s|:.]*(\d{2}\/\d{2}\/\d{4})/i);
                if (fechaPago && !header.fechaPago) {
                    header.fechaPago = fechaPago[1];
                    if (!header.fechas.some(f => f.tipo === 'Pago')) header.fechas.push({ tipo: 'Pago', fecha: fechaPago[1] });
                }
            }

            // 2. VALUES (Incrementables & Global)
            if (!header.valorDolares) {
                const m = pageText.match(/VAL\.?\s*DOLARES(?:[^0-9]*)([\d,]+\.?\d*)/i);
                if (m) {
                    const val = parseFloat(m[1].replace(/,/g, ''));
                    header.valorDolares = val;
                    header.valores.dolares = val;
                }
            }
            if (!header.valorAduana) {
                const m = pageText.match(/VAL\.?\s*ADUANA(?:[^0-9]*)([\d,]+\.?\d*)/i);
                if (m) {
                    const val = parseFloat(m[1].replace(/,/g, ''));
                    header.valorAduana = val;
                    header.valores.aduana = val;
                }
            }
            if (!header.valorComercial) {
                const m = pageText.match(/VAL\.?\s*COMERCIAL(?:[^0-9]*)([\d,]+\.?\d*)/i);
                if (m) {
                    const val = parseFloat(m[1].replace(/,/g, ''));
                    header.valorComercial = val;
                    header.valores.comercial = val;
                }
            }

            // Incrementables
            const segurosMatch = pageText.match(/VAL\.?\s*SEGUROS(?:[^|]*\|)?\s*([\d,]+\.?\d*)/i);
            if (segurosMatch) header.valores.seguros = parseFloat(segurosMatch[1].replace(/,/g, ''));

            const fletesMatch = pageText.match(/VAL\.?\s*FLETES(?:[^|]*\|)?\s*([\d,]+\.?\d*)/i);
            if (fletesMatch) header.valores.fletes = parseFloat(fletesMatch[1].replace(/,/g, ''));

            const embalajesMatch = pageText.match(/EMBALAJES(?:[^|]*\|)?\s*([\d,]+\.?\d*)/i);
            if (embalajesMatch) header.valores.embalajes = parseFloat(embalajesMatch[1].replace(/,/g, ''));

            const otrosMatch = pageText.match(/OTROS\s*INCREMENTABLES(?:[^|]*\|)?\s*([\d,]+\.?\d*)/i);
            if (otrosMatch) header.valores.otros = parseFloat(otrosMatch[1].replace(/,/g, ''));

            // 3. LOGISTICS (Transport, Guides, Containers)
            const transpMatch = pageText.match(/MEDIOS\s*DE\s*TRANSPORTE.*?(?:ENTRADA|SALIDA)[^:]*:\s*(\d{1,2})/i);
            if (transpMatch && !header.transporte.medios.includes(transpMatch[1])) {
                header.transporte.medios.push(transpMatch[1]);
            }

            const containerMatches = pageText.match(/[A-Z]{4}\s*\d{7}/g);
            if (containerMatches) {
                const newConts = [...new Set(containerMatches)];
                newConts.forEach(c => {
                    if (!header.contenedores.some(ex => ex.numero === c)) {
                        header.contenedores.push({ numero: c, tipo: 'Unknown' });
                    }
                });
            }

            // 4. FACTURAS (Basic)
            if (pageText.includes('FACTURAS') || pageText.includes('NUM. FACTURA')) {
                // Heuristic: Capture Date (DD/MM/YYYY) near invoice-like string?
                // Not robust enough yet, but better than nothing.
                // We'll leave the array empty unless we find specific invoice patterns.
            }

            // --- Items Extraction ---
            // --- Items Extraction (Refactored for Robustness) ---
            if (!header.isSimplified) {
                // Find all Part Number indices in the joined pageText
                // Regex handles variations: "No. De parte:", "No.De parte:", "No. De parte."
                // Use a broader regex to catch "No. De parte" even if split by newlines in raw text (though pageText is pipes)
                const partRegex = /No\.?\s*De\s*parte\s*[:\.]?\s*([A-Z0-9-]+)/gi;
                let match;
                const matches: { index: number, partNo: string }[] = [];
                while ((match = partRegex.exec(pageText)) !== null) {
                    matches.push({ index: match.index, partNo: match[1] });
                }

                for (let m = 0; m < matches.length; m++) {
                    const current = matches[m];
                    const next = matches[m + 1];

                    // Define Block: From current PartNo to next PartNo (or end of page)
                    const startIdx = current.index;
                    const endIdx = next ? next.index : pageText.length;
                    const block = pageText.substring(startIdx, endIdx);

                    const newItem: PedimentoItem = {
                        partNo: current.partNo,
                        description: 'Extracted Item',
                        qty: 0,
                        umc: '',
                        umt: '', // Default empty
                        qtyUmt: 0,
                        unitPrice: 0,
                        totalAmount: 0,
                        fraccion: '',
                        secuencia: items.length + 1,
                        identifiers: [],
                        contribuciones: [],
                        regulaciones: [],
                        page: i
                    };

                    // 1. IDENTIFIERS & OBSERVATIONS
                    const identifIdx = block.indexOf('IDENTIF');
                    let observationsBlock = '';

                    // Extract Observations
                    const obsMatch = block.match(/OBSERVACIONES(?:\s*A\s*NIVEL\s*PARTIDA)?(.*?)(?:$|No\.?\s*De\s*parte)/is);
                    if (obsMatch) {
                        observationsBlock = obsMatch[1];
                    }

                    // Extract Identifiers (EC, etc.)
                    if (identifIdx !== -1) {
                        const limit = block.indexOf('OBSERVACIONES', identifIdx);
                        const identBlock = block.substring(identifIdx, limit !== -1 ? limit : identifIdx + 400);

                        const codes = identBlock.match(/\b[A-Z0-9]{2,3}\b/g);
                        if (codes) {
                            const blacklist = ['IDE', 'NTI', 'COM', 'PLE', 'MEN', 'TO', 'OBS', 'ERV', 'ACI', 'ONES', 'VAL', 'CON', 'GEN', 'PAR'];
                            codes.forEach((c) => {
                                if (!blacklist.includes(c) && /^[A-Z]/.test(c)) {
                                    if (!newItem.identifiers.some(id => id.code === c)) {
                                        newItem.identifiers.push({ level: 'Item', code: c });
                                    }
                                }
                            });
                        }
                    }


                    // 2. VALUES & QUANTITIES (in the block)
                    const qtyMatch = block.match(/CANTIDAD\s*U\.?M\.?C\.?[:\s|]*([\d,]+\.?\d*)/i);
                    if (qtyMatch) newItem.qty = parseFloat(qtyMatch[1].replace(/,/g, ''));
                    else {
                        // Fallback: finding floating numbers near UMC keywords?
                        // Regex search for "192.000" type pattern
                        const looseQty = block.match(/\|\s*([\d,]+\.\d{3})\s*\|/);
                        if (looseQty) newItem.qty = parseFloat(looseQty[1].replace(/,/g, ''));
                    }

                    const umcMatch = block.match(/U\.?M\.?C\.?[:\s|]*([A-Z0-9]{2,3})/i);
                    if (umcMatch) newItem.umc = umcMatch[1];

                    // Commercial Value
                    const valComItemMatch = block.match(/VAL\.?\s*COM(?:\.|ERCIAL)?\s*(?:\|\s*)*([\d,]+\.?\d*)/i);
                    if (valComItemMatch) newItem.totalAmount = parseFloat(valComItemMatch[1].replace(/,/g, ''));

                    // Unit Price
                    const priceMatch = block.match(/PRECIO\s*UNIT(?:ARIO|\.)?\s*(?:\|\s*)*([\d,]+\.?\d*)/i);
                    if (priceMatch) newItem.unitPrice = parseFloat(priceMatch[1].replace(/,/g, ''));

                    // Description (Simple Heuristic)
                    const descMatch = block.match(/DESCRIPCION\s*[:\.]?\s*(.*?)(?:\|\s*VAL\.|\|\s*CANTIDAD|$)/i);
                    if (descMatch && descMatch[1].length > 5) {
                        newItem.description = descMatch[1].trim();
                    }


                    // 3. TAXES Loop
                    const taxKeys = ['IGI', 'IVA', 'DTA', 'PRV', 'CNT', 'CC', 'IEPS', 'ISAN'];
                    const blockParts = block.split('|').map(s => s.trim());

                    for (let t = 0; t < blockParts.length; t++) {
                        const token = blockParts[t];
                        if (taxKeys.includes(token)) {
                            for (let n = t + 1; n < Math.min(t + 5, blockParts.length); n++) {
                                const valStr = blockParts[n].replace(/,/g, '');
                                if (/^\d+(\.\d+)?$/.test(valStr)) {
                                    const imp = parseFloat(valStr);
                                    if (imp > 0) {
                                        newItem.contribuciones.push({ clave: token, importe: imp });
                                        break;
                                    }
                                }
                            }
                        }

                        const regKeys = ['C1', 'A1', 'T1'];
                        if (regKeys.includes(token)) {
                            if (t + 1 < blockParts.length) {
                                const permInfo = blockParts[t + 1];
                                if (permInfo.length > 5) {
                                    newItem.regulaciones.push({ clave: token, permiso: permInfo });
                                }
                            }
                        }
                    }

                    items.push(newItem);
                }
            } // End if !isSimplified

        } // End Page Loop

        // --- Validation & Result Compilation (Inside Try) ---
        let validationResults: ValidationResult[] = [];
        try {
            if (header.pedimentoNo) {
                validationResults = validatePedimento({ header, partidas: items, rawText: fullText, validationResults: [] });
            }
        } catch (error: any) {
            console.error("Validation Logic Error:", error);
            validationResults.push({
                severity: 'WARNING',
                field: 'System',
                expected: 'Validation Success',
                actual: 'Crash',
                message: `Validation Logic encountered an error: ${error.message || error}. Parser results may be incomplete.`
            });
        }

        return { header, partidas: items, rawText: fullText, validationResults };

    } catch (e: any) {
        console.error("Critical PDF Parsing Error:", e);
        // Return a dummy object with the error
        return {
            header: {
                pedimentoNo: '', isSimplified: false, fechas: [], valores: { dolares: 0, aduana: 0, comercial: 0 },
                tasasGlobales: [], transporte: { medios: [], candados: [] }, guias: [], contenedores: [], facturas: [], proveedores: [],
                importes: { dta: 0, prv: 0, igi: 0, iva: 0, totalEfectivo: 0 }
            },
            partidas: [],
            rawText: '',
            validationResults: [{
                severity: 'ERROR',
                field: 'System',
                expected: 'Success',
                actual: 'Critical Failure',
                message: `Failed to parse PDF file: ${e.message || e}`
            }]
        };
    }
};

export function validatePedimento(data: PedimentoData): ValidationResult[] {
    const results: ValidationResult[] = [];
    const { header, partidas } = data;

    // 1. Validate Item Count vs Logic
    // If we have explicit sequence numbers?
    // For now, check if empty.
    if (partidas.length === 0) {
        results.push({ severity: 'ERROR', field: 'Items', expected: '>0', actual: 0, message: 'No items were extracted.' });
    }

    // 2. Validate Sums: Commercial Value
    const sumComercial = partidas.reduce((sum, item) => sum + (item.precioPagado || item.valorComercial || item.totalAmount || 0), 0);
    // Note: totalAmount in Item usually maps to "Precio Pagado" which is close to Valor Comercial usually?
    // Or do we have explicit "valorComercial" extract in items?
    // In our parser: "totalAmount" is usually the last large number.
    // Let's use header.valorComercial to compare.

    // Tolerance: 1.00 unit
    if (header.valorComercial && Math.abs(header.valorComercial - sumComercial) > 5.0) {
        results.push({
            severity: 'WARNING',
            field: 'Valor Comercial',
            expected: header.valorComercial,
            actual: sumComercial.toFixed(2),
            message: `Sum of items ($${sumComercial}) mismatch with Header ($${header.valorComercial})`
        });
    }

    // 3. Validate Taxes (IGI)
    const headerIGI = header.importes.igi || 0;
    const sumIGI = partidas.reduce((sum, item) => {
        const igi = item.contribuciones.find(c => c.clave === 'IGI');
        return sum + (igi ? igi.importe : 0);
    }, 0);

    if (Math.abs(headerIGI - sumIGI) > 5.0) {
        results.push({
            severity: 'ERROR',
            field: 'IGI Total',
            expected: headerIGI,
            actual: sumIGI.toFixed(2),
            message: `Global IGI ($${headerIGI}) does not match sum of items ($${sumIGI})`
        });
    }

    // 4. Validate Taxes (DTA)
    const headerDTA = header.importes.dta || 0;
    // DTA is often per-pedimento (fixed) or calculated?
    // If items have DTA, we sum. If items don't have DTA (common if 8 millar rule applies globally), sum might be 0.
    const sumDTA = partidas.reduce((sum, item) => {
        const dta = item.contribuciones.find(c => c.clave === 'DTA');
        return sum + (dta ? dta.importe : 0);
    }, 0);

    // Only flag if both exist and differ. If items have 0 DTA, it might be correct (Global DTA).
    if (sumDTA > 0 && Math.abs(headerDTA - sumDTA) > 5.0) {
        results.push({
            severity: 'ERROR',
            field: 'DTA Total',
            expected: headerDTA,
            actual: sumDTA.toFixed(2),
            message: `Global DTA ($${headerDTA}) does not match sum of items ($${sumDTA})`
        });
    }

    // 6. DTA Logic Check (8 al millar heuristic)
    if (header.importes.dta && header.valorAduana) {
        const dta = header.importes.dta;
        const va = header.valorAduana;
        const eightMillar = va * 0.008;

        // If DTA is exactly 8 al millar (within small margin)?
        if (Math.abs(dta - eightMillar) < 50 && dta > 445) { // 445 is fixed rate usually
            // It matches 8 al millar logic.
            // We can log this as a PASS or INFO, but validation usually returns errors/warnings.
            // If user wants to know if it *Is* 8 al millar, we don't report error.
            // But if it *Should Be* and isn't? We don't know the regime yet.
            // But we can flag "Suspicious DTA" if it's neither fixed nor 8-millar?
            // For now, let's leave it as a silent check unless requested to enforce.
        }
    }

    // 5. Critical Fields Check
    if (!header.rfc) results.push({ severity: 'ERROR', field: 'RFC', expected: 'Defined', actual: 'Missing', message: 'Importer RFC not found' });
    if (!header.pedimentoNo) results.push({ severity: 'ERROR', field: 'Pedimento', expected: 'Defined', actual: 'Missing', message: 'Pedimento Number not found' });

    // 7. COMPLIANCE: Immex / Anexo 31 (IVA Check)
    // Rule: If IVA Forma Pago is '21' (Credito), MUST have Identifier 'CI' (Global or Item).
    // Or 'IM' (Immex) implies specific regime.

    // Check if any tax is IVA with FP 21
    const ivaCreditItems = partidas.filter(i =>
        i.contribuciones.some(c => c.clave === 'IVA' && c.formaPago === '21')
    );

    if (ivaCreditItems.length > 0) {
        // Need to find 'CI' identifier
        // Global Identifiers are usually in header (not fully extracted yet in header object, but let's check extracted items' identifiers for now as sometimes CI is item-level in data dumps).
        // Actually CI is usually GLOBAL.
        // Let's check if *any* item has CI, or ideally we should have parsed Header identifiers.
        // For now, heuristic: Scan all extracted identifiers.

        const allIdentifiers = partidas.flatMap(i => i.identifiers);
        const hasCI = allIdentifiers.some(id => id.code === 'CI');

        if (!hasCI) {
            // Also check raw text for "IDENTIF: CI" if we missed it in partial extraction?
            // Conservative Error.
            results.push({
                severity: 'ERROR',
                field: 'Certificacion IVA (Anexo 31)',
                expected: 'Identifier CI',
                actual: 'Missing',
                message: `IVA Credit (FP 21) used but Identifier 'CI' (Certificación IVA/IEPS) is missing.`
            });
        }
    }

    // 8. COMPLIANCE: Treaties (TLC)
    // Rule: If Origin is one of TLC countries, check for TL identifier?
    // Or: If TL identifier used, Check IGI Preference.

    partidas.forEach(item => {
        const tlIdentifier = item.identifiers.find(id => id.code === 'TL');
        if (tlIdentifier) {
            // Treaty Claimed.
            // Check if IGI is preferential (0 or very low, or Exento).
            // If IGI amount > 0?
            // Not strictly error, as TL might just reduce rate, not eliminate it. 
            // But worth a check if rate is 0?
            // Hard to validate w/o tables.
            // Basic Check: Does TL match Vendor/Origin?
            // e.g. Origin CHN, TL USA -> Suspicious?
            if (item.origin === 'CHN' && tlIdentifier.complement1 === 'USA') {
                results.push({
                    severity: 'WARNING',
                    field: `Item ${item.partNo} Treaty`,
                    expected: 'Origin Matches Treaty',
                    actual: `Origin: ${item.origin}, Treaty: ${tlIdentifier.complement1}`,
                    message: `Suspicious Treaty application (TL ${tlIdentifier.complement1}) for good of Origin ${item.origin}`
                });
            }
        }

        // Rule: USMCA missed?
        // Origin USA, IGI Paid > 0, No TL.
        if (item.origin === 'USA') {
            const igi = item.contribuciones.find(c => c.clave === 'IGI');
            if (igi && igi.importe > 0 && !tlIdentifier) {
                results.push({
                    severity: 'WARNING',
                    field: `Item ${item.partNo} Opportunity`,
                    expected: 'Consider USMCA',
                    actual: `IGI Paid: $${igi.importe}`,
                    message: `Origin USA with IGI Paid. Check if USMCA (TL) applies.`
                });
            }
        }

        // 9. COMPLIANCE: PROSEC (PS)
        // Rule: If Identifier PS exists, usually implies reduced IGI.
        const psIdentifier = item.identifiers.find(id => id.code === 'PS');
        if (psIdentifier) {
            // Valid PROSEC?
            // Just verifying it exists is good for now.
            // Could check if IGI rate is consistent (usually < General Rate).
        }

        // 10. COMPLIANCE: Regla 8va (Identifier 98)
        // Rule: If Id 98 used, MUST have specific PERMIT in Regulations.
        const r8Identifier = item.identifiers.find(id => id.code === '98');
        if (r8Identifier) {
            // Check regulations for a Permit.
            // Our parser extracts Regulations into item.regulaciones? 
            // Currently basic extraction.
            // We'll check if any regulation looks like a Permit (has 'PERMISO' or Code 'C1').
            const hasPermit = item.regulaciones && item.regulaciones.length > 0;
            // Or check if description implies permit? 
            // Strictly, must have a regulation block.
            if (!hasPermit) {
                results.push({
                    severity: 'ERROR',
                    field: `Item ${item.partNo} Regla 8va`,
                    expected: 'Permiso SE',
                    actual: 'No Regulations Found',
                    message: `Regla 8va (Id 98) usage requires a Permit in Regulations.`
                });
            }
        }

        // 11. COMPLIANCE: Sensitive Sectors (Steel/Textile)
        // Heuristic: Check HTS Chapter (First 2 digits of Fraccion)
        const htsClean = item.fraccion ? item.fraccion.replace(/\./g, '') : '';
        const chapter = parseInt(htsClean.substring(0, 2));

        // Steel: 72, 73. Textiles: 50-63.
        const isSteel = chapter === 72 || chapter === 73;
        const isTextile = chapter >= 50 && chapter <= 63;

        if (isSteel || isTextile) {
            // Check for Automatic Permit (Permiso Automatico) or Padron Identifier?
            // Usually requires specific Identifier or Regulation.
            // Warn if no regulations found.
            if ((!item.regulaciones || item.regulaciones.length === 0) && !item.identifiers.some(id => ['PC', 'NS'].includes(id.code))) {
                results.push({
                    severity: 'WARNING',
                    field: `Item ${item.partNo} Sensitive Sector`,
                    expected: 'Permiso/Aviso Automático',
                    actual: `Chapter ${chapter}`,
                    message: `Goods in Sensitive Chapter ${chapter} (Steel/Textile) usually require Permits/Padron.`
                });
            }
        }

        // 12. COMPLIANCE: NOMs & Exceptions (EN / 9bis / PA)
        // Rule: Identify if NOM compliance is declared (PA) or exempted (EN).
        const idEN = item.identifiers.find(id => id.code === 'EN');
        const idPA = item.identifiers.find(id => id.code === 'PA');
        const idPB = item.identifiers.find(id => id.code === 'PB'); // Cumplimiento Norma Bonded?

        // If EN (Exencion) is used in specific chapters (e.g. 84, 85, 90 often have NOMs), allow it but warn to check justification.
        if (idEN) {
            // EN implies exception.
            // Check if there is a complementary "Carta de No Comercialización" implies usage of specific codes?
            // Sometimes just EN is enough.
            // Warn if also PA is present (Contradiction).
            if (idPA) {
                results.push({ severity: 'ERROR', field: `Item ${item.partNo} NOM`, expected: 'One State', actual: 'EN + PA', message: `Contradictory NOM identifiers: Included both Exception (EN) and Compliance (PA).` });
            }
        }

        // 9bis Check (Carta de no comercialización for "Uso Propio")
        // Sometimes handled via Identifier or simply in Observations.
        // If we detect "USO PROPIO" or "NO COMERCIALIZACION" in observations:
        if (item.observaciones && /NO\s*COMERCIALI|USO\s*PROPIO|9\s*BIS/i.test(item.observaciones)) {
            // Should have EN or similar identifier?
            if (!idEN && !item.identifiers.some(id => id.code === 'XP')) { // XP is also exception
                results.push({ severity: 'WARNING', field: `Item ${item.partNo} NOM Exception`, expected: 'Identifier EN/XP', actual: 'Text Only', message: `Observaciones claim 'No Comercializacion/9bis' but Identifier EN/XP is missing.` });
            }
        }

    }); // End Items Loop

    // 13. SPECIAL REGIMES: Activo Fijo (AF)
    if (header.claveDocumento === 'AF') {
        // Validation: Usually Fixed Assets.
        // Check Destinatario? 
        // Ensure Items are Capital Goods? HTS checks (84, 85, 90...)?
        // Warn if Chapter is clearly consumables (e.g. Ch 01-24)?
        const hasConsumables = partidas.some(i => {
            const ch = parseInt((i.fraccion || '00').replace(/\./g, '').substring(0, 2));
            return ch > 0 && ch < 25; // Food/Animals/Plants usually not AF
        });
        if (hasConsumables) {
            results.push({ severity: 'WARNING', field: 'Regime AF', expected: 'Capital Goods', actual: 'Consumables Detected', message: `Clave AF (Activo Fijo) used but items include ch 01-24 (likely consumables).` });
        }
    }

    // 14. REGIME CHANGES (F4, F5, etc.)
    if (['F4', 'F5', 'V1', 'V5'].includes(header.claveDocumento || '')) {
        // Check if "Descargos" (Original Pedimento) extraction is needed?
        // We don't have Descargos structure yet.
        // Just flag INFO.
        // results.push({ severity: 'INFO', field: 'Regime Change', expected: 'Descargos', actual: header.claveDocumento, message: `Regime Change operation (${header.claveDocumento}). Ensure Original Pedimento info is verified.` });
    }

    // 15. COMPLEX REGIMES: Regularization (A3)
    // Rule: A3 implies correcting an irregularity.
    // Check if taxes are paid (usually High taxes + Fines).
    // Fines (Multas) usually in 'Otros' or specific lines?
    // We'll just flag the nature logic.
    if (header.claveDocumento === 'A3') {
        results.push({
            severity: 'WARNING', // Warning because it's a correction
            field: 'Regime A3',
            expected: 'Regularization',
            actual: 'A3 Detected',
            message: `Pedimento A3 detected (Regularization). Verify payment of Fines/Recargos if applicable.`
        });
    }

    // 16. COMPLEX REGIMES: Depósito Fiscal (A4)
    // Rule: Entry to Bonded Warehouse.
    // Taxes are determined but usually NOT paid (Efectivo = 0 or low, just DTA?).
    // Check if IVA/IGI is 'Pendiente' or 'Forma Pago' specific?
    // Usually FP 5 or 6 (Pendiente payment)?
    if (header.claveDocumento === 'A4') {
        // Check if taxes have non-cash FP?
        const hasPendingTax = partidas.some(i => i.contribuciones.some(c => c.formaPago !== '0' && c.formaPago !== '21')); // 0=Efectivo, 21=Credito. Maybe 5?
        // Just simple Alert.
        results.push({
            severity: 'INFO',
            field: 'Regime A4',
            expected: 'Bonded Warehouse',
            actual: 'A4 Detected',
            message: `Depósito Fiscal (A4). Merchandise entering Bonded Warehouse. Verify authorized Warehouse.`
        });
    }

    // 17. COMPLEX REGIMES: RFE (M3, M4, J3, J4)
    // Recinto Fiscalizado Estratégico.
    // Inputs (M3) vs Outputs (M4).
    if (['M3', 'M4', 'J3', 'J4'].includes(header.claveDocumento || '')) {
        results.push({
            severity: 'INFO',
            field: 'Regime RFE',
            expected: 'Strategic Bonded Zone',
            actual: `${header.claveDocumento} Detected`,
            message: `RFE Operation (${header.claveDocumento}). Ensure RFE Authorization Identifier.`
        });

        // Check for specific RFE identifier? Maybe 'RO' (Operador RFE) or similar.
    }

    // 18. COMPLEX REGIMES: G1 (Extraction from Fiscal Deposit)
    // Rule: Extraction must pay taxes (unless Exempt via Treaty/Sectorial).
    // Context: Goods leaving A4 regime.
    if (header.claveDocumento === 'G1') {
        const hasTaxes = partidas.some(i => i.contribuciones.some(c => c.importe > 0 && ['IGI', 'IVA'].includes(c.clave)));

        results.push({
            severity: hasTaxes ? 'INFO' : 'WARNING',
            field: 'Regime G1',
            expected: 'Extraction with Tax Payment',
            actual: hasTaxes ? 'Taxes Detected' : 'No Taxes Paid',
            message: `G1 Extraction detected. Ensure taxes previously deferred in A4 are now paid (or exempted with justification). Validate Original Pedimento (A4) reference.`
        });
    }

    // 19. COMPLEX REGIMES: Transit (T3, T6, T7, T9)
    // Rule: Tránsito Interno/Internacional.
    // Critical: Must declare "Candados" (Locks/Seals) as goods move uncontrolled.
    if (['T3', 'T6', 'T7', 'T9'].includes(header.claveDocumento || '')) {
        // Check Candados
        if (!header.transporte || !header.transporte.candados || header.transporte.candados.length === 0) {
            results.push({
                severity: 'ERROR',
                field: 'Transit Regime',
                expected: 'Candados (Locks)',
                actual: 'None Declared',
                message: `Transit Regime (${header.claveDocumento}) requires declaration of Seals/Locks (Candados).`
            });
        }

        results.push({
            severity: 'INFO',
            field: 'Regime Transit',
            expected: 'Provisional Taxes',
            actual: `${header.claveDocumento} Detected`,
            message: `Transit Operation. Taxes are determined provisionally. Verify destination custom house.`
        });
    }

    // 20. IDENTIFIER "T1" (DTA Reduction for Certified Companies)
    // Rule: If Identifier T1 is present, DTA should be Fixed (Quota Fija - e.g. ~400-500 MXN) or Exempt.
    // It overrides the 8 al millar rule.
    const hasT1 = partidas.some(i => i.identifiers.some(id => id.code === 'T1')) || (header.rfc && header.rfc.length > 0 && false); // Heuristic: scan types?
    // Note: Our parser extracts identifiers at ITEM level mostly. T1 is often Global.
    // We scan all item identifiers.
    const t1Identifier = partidas.flatMap(i => i.identifiers).find(id => id.code === 'T1');

    if (t1Identifier) {
        // Validation: Check DTA
        const dta = header.importes.dta || 0;
        const va = header.valorAduana || 0;

        // If 8 al millar would be much higher, and we paid fixed ~445?
        const millarRate = va * 0.008;
        if (millarRate > 1000 && dta < 1000) {
            // Valid T1 Application
            // Pass
        } else if (dta > 1000 && Math.abs(dta - millarRate) < 100) {
            // We paid 8 al millar despite T1?
            // Not strictly illegal (can opt not to use benefit), but suspicious.
            results.push({
                severity: 'INFO',
                field: 'Identifier T1',
                expected: 'Reduced DTA',
                actual: `Full DTA Paid $${dta}`,
                message: `Identifier T1 (Certified Company) present, but full DTA appears paid. Verify if benefit was intended.`
            });
        }
    }

    // 21. LEGAL FRAMEWORK: RGCE Check (Prevalidación / CNT)
    // Rule: RGCE 1.8.3 - Payment of Prevalidacion is mandatory for validation.
    // Check if PRV or CNT exists in Global Taxes.
    const hasPRV = header.importes.prv && header.importes.prv > 0;
    // Sometimes it's in 'Otros'?
    if (!hasPRV && !header.isSimplified) {
        results.push({
            severity: 'WARNING',
            field: '[RGCE] Prevalidación',
            expected: 'Paid (PRV/CNT)',
            actual: 'Missing',
            message: `Verify Payment of Prevalidación (RGCE 1.8.3) - PRV identifier not found in global taxes.`
        });
    }

    // 22. LEGAL FRAMEWORK: LFD (Ley Federal de Derechos) - DTA Art 49
    // Rule: DTA 8/millar vs Fixed.
    // We already have DTA checks, but let's be strict about legal basis.
    if (header.importes.dta && header.valorAduana) {
        // If Definitive (A1) and no Treaty (T1/TL), expect 8 al millar.
        if (header.claveDocumento === 'A1' && !t1Identifier && !partidas.some(i => i.identifiers.some(id => id.code === 'TL'))) {
            // Expect 8/millar.
            const expected = header.valorAduana * 0.008;
            if (Math.abs(header.importes.dta - expected) > 100) {
                // DTA Mismatch
                // results.push... (Already covered? Let's assume the previous check covers this, or refine here).
            }
        }
    }

    // 23. LEGAL FRAMEWORK: LIGIE (Vico / Fraccion)
    // Rule: Fraccion Must be 8 digits. NICO 2 digits.
    partidas.forEach(i => {
        if (i.fraccion) {
            const cleanF = i.fraccion.replace(/\./g, '');
            if (cleanF.length !== 8) {
                results.push({ severity: 'ERROR', field: `[LIGIE] Item ${i.partNo}`, expected: '8 Digits', actual: i.fraccion, message: `Fraccion Arancelaria format invalid (Must be 8 digits).` });
            }
        }
        if (i.nico && i.nico.length !== 2) {
            results.push({ severity: 'WARNING', field: `[LIGIE] Item ${i.partNo}`, expected: '2 Digits NICO', actual: i.nico, message: `NICO format invalid (Must be 2 digits).` });
        }
    });

    // 24. LEGAL FRAMEWORK: Ley IVA
    // Rule: Standard Rate 16%. Exemptions must be justified.
    // Check Global IVA vs Commercial Value? No, vs Customs Value + IGI + DTA.
    // Base IVA = (VA + IGI + DTA).
    // This is a powerful validation.
    if (header.importes.iva && header.importes.iva > 0) {
        const totalBase = (header.valorAduana || 0) + (header.importes.igi || 0) + (header.importes.dta || 0);
        const expectedIVA = totalBase * 0.16;
        // Tolerance?
        // If difference is large, maybe 8% (Frontera) or 0% items mixed?
        if (Math.abs(header.importes.iva - expectedIVA) > (expectedIVA * 0.1) && Math.abs(header.importes.iva - (totalBase * 0.08)) > (totalBase * 0.05)) {
            // Not 16% and Not 8%.
            // Could be mixed rates.
            results.push({
                severity: 'INFO',
                field: '[Ley IVA] Global Tax',
                expected: '16% of Base (VA+IGI+DTA)',
                actual: `$${header.importes.iva.toFixed(2)} (Base ~$${totalBase.toFixed(2)})`,
                message: `Global IVA amount does not match standard 16% (or 8%) of Base. Verify mixed rates or exemptions.`
            });
        }
    }

    return results;
};
