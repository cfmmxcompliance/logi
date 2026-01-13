import { GoogleGenAI } from "@google/genai";
import { PedimentoRecord } from '../types.ts';
import { PDFDocument } from 'pdf-lib';
import { PedimentoData as DomainPedimentoData } from './pedimentoParser';

// Senior Frontend Engineer: Use GoogleGenAI with the recommended direct API key access.
const getClient = () => {
  const apiKey = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GEMINI_API_KEY) || process.env.API_KEY;
  if (!apiKey) {
    console.error("CRITICAL: Gemini API Key is missing! Check .env.local and VITE_GEMINI_API_KEY");
    throw new Error("API Key not found");
  }
  return new GoogleGenAI({ apiKey });
};

export interface ExtractedInvoiceItem {
  partNumber: string;
  qty: number;
  unitPrice: number;
  description: string;
}

export interface ExtractedCost {
  description: string;
  amount: number;
  currency: 'USD' | 'MXN' | 'CNY';
  type: 'Freight' | 'Customs' | 'Transport' | 'Handling' | 'Other';
}

export interface ExtractedShippingDoc {
  docType: 'BL' | 'AWB';
  bookingNo: string;
  vesselOrFlight: string;
  etd: string;
  eta: string;
  departurePort: string;
  arrivalPort: string;
  shippingCompany: string;
  containers: {
    containerNo: string;
    size: string;
    seal: string;
    pkgCount?: number;
    pkgType?: string;
    weightKg?: number;
    volumeCbm?: number;
  }[];
  invoiceNo?: string;
  poNumber?: string;
  model?: string;
  expectedContainerCount?: number;
}

// Senior Frontend Engineer: Strict User-Defined Interface (No Interpretations)
interface GeminiRawResponse {
  header: {
    referencia: string;
    numPedimento: string;
    tOper: string;
    cvePedimento: string;
    regimen: string;
    tipoCambio: string; // Keep as string to avoid rounding errors
    pesoBruto: string;
    aduanaES: string;
  };
  importador: {
    rfc: string;
    nombre: string;
    curp?: string;
    domicilio: string;
  };
  proveedor: {
    idFiscal: string;
    nombre: string;
    domicilio: string;
    vinculacion: 'SI' | 'NO';
  };
  valores: {
    valorDolares: string;
    valorAduana: string;
    precioPagado: string;
    seguros: string;
    fletes: string;
    embalajes: string;
    otrosIncrementables: string;
    transporteDecrementables: string; // Added based on "Decrementables" req
    seguroDecrementables: string;
    cargaDecrementables: string;
    descargaDecrementables: string;
    otrosDecrementables: string;
  };
  fechas: {
    entrada: string;
    pago: string;
  };
  tasasNivelPedimento: {
    contribucion: string;
    clave: string;
    tasa: string;
    importe: string;
  }[];
  cuadroLiquidacion: {
    conceptos: {
      concepto: string;
      fp: string;
      importe: string;
    }[];
    efectivo: string;
    otros: string;
    total: string;
  };
  identificadores: {
    clave: string;
    compl1: string;
    compl2?: string;
    compl3?: string;
  }[];
  transporte: {
    identificacion: string;
    pais: string;
    transportista?: any;
    candados?: string[];
    guias?: any[];
  }[];
  contenedores: {
    numero: string;
    tipo: string;
    candados?: string;
  }[];
  facturas: {
    numFactura: string;
    fecha: string;
    incoterm: string;
    monedaFact: string;
    valMonFact: string;
    factorMonFact: string;
    valDolares: string;
  }[];
  observaciones: string; // Global observations block

  partidas: {
    secuencia: number;
    fraccion: string;
    subdivision: string; // Subd/Identif
    vinculacion: string;
    metodoValoracion: string;
    umc: string;
    cantidadUMC: string;
    umt: string | number;
    cantidadUMT: string;
    PVC: string; // Uppercase key from user prompt
    POD: string; // Uppercase key from user prompt
    descripcion: string;
    valores: {
      valorAduanaUSD: string;
      impPrecioPag: string;
      precioUnitario: string;
      valorAgregado: string;
    };
    permisos: {
      clave: string;
      numeroPermiso: string;
      firmaDescargo: string;
      valComDls: string;
      cantidadUMT: string;
    }[];
    identificadores: {
      identif: string;
      compl1: string;
      compl2?: string;
      compl3?: string;
      descargo?: string; // User req
      Valcomdls?: string; // User req
      Cantidadumtc?: string; // User req
    }[];
    observaciones: string; // Observaciones a Nivel Partida
    tasas: {
      clave?: string; // User uses 'clave' instead of implied type sometimes
      tasa: string;
      tipoTasa?: string;
      formaPago?: string;
      importe?: string; // User req
    }[];
  }[];
}

