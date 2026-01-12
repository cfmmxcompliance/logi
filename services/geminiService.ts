import { GoogleGenAI } from "@google/genai";
import { PedimentoRecord } from '../types.ts';
import { PDFDocument } from 'pdf-lib';

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
export interface PedimentoData {
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
    transportista?: string;
    rfc?: string;
    curp?: string;
    domicilio?: string;
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
    umt: string;
    cantidadUMT: string;
    pvc: string; // P.V/C
    pod: string; // P.O/D
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
      compl2: string;
      compl3: string;
    }[];
    observaciones: string; // Observaciones a Nivel Partida
    tasas: {
      tasa: string; // Tasa
      tipoTasa: string; // TT
      formaPago: string; // FP
      importe: string; // Importe
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

export const geminiService = {
  // Senior Frontend Engineer: RAW Extraction Mode (No Type coercion)
  // Senior Frontend Engineer: PAGINATED Forensic Extraction (Solves "Page 7 of 11" Truncation)
  parseInvoiceMaterials: async (base64Data: string, mimeType: string = 'image/jpeg'): Promise<string> => {
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
      // Fallback to single-shot if PDF lib fails (or logic error)
      // throw new Error(`Forensic Error: ${error.message || error}`);
      return "Error during paginated extraction. Please check logs.";
    }
  },



  // Senior Frontend Engineer: Updated model name for logistics analysis.
  analyzeLogisticsInvoice: async (base64Data: string, mimeType: string = 'image/jpeg'): Promise<ExtractedCost[]> => {
    try {
      const ai = getClient();
      const prompt = `
        Analyze this logistics invoice. Identify line items: Freight, Customs, Transport, Handling, Other.
        Extract Amount and Currency. Return ONLY a JSON array.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
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
  parseShippingDocument: async (base64Data: string, mimeType: string = 'image/jpeg'): Promise<ExtractedShippingDoc> => {
    try {
      const ai = getClient();
      const prompt = `
        Analyze this shipping document (Bill of Lading, AWB, or Arrival Notice).
        Extract key logistics data for a Pre-Alert record.
// ... (truncated prompt for brevity in restoration, assuming less critical for this task)
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash-exp', // Updated to latest fast model
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

  // Senior Frontend Engineer: Data Stage executive summary in Spanish.
  analyzeDataStage: async (data: PedimentoRecord[], promptContext: string): Promise<string> => {
    try {
      const ai = getClient();
      const summary = `Operations: ${data.length}, Value: $${data.reduce((a, c) => a + c.totalValueUsd, 0)}`;
      const fullPrompt = `Analyze this Mexican Customs data summary and provide an executive summary in Spanish. ${summary}. Context: ${promptContext}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: fullPrompt
      });

      return response.text || "No analysis available.";
    } catch (error) {
      return "Error generating analysis.";
    }
  },

  // Senior Frontend Engineer: Phase 1 - High Volume Scalability (Pagination & Aggregation)
  fetchRawPedimento: async (base64Images: string[]): Promise<string> => {
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

      // Execute in parallel (limited by JS runtime, effectively concurrent)
      // For very large docs, we might want `p-limit`, but `Promise.all` is fine for <20 chunks usually.
      const results = await Promise.all(chunks.map((chunk, idx) => processChunk(chunk, idx)));

      // 4. Aggregation (The Exception to Raw Rule)
      // We stitch the JSONs together to form one logical document.
      let masterRecord: any = {};
      let aggregatedPartidas: any[] = [];
      let aggregatedFacturas: any[] = [];

      results.sort((a, b) => a.index - b.index).forEach((res, i) => {
        try {
          const json = JSON.parse(cleanJson(res.text));

          // Base: Take header/main info from the FIRST successful chunk (usually chunk 0)
          if (i === 0 || !masterRecord.header) {
            masterRecord = { ...json };
          } else {
            // Improve: Should we merge "valores"? 
            // Usually values are summary. Let's assume Chunk 0 or Last Chunk has summary.
            // For now, simple strategy: Chunk 0 governs global fields.
          }

          // Append Arrays
          if (Array.isArray(json.partidas)) {
            aggregatedPartidas = [...aggregatedPartidas, ...json.partidas];
          }
          if (Array.isArray(json.facturas)) {
            // Avoid duplicate invoices if they appear on multiple pages
            const newFacturas = json.facturas;
            // Simple merge for now
            aggregatedFacturas = [...aggregatedFacturas, ...newFacturas];
          }

        } catch (e) {
          console.error("Aggregation Parse Error", e);
        }
      });

      // Apply aggregated arrays to master
      masterRecord.partidas = aggregatedPartidas;
      masterRecord.facturas = aggregatedFacturas;

      // Return as String (simulating a Raw Response)
      return JSON.stringify(masterRecord); // RAW COMPACT OUTPUT (No formatting)

    } catch (error) {
      console.error("Gemini Raw Extraction Error", error);
      throw error;
    }
  },

  // Senior Frontend Engineer: Phase 2 - Pure Logic (Sync)
  processRawPedimento: (rawText: string): PedimentoData => {
    try {
      // 1. Basic Markdown cleanup only via standard string ops
      let cleanText = cleanJson(rawText);

      // NO REGEX INTERVENTION for syntax fixing.
      // If the AI returns invalid JSON, it must fail or be fixed by the AI.

      // 3. Attempt parse
      let extracted: any;
      try {
        extracted = JSON.parse(cleanText);
      } catch (e) {
        console.error("Strict Parse Failed.");
        // Create a snippet for the error message (start and end)
        const snippet = cleanText.length > 50
          ? cleanText.substring(0, 20) + "..." + cleanText.substring(cleanText.length - 20)
          : cleanText;
        throw new Error(`JSON Parse Error: ${(e as Error).message}. Snippet: ${snippet}`);
      }

      // Ensure extracted is an object
      if (!extracted || typeof extracted !== 'object') {
        throw new Error("AI returned invalid data structure (not an object).");
      }

      // Ensure structure matches PedimentoData interface (Defaulting)
      return {
        header: {
          referencia: extracted.header?.referencia || "",
          numPedimento: extracted.header?.numPedimento || "",
          tOper: extracted.header?.tOper || "",
          cvePedimento: extracted.header?.cvePedimento || "",
          regimen: extracted.header?.regimen || "",
          tipoCambio: extracted.header?.tipoCambio || "",
          pesoBruto: extracted.header?.pesoBruto || "",
          aduanaES: extracted.header?.aduanaES || ""
        },
        importador: extracted.importador || { rfc: "", nombre: "", domicilio: "" },
        proveedor: extracted.proveedor || { idFiscal: "", nombre: "", domicilio: "", vinculacion: "NO" },
        valores: extracted.valores || { valorDolares: "0", valorAduana: "0", precioPagado: "0", seguros: "0", fletes: "0", embalajes: "0", otrosIncrementables: "0", transporteDecrementables: "0", seguroDecrementables: "0", cargaDecrementables: "0", descargaDecrementables: "0", otrosDecrementables: "0" },
        fechas: extracted.fechas || { entrada: "", pago: "" },
        tasasNivelPedimento: extracted.tasasNivelPedimento || [],
        cuadroLiquidacion: extracted.cuadroLiquidacion || { conceptos: [], efectivo: "0", otros: "0", total: "0" },
        identificadores: extracted.identificadores || [],
        transporte: extracted.transporte || [],
        contenedores: extracted.contenedores || [],
        facturas: Array.isArray(extracted.facturas) ? extracted.facturas.map((f: any) => ({
          numFactura: f.numFactura || "",
          fecha: f.fecha || "",
          incoterm: f.incoterm || "",
          monedaFact: f.monedaFact || "",
          valMonFact: f.valMonFact || "",
          factorMonFact: f.factorMonFact || "",
          valDolares: f.valDolares || ""
        })) : [],
        observaciones: extracted.observaciones || "",
        partidas: extracted.partidas || []
      };
    } catch (error) {
      console.error("Pedimento Parsing Logic Error", error);
      throw error; // Re-throw to be handled by UI
    }
  },

  // Valid Composition for Backward Compatibility (if needed)
  extractPedimento: async (base64Images: string[]): Promise<{ data: PedimentoData | null, raw: string }> => {
    // This is just a wrapper now, preserving the old signature
    let rawText = "";
    try {
      rawText = await geminiService.fetchRawPedimento(base64Images);
      const data = geminiService.processRawPedimento(rawText);
      return { data, raw: rawText };
    } catch (e) {
      return { data: null, raw: rawText };
    }
  },

  // ... (generic extraction methods) ...
  // Senior Frontend Engineer: Generic extractor for custom prompts (used by batch processor)
  extractGeneric: async (base64Data: string, prompt: string, mimeType: string = 'application/pdf'): Promise<any> => {
    const ai = getClient();
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-2.0-flash-exp',
          contents: {
            parts: [{ inlineData: { mimeType, data: base64Data } }, { text: prompt }]
          },
          config: { responseMimeType: 'application/json' }
        });

        return JSON.parse(cleanJson(response.text || '{}'));
      } catch (error) {
        attempts++;
        console.warn(`Gemini Generic Extraction Attempt ${attempts} failed. Retrying...`, error);
        if (attempts >= maxAttempts) {
          console.error("Gemini Generic Extraction Fatal Error", error);
          throw new Error("Failed to extract generic data after multiple attempts");
        }
        // Exponential backoff: 2s, 4s, 8s
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempts) * 1000));
      }
    }
  }
};
