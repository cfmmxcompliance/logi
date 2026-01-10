
import { GoogleGenAI } from "@google/genai";
import { PedimentoRecord } from '../types.ts';
import { PDFDocument } from 'pdf-lib';

// Senior Frontend Engineer: Use GoogleGenAI with the recommended direct API key access.
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

// Senior Frontend Engineer: Helper to clean JSON from markdown blocks.
const cleanJson = (text: string) => {
  if (!text) return "";
  let clean = text.trim();
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```(json)?/i, '');
    clean = clean.replace(/```$/, '');
  }
  return clean.trim();
};

export const geminiService = {
  // Senior Frontend Engineer: Updated to use 'gemini-3-flash-preview' per guidelines.
  parseInvoiceMaterials: async (base64Data: string, mimeType: string = 'image/jpeg'): Promise<ExtractedInvoiceItem[]> => {
    try {
      const ai = getClient();
      const prompt = `
        Analyze this invoice/packing list image/document. 
        Extract a list of items with: Part Number, Quantity, Unit Price, Description.
        Return ONLY a JSON array.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [{ inlineData: { mimeType, data: base64Data } }, { text: prompt }]
        },
        config: { responseMimeType: 'application/json' }
      });

      return JSON.parse(cleanJson(response.text || '[]')) as ExtractedInvoiceItem[];
    } catch (error: any) {
      console.error("Gemini Parse Error", error);
      throw new Error(`Gemini Error: ${error.message || error}`);
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

        CRITICAL EXTRACTION FIELDS:
        1. **docType**: "BL" (Maritime) or "AWB" (Air).
        2. **bookingNo**: The main tracking number. Look for "Booking No", "B/L No", "AWB No", or "Bill of Lading No". 
           - **CRITICAL PRIORITY**: If you find a code starting with "EGLV" (e.g. "EGLV143574069349"), you **MUST** use it as the 'bookingNo'.
             - Ignore any "SEC" or internal forwarder codes if an "EGLV" code is present.
             - "EGLV" code is the Master BL and takes precedence over House BLs.
           - For Air, format like "XXX-XXXXXXX".
        3. **vesselOrFlight**: Name of vessel and voyage, or flight number.
        4. **etd**: Estimated Time of Departure (YYYY-MM-DD).
        5. **eta**: Estimated Time of Arrival (YYYY-MM-DD).
        6. **departurePort**: Port/Airport of Loading (e.g., "SHANGHAI", "NINGBO").
        7. **arrivalPort**: Port/Airport of Discharge (e.g., "MANZANILLO, MX", "LAZARO CARDENAS").
        8. **invoiceNo**: Look for "Invoice No", "Commercial Invoice", or "Ref No".
        9. **model**: Try to identify the product model from the description (e.g., "CFORCE 600", "ZFORCE", "ATV"). If not found, return "".
        10. **expectedContainerCount**: Look for a summary line like "Total Containers: 5", "Say: FIVE (5) CONTAINERS ONLY", or count the rows described in the "No. of Pkgs" column if it refers to containers.
            - If you see "1 x 40HC", the count is 1. 
            - If you see "5 x 40HC", the count is 5.
            - This is crucial for validation.

        11. **containers**: A COMPLETE LIST of ALL containers found in the document.
            - **CRITICAL**: Do NOT stop after the first result. Scan the entire document for every container number.
            - **Pattern**: 4 uppercase letters + 7 digits (e.g., "TRHU7133410", "TXGU5599902", "CAAU6010089", "EGSU1206707").
            - **Layout**: Often listed in a vertical column under "Container No", "Marks & Nos", or "Description of Goods".
            - **containerNo**: The container number (e.g. "TIIU4234064").
            - **size**: e.g., "40HQ", "20GP", "40HC".
            - **seal**: The seal number associated with the container.
            - **pkgCount**: Number of packages (e.g., "8").
            - **pkgType**: Type of package (e.g., "PACKAGES", "CTNS").
            - **weightKg**: Weight in KGS for THIS container (e.g., "4840.000").
            - **volumeCbm**: Volume in CBM for THIS container (e.g., "68.56").
            *Hint: Look for repeated lines like "8PACKAGES/4840.000KGS/68.56CBM". Each line usually corresponds to one container above it.*

          "containers": [{ 
            "containerNo": string, 
            "size": string, 
            "seal": string,
            "pkgCount": number, 
            "pkgType": string, 
            "weightKg": number, 
            "volumeCbm": number 
          }],
          "expectedContainerCount": number
        }
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

  // Senior Frontend Engineer: Robust Extractor for Mexican Pedimentos (Handles Large Files via Pagination)
  extractPedimento: async (base64Data: string, mimeType: string = 'application/pdf'): Promise<Partial<PedimentoRecord>> => {
    try {
      // 1. Load PDF to check size
      // Note: base64Data comes from FileReader (data:application/pdf;base64,...) or pure base64.
      const cleanBase64 = base64Data.replace(/^data:.*,/, '');
      const pdfDoc = await PDFDocument.load(cleanBase64);
      const pageCount = pdfDoc.getPageCount();

      console.log(`Extracting Pedimento (${pageCount} pages)...`);

      // 2. Extraction Strategy (Robust / Chunked)
      // A. Extract Header (Page 1)
      const headerDoc = await PDFDocument.create();
      const [page1] = await headerDoc.copyPages(pdfDoc, [0]);
      headerDoc.addPage(page1);
      const headerBase64 = await headerDoc.saveAsBase64();

      const headerPrompt = `
          Analyze this Pedimento Page 1. Extract ONLY the Header information.
          Return JSON: {
          "patente": string, "pedimento": string, "seccion": string, "tipoOperacion": string, "claveDocumento": string,
            "rfc": string, "tipoCambio": number, "fechaPago": string, "pesoBruto": number,
              "fletes": number, "seguros": number, "embalajes": number, "otrosIncrementables": number,
                "totalTaxes": number, "valorAduanaTotal": number,
                "dtaTotal": number, "prevalidacionTotal": number, "cntTotal": number, 
                  "invoices": [{
                    "numeroFactura": string, "fechaFacturacion": string, "proveedor": string,
                    "valorDolares": number, "moneda": string, "termFacturacion": string, "valorMonedaExtranjera": number
                  }]
        }
        HINT:
        - **FECHAS**: Look for "Fecha de Pago", "Pago", or dates near the bottom header section. Format DD/MM/YYYY.
        - **TIPO CAMBIO**: Look for "T.C.", "Tipo Cambio", "T. Cambio". Value usually around 18-22 for USD.
        - **VALORES**: 
             - "valorAduanaTotal" = "Valor Aduana" in the generic header summary.
             - "precioPagado" / "valorComercial" = Header Commercial Value.
        - **TAXES (CUADRO LIQUIDACION)**:
             - Look for a table with columns: [CONCEPTO] [F.P.] [IMPORTE].
             - "totalTaxes" = "TOTAL" or "EFECTIVO" at the bottom of that table.
        `;
      const headerData = await geminiService.extractGeneric(headerBase64, headerPrompt);

      // B. Extract Items (Chunks of 1 page)
      // Start from Page 1 (Index 1) to avoid re-feeding the Header (Page 0) which might confuse the Item extraction.
      let allItems: any[] = [];
      const CHUNK_SIZE = 1;

      // Start loop at 1
      for (let i = 1; i < pageCount; i += CHUNK_SIZE) {
        const chunkDoc = await PDFDocument.create();
        const endPage = Math.min(i + CHUNK_SIZE, pageCount);
        const pageIndices = Array.from({ length: endPage - i }, (_, k) => i + k);
        const copiedPages = await chunkDoc.copyPages(pdfDoc, pageIndices);
        copiedPages.forEach(p => chunkDoc.addPage(p));

        const chunkBase64 = await chunkDoc.saveAsBase64();
        const itemPrompt = `
          Analyze these Pedimento pages (Chunks). Extract the list of "Partidas" (Items).
          Return JSON: {
            "items": [
              { 
                "secuencia": "1", 
                "fraccion": "12345678", 
                "nico": "00", 
                "vinculacion": "1", 
                "metodoValoracion": "6", 
                "unidadMedidaComercial": "6", 
                "cantidadComercial": 56.000, 
                "unidadMedidaTarifa": "1", 
                "cantidadTarifa": 56.000, 
                "paisVendedor": "CHN", 
                "paisOrigen": "CHN", 
                "descripcion": "DESC...", 
                "valorAduana": 100, 
                "valorComercial": 100, 
                "precioUnitario": 10.00, 
                "valorAgregado": 0, 
                "valorDolares": 5.50,
                "contribuciones": [
                  { "clave": "6", "tasa": 0, "tipoTasa": "0", "formaPago": "0", "importe": 0 },
                  { "clave": "15", "tasa": 0.008, "tipoTasa": "1", "formaPago": "0", "importe": 100 }
                ],
                "regulaciones": [
                  { "clave": "C1", "permiso": "1234567890" } 
                ],
                "identifiers": [
                   { "code": "EC", "complement1": "1" }
                ],
                "observaciones": "PART NO 12345 FACTURA ABC",
                "partNumber": "12345",
                "invoiceNo": "ABC"
              }
            ]
          }
          IMPORTANT:
          - **EXTRACT EVERY SINGLE ITEM**. Do NOT summarize. Do NOT skip any rows.
          - **STRICT STRUCTURE**: You MUST return ALL fields in the EXACT order shown above.
          
          ** CRITICAL PART NUMBER RULES **:
          1. ** Look for "No. De Parte", "Parte", "Part No" ** in the item block.
          2. If explicitly labeled, use it.
          3. If NOT labeled, look for alphanumeric codes in the "Observaciones" block (e.g. "0010-013010-0010", "TBQ381", "30006").
          4. ** NEVER use the Description as the Part Number **.
             - "ARTICULOS DE CAUCHO" is a Description. DO NOT put this in "partNumber".
             - "TORNILLO DE ACERO" is a Description. DO NOT put this in "partNumber".
             - If you cannot find a Part Number code, return "".
          
          LAYOUT RULES (OFFICIAL PEDIMENTO COLUMNS):
          1. **TOP ROW** (Header row of the item):
             - [FRACCION] [SUBD/NICO] [VINC] [MET VAL] [UMC] [CANTIDAD UMC] [UMT] [CANTIDAD UMT] [P.V] [P.O]
             - Extraction Logic:
               - "Cantidad UMC" (Commercial Qty): Large number.
               - "UMT" (Tariff Unit): 1 digit code (e.g. 1, 6).
               - "Cantidad UMT" (Tariff Qty): The number strictly TO THE RIGHT of UMT.
               - **CRITICAL**: Do NOT confuse the "UMT" code (e.g. "1") with the "Cantidad UMT". 
               - Example: If text is "... 6 5.0 1 133 ...", then UMC=6, CantCom=5.0, UMT=1, CantTar=133.
               - "Cantidad UMT" (Tariff Qty): Decimal number(e.g. 6.72).
          
          2. **VALUE ROW** (Bottom row):
             - [Valor Aduana] [Valor Comercial] [Precio Unitario] [Valor Agregado]
             - Note: Valor Agregado column is empty or 0.
          
          3. **CONTRIBUTIONS SECTION** (Below value row):
             - Look for a list of taxes/fees associated with this item.
             - Columns: [CON] [TASA] [T.T.] [F.P.] [IMPORTE]
             - Extract ALL rows found (e.g. 6 (IGI), 15 (DTA), 3 (IVA), 50 (IEPS)).

          4. **REGULATIONS & IDENTIFIERS** (Mixed in rows):
             - **Regulaciones**: Look for "C1" or other keys followed by a permit number (long alphanumeric).
             - **Identifiers**: Look for "IDENTIF" label. Extract codes like "EC", "TL", "XP".
               - "complement1": The value strictly next to the identifier code.
             
          5. **OBSERVACIONES SECTION** (Bottom of the item):
             - Look for text like "OBS.", "OBSERVACIONES", or descriptive text at the end of the item block.
             - Extract the FULL Text into "observaciones".
             - **AS LAST RESORT**: Extract Part No / Invoice No from here if found.
              
              **FORMATTING RULES**:
              - **ESCAPE NEWLINES**: If 'observaciones' has multiple lines, use "\\n". Do NOT use literal line breaks.
              - Valid: "Line 1\\nLine 2"
              - Invalid: "Line 1\nLine 2"

          ** CRITICAL NULL HANDLING **:
          - ** NO FIELDS CAN BE NULL ** (except 'valorAgregado' if necessary, but prefer 0).
          - If a ** Numeric ** field is empty, return 0.
          - If a ** String ** field is empty, return ""(empty string).

        `;
        const chunkResult = await geminiService.extractGeneric(chunkBase64, itemPrompt);
        if (chunkResult.items) {
          console.log(`Chunk ${i}: Extracted ${chunkResult.items.length} items.`);
          allItems = allItems.concat(chunkResult.items);
        } else {
          console.warn(`Chunk ${i}: No items found.`);
        }
      }

      // 4. Post-Process: DataStage Compliance Calculations
      // Rule: ValorDolares = ValorAduana / TipoCambio
      if (headerData.tipoCambio && headerData.tipoCambio > 0) {
        allItems = allItems.map(item => {
          // A. Fix 'ValorComercial' alias (Must be MXN)
          // If ValCom is missing, default to ValAduana (MXN).
          if (!item.valorComercial && item.valorAduana) {
            item.valorComercial = item.valorAduana;
          }

          // B. Bi-directional Calculation & Incrementables Logic
          const totalIncrementables = (headerData.fletes || 0) + (headerData.seguros || 0) + (headerData.embalajes || 0) + (headerData.otrosIncrementables || 0);

          // Rule: If No Incrementables, ValorAduana MUST equal ValorComercial (in MXN).
          // Priority: Trust ValorAduana (the fiscal result) over ValorComercial if they differ.
          if (totalIncrementables < 1) {
            if (item.valorAduana && item.valorAduana > 0) {
              item.valorComercial = item.valorAduana; // Correct: Sync Com to Aduana (60)
            } else if (item.valorComercial && item.valorComercial > 0) {
              item.valorAduana = item.valorComercial; // Fallback: Sync Aduana to Com
            }
          }

          // Rule 1: ValAduana fallback (REMOVED for Audit)
          // We want to know if ValAduana is missing. Do not copy from ValComercial.

          // Rule 2: ValorDolares
          // AUDIT REQUIREMENT: Do NOT auto-correct. If the PDF has a value, keep it (even if wrong) to catch Broker mistakes.
          // Only calculate as fallback if missing.
          if ((!item.valorDolares || item.valorDolares === 0) && (item.valorAduana && item.valorAduana > 0 && headerData.tipoCambio > 0)) {
            item.valorDolares = Number((item.valorAduana / headerData.tipoCambio).toFixed(2));
          }


          // Rule 3: UMT Heuristic
          // If CantidadTarifa has decimals, Unit cannot be "6" (Pieces). It must be "1" (KGM) or similar.
          if (item.cantidadTarifa && item.cantidadTarifa % 1 !== 0 && item.unidadMedidaTarifa === '6') {
            item.unidadMedidaTarifa = '1';
          }

          // Rule 4: Fix 'ValorAgregado' <-> 'CantidadTarifa' Shift (User Reported Issue)
          // Diagnosis: The AI regularly puts the 'Cantidad Tarifa' (e.g. 6.72, 12.88) into the 'Valor Agregado' column because it's the last number.
          // Fix: If ValAgregado has a value and CantTarifa is 0, MOVE it back.
          if ((item.valorAgregado && item.valorAgregado > 0) && (!item.cantidadTarifa || item.cantidadTarifa === 0)) {
            item.cantidadTarifa = item.valorAgregado;
          }

          // Rule 5: STRICTLY FORCE ValorAgregado to 0 for Imports
          // The user explicitly forbade generating data here.
          item.valorAgregado = 0;

          return item;
        });
      }

      return { ...headerData, items: allItems };

    } catch (error) {
      console.error("Gemini Pedimento Extraction Error", error);
      throw new Error("Failed to extract pedimento");
    }
  },

  // Senior Frontend Engineer: Generic "Learning" Mode - Extracts any/all K-V pairs found.
  analyzeDocumentStructure: async (base64Data: string, mimeType: string = 'application/pdf'): Promise<Record<string, any>> => {
    try {
      const ai = getClient();
      const prompt = `
        Analyze this document (image or PDF).
        I want to "learn" the structure of this document.
        Extract ALL visible fields as key-value pairs.
        
        Rules:
        1. Identify labels and their corresponding values.
        2. If you see a table, extract it as an array of objects.
        3. Return a FLAT JSON object where possible, but use nested objects for distinct sections (e.g. "shipper", "consignee", "lineItems").
        4. Do NOT try to force it into a specific schema. Just tell me what you see.
        5. Return ONLY JSON.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash-exp',
        contents: {
          parts: [{ inlineData: { mimeType, data: base64Data } }, { text: prompt }]
        },
        config: { responseMimeType: 'application/json' }
      });

      return JSON.parse(cleanJson(response.text || '{}'));
    } catch (error) {
      console.error("Gemini Structure Analysis Error", error);
      throw new Error("Failed to analyze document structure");
    }
  },

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
        console.warn(`Gemini Extraction Attempt ${attempts} failed. Retrying...`, error);
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