// Helper to clean JSON from markdown blocks
const cleanJson = (text: string) => {
  if (!text) return "{}";

  // 1. Remove Markdown code blocks
  let clean = text.replace(/```json/g, '').replace(/```/g, '').trim();

  // 2. Locate the JSON Object
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');

  if (start !== -1 && end !== -1 && end > start) {
    return clean.substring(start, end + 1);
  }

  return clean || "{}";
};

// Helper Logic: Extracted to avoid circular references and type errors in geminiService
const processRawPedimentoLogic = (rawText: string): DomainPedimentoData => {
  try {
    let cleanText = cleanJson(rawText);
    let extracted: any;
    try {
      extracted = JSON.parse(cleanText);
    } catch (e) {
      console.error("Strict Parse Failed.");
      const snippet = cleanText.length > 50
        ? cleanText.substring(0, 20) + "..." + cleanText.substring(cleanText.length - 20)
        : cleanText;
      throw new Error(`JSON Parse Error: ${(e as Error).message}. Snippet: ${snippet}`);
    }

    if (!extracted || typeof extracted !== 'object') {
      throw new Error("AI returned invalid data structure (not an object).");
    }

    // Dates Helper
    const mapFechas = (f: any): any[] => {
      if (!f) return [];
      const fechas = [];
      if (f.entrada) fechas.push({ tipo: 'Entrada', fecha: f.entrada });
      if (f.pago) fechas.push({ tipo: 'Pago', fecha: f.pago });
      return fechas;
    };

    // Importes Helper (Flatten Cuadro Liquidacion)
    const mapImportes = (liq: any): any => {
      const imp: any = {
        totalEfectivo: typeof liq?.efectivo === 'string' ? parseFloat(liq.efectivo) : (liq?.efectivo || 0),
        dta: 0, prv: 0, igi: 0, iva: 0
      };
      if (liq?.conceptos && Array.isArray(liq.conceptos)) {
        liq.conceptos.forEach((c: any) => {
          if (!c.concepto) return;
          const key = c.concepto.toLowerCase();
          const val = typeof c.importe === 'string' ? parseFloat(c.importe) : (c.importe || 0);
          if (key.includes('dta')) imp.dta = val;
          if (key.includes('prv') || key.includes('cnt')) imp.prv = val;
          if (key.includes('igi')) imp.igi = val;
          if (key.includes('iva')) imp.iva = val;
        });
      }
      return imp;
    };

    return {
      header: {
        pedimentoNo: extracted.header?.numPedimento || "",
        rfc: extracted.importador?.rfc || "",
        claveDocumento: extracted.header?.cvePedimento || "",
        tipoOperacion: extracted.header?.tOper || "",
        regimen: extracted.header?.regimen || "",
        tipoCambio: typeof extracted.header?.tipoCambio === 'string' ? parseFloat(extracted.header.tipoCambio) : extracted.header?.tipoCambio,
        pesoBruto: typeof extracted.header?.pesoBruto === 'string' ? parseFloat(extracted.header.pesoBruto) : extracted.header?.pesoBruto,
        aduana: extracted.header?.aduanaES || "",

        fechas: mapFechas(extracted.fechas),

        valores: {
          dolares: parseFloat(extracted.valores?.valorDolares || "0"),
          aduana: parseFloat(extracted.valores?.valorAduana || "0"),
          comercial: parseFloat(extracted.valores?.precioPagado || "0"),
          seguros: parseFloat(extracted.valores?.seguros || "0"),
          fletes: parseFloat(extracted.valores?.fletes || "0"),
          embalajes: parseFloat(extracted.valores?.embalajes || "0"),
          otros: parseFloat(extracted.valores?.otrosIncrementables || "0")
        },

        tasasGlobales: Array.isArray(extracted.tasasNivelPedimento) ? extracted.tasasNivelPedimento : [],

        importes: mapImportes(extracted.cuadroLiquidacion),

        identificadores: extracted.identificadores || [],

        transporte: {
          medios: [],
          identificacion: extracted.transporte?.[0]?.identificacion || "",
          transportista: extracted.transporte?.[0]?.transportista || {},
          candados: extracted.transporte?.[0]?.candados || [],
        },

        guias: extracted.transporte?.[0]?.guias || [],
        contenedores: extracted.contenedores || [],

        facturas: Array.isArray(extracted.facturas) ? extracted.facturas.map((f: any) => ({
          numero: f.numFactura || "",
          fecha: f.fecha,
          incoterm: f.incoterm,
          moneda: f.monedaFact,
          valorDolares: f.valDolares
        })) : [],

        proveedores: extracted.proveedor ? [extracted.proveedor] : [],

        isSimplified: false
      },
      partidas: Array.isArray(extracted.partidas) ? extracted.partidas.map((p: any) => ({
        secuencia: p.secuencia,
        fraccion: p.fraccion,
        nico: p.subdivision || "",
        description: p.descripcion,
        qty: parseFloat(p.cantidadUMC) || 0, // Ensure number
        umc: String(p.umc || ""),
        qtyUmt: parseFloat(p.cantidadUMT) || 0, // Ensure number
        umt: p.umt !== null && p.umt !== undefined ? String(p.umt) : "", // map to string
        pvc: p.PVC, // Map Strict Upper
        pod: p.POD, // Map Strict Upper
        unitPrice: parseFloat(p.valores?.precioUnitario) || 0,
        totalAmount: parseFloat(p.valores?.impPrecioPag) || 0,
        valorAduana: parseFloat(p.valores?.valorAduanaUSD) || 0,
        valorAgregado: p.valores?.valorAgregado !== null && p.valores?.valorAgregado !== undefined ? parseFloat(p.valores.valorAgregado) : undefined, // Allow undefined/null
        vinculacion: p.vinculacion,
        metodoValoracion: p.metodoValoracion,
        origin: p.POD || "N/A", // Heuristic mapping if origin not explicit
        vendor: p.PVC || "N/A", // Heuristic mapping if vendor not explicit
        identifiers: Array.isArray(p.identificadores) ? p.identificadores.map((id: any) => ({
          code: id.identif,
          complement1: id.compl1,
          descargo: id.descargo,
          valComDls: id.Valcomdls,
          cantidadUmt: id.Cantidadumtc
        })) : [],
        contribuciones: Array.isArray(p.tasas) ? p.tasas.map((t: any) => ({
          clave: t.clave,
          tasa: t.tasa,
          importe: t.importe
        })) : [],
        regulaciones: p.permisos || [], // Keep legacy if needed, or map strictly if user provides Permisos block in future
        observaciones: p.observaciones || "",
        partNo: ""
      })) : [],
      rawText: cleanText,
      validationResults: []
    };
  } catch (error) {
    console.error("Pedimento Parsing Logic Error", error);
    throw error;
  }
};

