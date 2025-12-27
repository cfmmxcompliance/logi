
import { GoogleGenAI } from "@google/genai";
import { PedimentoRecord } from '../types.ts';

// Senior Frontend Engineer: Use GoogleGenAI with the recommended direct API key access.
// Senior Frontend Engineer: Use GoogleGenAI with the recommended direct API key access.
const getClient = () => {
  const apiKey = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GEMINI_API_KEY) || process.env.API_KEY;
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
    } catch (error) {
      console.error("Gemini Parse Error", error);
      throw new Error("Failed to parse invoice");
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
           - For Evergreen, often starts with "EGLV".
           - For Air, format like "XXX-XXXXXXX".
        3. **vesselOrFlight**: Name of vessel and voyage, or flight number.
        4. **etd**: Estimated Time of Departure (YYYY-MM-DD).
        5. **eta**: Estimated Time of Arrival (YYYY-MM-DD).
        6. **departurePort**: Port/Airport of Loading (e.g., "SHANGHAI", "NINGBO").
        7. **arrivalPort**: Port/Airport of Discharge (e.g., "MANZANILLO, MX", "LAZARO CARDENAS").
        8. **invoiceNo**: Look for "Invoice No", "Commercial Invoice", or "Ref No".
        9. **model**: Try to identify the product model from the description (e.g., "CFORCE 600", "ZFORCE", "ATV"). If not found, return "".
        10. **containers**: A list of ALL containers.
            - **containerNo**: 4 letters + 6-7 digits (e.g., "TIIU4234064").
            - **size**: e.g., "40HQ", "20GP", "40HC".
            - **seal**: The seal number associated with the container.
            - **pkgCount**: Number of packages (e.g., "8" from "8PACKAGES").
            - **pkgType**: Type of package (e.g., "PACKAGES", "CTNS", "PLTS").
            - **weightKg**: Weight in KGS (e.g., "4840.000").
            - **volumeCbm**: Volume in CBM (e.g., "68.56").
            *Hint: Look for strings like "8PACKAGES/4840.000KGS/68.56CBM" or standard columnar data.*

          "containers": [{ 
            "containerNo": string, 
            "size": string, 
            "seal": string,
            "pkgCount": number, // e.g. 8
            "pkgType": string, // e.g. "PACKAGES", "CARTONS", "PALLETS"
            "weightKg": number, // e.g. 4840.0
            "volumeCbm": number // e.g. 68.56
          }]
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
  }
};