export const geminiService = {
  // Senior Frontend Engineer: RAW Extraction Mode (No Type coercion)
  // Senior Frontend Engineer: PAGINATED Forensic Extraction (Solves "Page 7 of 11" Truncation)
  async parseInvoiceMaterials(base64Data: string, mimeType: string = 'image/jpeg'): Promise<string> {
    try {
      console.log("Starting Paginated Forensic Extraction...");

      // 1. Load PDF to determine page count
      const pdfBuffer = Uint8Array.from(atob(base64Data) as any, (c: any) => c.charCodeAt(0));
      const pdfDoc = await PDFDocument.load(pdfBuffer);
      const totalPages = pdfDoc.getPageCount();
      console.log(`Document has ${totalPages} pages.`);

      // 2. Define Chunks (2 pages per chunk for maximum detail)
      const CHUNK_SIZE = 2;
      const chunks: { start: number, end: number, base64: string }[] = [];

      for (let i = 0; i < totalPages; i += CHUNK_SIZE) {
        const subDoc = await PDFDocument.create();
        const end = Math.min(i + CHUNK_SIZE, totalPages);
        const pagesToCopy = Array.from({ length: end - i }, (_, k) => i + k);

        const copiedPages = await subDoc.copyPages(pdfDoc, pagesToCopy);
        copiedPages.forEach(page => subDoc.addPage(page));

        const base64Chunk = await subDoc.saveAsBase64();
        chunks.push({ start: i, end: i + CHUNK_SIZE - 1, base64: base64Chunk });
      }

      console.log(`Created ${chunks.length} chunks for forensic analysis.`);

      // 3. Process Chunks in Parallel
      const processChunk = async (chunk: typeof chunks[0], index: number) => {
        const ai = getClient();
        const prompt = `
            FORENSIC EXTRACTION MODE (Pages ${chunk.start + 1}-${chunk.end + 1}).
            
            Extract EVERYTHING from this document section into plain text.
            - Include ALL text, numbers, codes, and identifiers.
            - Include headers, footers, side-notes, and small print.
            - Include any handwritten notes or scribbles if legible.
            - Do NOT summarize or shorten content.
            - Do NOT omit "irrelevant" sections.
            - Preserve the rough visual layout (newlines/spacing) where possible.
            - If you see a table, represent it as text/csv/markdown-table, but INCLUDE ALL ROWS.
            - **OCR TIP**: Pay close attention to Part Numbers. The letter 'Q' in this font often looks like '0' (e.g. 'Q890-...' vs '0890-...'). If there is any visual indication of a tail (Q), transcribe it as 'Q'.
            
            Your goal is a lossless text dump of this specific section.
        `;

        const response = await ai.models.generateContent({
          model: 'gemini-2.0-flash-exp',
          contents: {
            parts: [{ inlineData: { mimeType: 'application/pdf', data: chunk.base64 } }, { text: prompt }]
          },
          config: {
            responseMimeType: 'text/plain',
            safetySettings: [
              { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
            ] as any
          }
        });
        return { index, text: response.text || "" };
      };

      const results = await Promise.all(chunks.map((chunk, idx) => processChunk(chunk, idx)));

      // 4. Concatenate Results in Order
      const fullText = results
        .sort((a, b) => a.index - b.index)
        .map(r => `--- PAGE CHUNK ${r.index + 1} ---\n${r.text}`)
        .join('\n\n');

      console.log("Forensic Extraction Complete. Length:", fullText.length);
      return fullText;

    } catch (error: any) {
      console.error("Forensic Parse Error", error);
      return "Error during paginated extraction. Please check logs.";
    }
  },

  // Senior Frontend Engineer: PHASE 2 - Structured Forensic Analysis (Robust & Strict & Scalable)
  async parseForensicStructure(rawText: string): Promise<any> {
    try {
      console.log("Starting Phase 2: Structural Mapping (Text -> JSON Transformation)...");

      // 1. Split into Chunks if marked
      const chunks = rawText.split(/--- PAGE CHUNK \d+ ---/).map(s => s.trim()).filter(s => s.length > 20);
      console.log(`Phase 2: Detected ${chunks.length} text chunks for structural analysis.`);

      // Helper for Individual Chunk Analysis
      const analyzeChunk = async (chunkText: string, index: number) => {
        const ai = getClient();
        console.log(`Analyzing Chunk ${index + 1}/${chunks.length} (${chunkText.length} chars)...`);

        const isFirstChunk = index === 0;
        const isLastChunk = index === chunks.length - 1;
        const chunkInfo = `Chunk ${index + 1} of ${chunks.length}`;

        const prompt = `
        ACT AS A DATA EXTRACTOR.
        INPUT: Partial text dump from a Mexican Pedimento PDF (${chunkInfo}).
        OUTPUT: A SINGLE valid JSON object matching this structure exactly.
        
        CONTEXT: 
        - This is ${chunkInfo}.
        - Header info is likely ONLY in Chunk 1.
        - Items (Partidas) may be split across chunks.
        ${isLastChunk ? "- THIS IS THE FINAL CHUNK. EXPECT HIGH SEQUENCE NUMBERS (e.g. 40-100). DO NOT RESTART SEQUENCE AT 1." : ""}
        
        REQUIRED JSON STRUCTURE:
        {
          "header": { "numPedimento": "REQ", "tOper": "REQ", "cvePedimento": "REQ", "regimen": "REQ", "tipoCambio": "0.00", "pesoBruto": "0.00", "aduanaES": "REQ" },
          "importador": { "rfc": "REQ", "nombre": "OPT", "domicilio": "OPT" },
          "proveedor": { "idFiscal": "OPT", "nombre": "OPT", "domicilio": "OPT" },
          "fechas": { "entrada": "YYYY-MM-DD", "pago": "YYYY-MM-DD" },
          "valores": { "valorDolares": "0", "valorAduana": "0", "precioPagado": "0", "fletes": "0", "seguros": "0", "embalajes": "0", "otrosIncrementables": "0" },
          "tasasNivelPedimento": [ { "clave": "STR", "tasa": "STR" } ],
          "cuadroLiquidacion": { "efectivo": "0", "total": "0", "conceptos": [ { "concepto": "STR", "importe": "0" } ] },
          "identificadores": [ { "clave": "STR", "compl1": "STR" } ],
          "transporte": [ { "identificacion": "STR", "transportista": { "nombre": "STR" } } ],
          "contenedores": [ { "numero": "STR", "tipo": "STR" } ],
          "partidas": [
            {
              "secuencia": 1,
              "fraccion": "STR",
              "subdivision": "STR",
              "vinculacion": "REQ",
              "metodoValoracion": "REQ",
              "umc": "REQ (Unit Code e.g. 1, 6, kg - NOT Country)",
              "cantidadUMC": "REQ",
              "umt": "REQ (Tariff Unit Code e.g. 1, 6 - NOT Country)",
              "cantidadUMT": "REQ",
              "PVC": "REQ (Country Code e.g. CHN, USA, MEX)",
              "POD": "REQ (Country Code e.g. CHN, USA, MEX)",
              "descripcion": "STR",
              "valores": { 
                "valorAduanaUSD": "0",
                "impPrecioPag": "0",
                "precioUnitario": "0",
                "valorAgregado": "OPT (null if empty)"
              },
              "tasas": [ 
                { "clave": "STR", "tasa": "0.00", "importe": "0" } 
              ],
              "identificadores": [ 
                { 
                  "identif": "STR", 
                  "compl1": "STR",
                  "descargo": "STR", 
                  "Valcomdls": "0.00", 
                  "Cantidadumtc": "0.00" 
                } 
              ],
              "observaciones": "STR"
            }
          ]
        }

        RULES:
        1. Extract data STRICTLY from the input text.
        2. If a Header field is missing (likely in later chunks), use null or empty string.
        3. Do NOT invent data.
        4. Return ONLY JSON.
        5. EXTRACT ALL ITEMS FOUND IN THIS CHUNK. DO NOT TRUNCATE.
        6. Do NOT copy 'impPrecioPag' to 'valorAgregado'. If empty, return null.
        ${isLastChunk ? "7. CRITICAL: Look for the FINAL items (e.g. Seq 45). Do not hallucinate 'Seq 1' if it is not there." : ""}
        
        INPUT TEXT:
        ${chunkText.substring(0, 30000)} // Chunk Safety Limit
      `;

        const response = await ai.models.generateContent({
          model: 'gemini-2.0-flash-exp',
          contents: { parts: [{ text: prompt }] },
          config: { responseMimeType: 'application/json' }
        });

        const jsonString = cleanJson(response.text || '{}');
        // Simple Repair Check
        try {
          return JSON.parse(jsonString);
        } catch (e) {
          console.warn(`Chunk ${index} JSON parse failed. Attempting repair...`);
          // Minimal repair (removed complex state machine for brevity in loop, relying on cleanJson)
          return {};
        }
      };

      // 2. Parallel Analysis
      const results = await Promise.all(chunks.map((chunk, idx) => analyzeChunk(chunk, idx)));

      // 3. Merge Results
      console.log("Merging Phase 2 Results...");
      const masterRecord = results[0] || {}; // Assume Header in Chunk 0

      // Concatenate Partidas
      const allPartidas = results.flatMap(r => Array.isArray(r.partidas) ? r.partidas : []);

      // Deduplicate Partidas (Safety against AI hallucinations repeating items in footer chunks)
      const uniquePartidasMap = new Map();
      allPartidas.forEach(p => {
        if (p && p.secuencia && !uniquePartidasMap.has(p.secuencia)) {
          uniquePartidasMap.set(p.secuencia, p);
        }
      });
      const uniquePartidas = Array.from(uniquePartidasMap.values());

      console.log(`Total Partidas Extracted: ${allPartidas.length} (Unique: ${uniquePartidas.length})`);

      // Re-assemble Strict Structure
      // We stringify the merged object to pass it to the existing `processRawPedimentoLogic`
      // which expects a JSON string of the *whole* pedimento structure.
      const mergedRawStruct = {
        ...masterRecord,
        partidas: uniquePartidas
      };

      const jsonString = JSON.stringify(mergedRawStruct);

      // Now that we have the JSON string, we can use our strict mapper (extracted helper).
      const strictPedimentoData = processRawPedimentoLogic(jsonString);

      return {
        // Pass the raw AI JSON directly for inspection
        aiJson: mergedRawStruct,

        page1: {
          ...strictPedimentoData.header,
          valores: strictPedimentoData.header.valores,
          fechas: {
            entrada: strictPedimentoData.header.fechas.find(f => f.tipo === 'Entrada')?.fecha,
            pago: strictPedimentoData.header.fechas.find(f => f.tipo === 'Pago')?.fecha
          },
          transporte: strictPedimentoData.header.transporte,
          identificadoresGlobales: strictPedimentoData.header.identificadores,
          liquidacion: strictPedimentoData.header.importes
        },
        items: strictPedimentoData.partidas.map(p => ({
          secuencia: p.secuencia,
          fraccion: p.fraccion,
          nico: p.nico,
          cantidadUMC: p.qty,
          umc: p.umc,
          precioPagado: p.totalAmount,
          precioUnitario: p.unitPrice,
          moneda: "USD", // Default or extract
          vinculacion: p.vinculacion,
          valcomdls: p.valorAduana,
          tasas: p.contribuciones, // Add Tasas
          identificadores: p.identifiers, // Add IDs
        })),
        rawText: rawText
      };

    } catch (error: any) {
      console.error("Phase 2 Mapping Error", error);
      throw error;
    }
  },

  // Senior Frontend Engineer: Updated model name for logistics analysis.
  async analyzeLogisticsInvoice(base64Data: string, mimeType: string = 'image/jpeg'): Promise<ExtractedCost[]> {
    try {
      const ai = getClient();
      const prompt = `
      Analyze this logistics invoice. Identify line items: Freight, Customs, Transport, Handling, Other.
      Extract Amount and Currency. Return ONLY a JSON array.
    `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash-exp',
        contents: {
          parts: [{ inlineData: { mimeType, data: base64Data } }, { text: prompt }]
        },
        config: { responseMimeType: 'application/json' }
      });

      return JSON.parse(cleanJson(response.text || '[]')) as ExtractedCost[];
    } catch (error) {
      console.error("Gemini Cost Analysis Error", error);
      throw new Error("Failed to analyze costs");
    }
  },

  // Senior Frontend Engineer: High accuracy extraction using gemini-3-flash-preview.
  async parseShippingDocument(base64Data: string, mimeType: string = 'image/jpeg'): Promise<ExtractedShippingDoc> {
    try {
      const ai = getClient();
      const prompt = `
    Analyze this shipping document (Bill of Lading, AWB, or Arrival Notice) EXPERTLY.
    Extract the following data into a strict JSON object:

    - docType: "BL" or "AWB"
    - bookingNo: The FULL Alphanumeric Booking/BL Number. (e.g. "EGLV12345678" NOT "12345678"). MUST include the carrier prefix (EGLV, COSU, MAEU, ONEY, MEDU, etc.).
    - vesselOrFlight: Vessel Name and Voyage.
    - etd: YYYY-MM-DD.
    - eta: YYYY-MM-DD.
    - departurePort: Port of Loading / Departure.
    - arrivalPort: Port of Discharge / Arrival.
    - shippingCompany: Carrier Name.
    - containers: Array of objects (containerNo, size, seal, pkgCount, weightKg).
    - invoiceNo: Commercial Invoice number.
    - poNumber: PO Number.
    - model: Model numbers/SKUs.

    CRITICAL: 
    1. If multiple dates exist, use the most prominent ETD/ETA.
    2. Ensure Container Numbers are alphanumeric (Standard Format: 4 letters + 7 numbers).
    3. Do NOT hallucinate. If a field is missing, return null.
    4. FOR BILL OF LADING: ALWAYS INCLUDE THE 4-LETTER PREFIX.
  `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash-exp',
        contents: {
          parts: [{ inlineData: { mimeType, data: base64Data } }, { text: prompt }]
        },
        config: { responseMimeType: 'application/json' }
      });

      return JSON.parse(cleanJson(response.text || '{}')) as ExtractedShippingDoc;
    } catch (error) {
      console.error("Gemini BL/AWB Parse Error", error);
      throw new Error("Failed to extract shipping data");
    }
  },

  async analyzeDataStage(data: PedimentoRecord[], promptContext: string): Promise<string> {
    try {
      const ai = getClient();
      const summary = `Operations: ${data.length}, Value: $${data.reduce((a, c) => a + c.totalValueUsd, 0)}`;
      const fullPrompt = `Analyze this Mexican Customs data summary and provide an executive summary in Spanish. ${summary}. Context: ${promptContext}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: { parts: [{ text: fullPrompt }] }
      });

      return response.text || "No analysis available.";
    } catch (error) {
      return "Error generating analysis.";
    }
  },

  // Senior Frontend Engineer: Phase 1 - High Volume Scalability (Pagination & Aggregation)
  async fetchRawPedimento(base64Images: string[]): Promise<string> {
    try {
      console.log(`Starting Raw Pedimento Extraction...`);
      const fullPdfBase64 = base64Images[0];

      // 1. Prepare PDF Document
      const pdfBuffer = Uint8Array.from(atob(fullPdfBase64) as any, (c: any) => c.charCodeAt(0));
      const pdfDoc = await PDFDocument.load(pdfBuffer);
      const totalPages = pdfDoc.getPageCount();
      console.log(`Document has ${totalPages} pages.`);

      // 2. Define Chunks (Strategy: 3 pages per chunk for token safety)
      const CHUNK_SIZE = 3;
      const chunks: { start: number, end: number, base64: string }[] = [];

      for (let i = 0; i < totalPages; i += CHUNK_SIZE) {
        const subDoc = await PDFDocument.create();
        const end = Math.min(i + CHUNK_SIZE, totalPages);
        const pagesToCopy = Array.from({ length: end - i }, (_, k) => i + k);

        const copiedPages = await subDoc.copyPages(pdfDoc, pagesToCopy);
        copiedPages.forEach(page => subDoc.addPage(page));

        const base64Chunk = await subDoc.saveAsBase64();
        chunks.push({ start: i, end: i + CHUNK_SIZE - 1, base64: base64Chunk });
      }

      console.log(`Created ${chunks.length} chunks for processing.`);

      // 3. Process Chunks (with Backoff & Concurrency)
      // Helper for Exponential Backoff
      const processChunk = async (chunk: typeof chunks[0], index: number) => {
        const client = getClient();
        const prompt = `
    EXTRACT PEDIMENTO DATA (Partial Chunk: Pages ${chunk.start + 1}-${chunk.end + 1}).
    Analyze this section of the document. Return a SINGLE JSON object matching this STRICT structure.
    
    Fields to extract:
    - header: referencia, numPedimento, tOper, cvePedimento, regimen, tipoCambio, pesoBruto, aduanaES.
    - importador: rfc, nombre, domicilio.
    - proveedor: idFiscal, nombre, domicilio, vinculacion.
    - fechas: entrada, pago.
    - valores: valorDolares, valorAduana, precioPagado, seguros, fletes, embalajes, otrosIncrementables, transporteDecrementables, seguroDecrementables, cargaDecrementables, descargaDecrementables, otrosDecrementables.
    - tasasNivelPedimento: Array of { contribucion, clave, tasa }.
    - cuadroLiquidacion: conceptos [{ concepto, fp, importe }], efectivo, otros, total.
    - identificadores: Array of { clave, compl1, compl2, compl3 } (Global identifiers).
    - transporte: Array of { identificacion, pais, transportista, rfc, curp, domicilio } (Capture GUIA/ORDEN EMBARQUE here in 'identificacion').
    - contenedores: Array of { numero, tipo, candados } (Capture NUMERO/TIPO here).
    - facturas: Array of { numFactura, fecha, incoterm, monedaFact, valMonFact, factorMonFact, valDolares }.
    - observaciones: String.
    - partidas: Array of objects with:
        - secuencia (number)
        - fraccion, subdivision, vinculacion, metodoValoracion
        - umc, cantidadUMC, umt, cantidadUMT
        - pvc, pod, descripcion
        - valores: { valorAduanaUSD, impPrecioPag, precioUnitario, valorAgregado }
        - permisos: Array of { clave, numeroPermiso, firmaDescargo, valComDls, cantidadUMT }
        - identificadores: Array of { identif, compl1, compl2, compl3 }
        - observaciones (Capture FULL text, even if multi-line. Do not truncate.)
        - tasas
        - transportista (if listed per item)

    RULES:
    1. Extract what you see in THIS chunk.
    2. Capture ALL sequences found in these pages.
    3. RETURN MINIFIED JSON.
    4. CRITICAL: Look for 'GUIA / ORDEN EMBARQUE', 'CONTENEDORES', and 'IDENTIFICADORES' sections. They often appear AFTER Facturas. Extract them accurately.
    `;

        let attempt = 0;
        const maxAttempts = 5;

        while (attempt < maxAttempts) {
          try {
            const result = await client.models.generateContent({
              model: 'gemini-2.0-flash-exp',
              contents: { parts: [{ inlineData: { mimeType: 'application/pdf', data: chunk.base64 } }, { text: prompt }] },
              config: { responseMimeType: 'application/json', maxOutputTokens: 8192 }
            });
            return { index, text: result.text || "{}" };
          } catch (error: any) {
            if (error.status === 429 || error.message?.includes('429')) {
              attempt++;
              const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000; // Jitter
              console.warn(`Hit Rate Limit (Chunk ${index}). Retrying in ${delay.toFixed(0)}ms...`);
              await new Promise(r => setTimeout(r, delay));
              continue;
            }
            console.error(`Error processing chunk ${index}`, error);
            return { index, text: "{}" }; // Return empty on fatal error to avoid breaking whole doc
          }
        }
        return { index, text: "{}" };
      };

      const results = await Promise.all(chunks.map((chunk, idx) => processChunk(chunk, idx)));

      // 4. Aggregation 
      let masterRecord: any = {};
      let aggregatedPartidas: any[] = [];
      let aggregatedFacturas: any[] = [];

      results.sort((a, b) => a.index - b.index).forEach((res, i) => {
        try {
          const json = JSON.parse(cleanJson(res.text));

          // Base: Take header/main info from the FIRST successful chunk
          if (i === 0 || !masterRecord.header) {
            masterRecord = { ...json };
          }

          // Append Arrays
          if (Array.isArray(json.partidas)) {
            aggregatedPartidas = [...aggregatedPartidas, ...json.partidas];
          }
          if (Array.isArray(json.facturas)) {
            aggregatedFacturas = [...aggregatedFacturas, ...json.facturas];
          }

        } catch (e) {
          console.error("Aggregation Parse Error", e);
        }
      });

      // Apply aggregated arrays to master
      masterRecord.partidas = aggregatedPartidas;
      masterRecord.facturas = aggregatedFacturas;

      return JSON.stringify(masterRecord);

    } catch (error) {
      console.error("Gemini Raw Extraction Error", error);
      throw error;
    }
  },

  // Senior Frontend Engineer: Phase 2 - Pure Logic (Sync)
  processRawPedimento: (rawText: string): DomainPedimentoData => processRawPedimentoLogic(rawText),

  // Valid Composition for Backward Compatibility (if needed)
  async extractPedimento(base64Images: string[]): Promise<{ data: DomainPedimentoData | null, raw: string }> {
    // This is just a wrapper now, preserving the old signature
    let rawText = "";
    try {
      rawText = await this.fetchRawPedimento(base64Images);
      const data = this.processRawPedimento(rawText);
      return { data, raw: rawText };
    } catch (e) {
      return { data: null, raw: rawText };
    }
  },
};
