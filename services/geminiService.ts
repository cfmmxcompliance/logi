
import { GoogleGenAI } from "@google/genai";
import { PedimentoRecord } from '../types.ts';

// Senior Frontend Engineer: Use GoogleGenAI with the recommended direct API key access.
const getClient = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
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
  containers: { containerNo: string; size: string; seal: string }[];
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
        Analyze this shipping document (Bill of Lading / AWB).
        Extract key logistics data.
        
        CRITICAL INSTRUCTIONS:
        - docType: "BL" or "AWB".
        - bookingNo: For EVERGREEN docs, look for numbers starting with "EGLV".
        - vesselOrFlight: e.g., "EVER LUCENT 0759-069E".
        - departurePort: e.g., "NINGBO".
        - arrivalPort: e.g., "MANZANILLO, MX".
        - containers: 
          Look for formats like "TIIU4234064/40H/EMCWTR8274".
          Extract: containerNo="TIIU4234064", size="40H" (or 40HQ), seal="EMCWTR8274".
        
        Return ONLY a JSON object.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
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
      const summary = `Operations: ${data.length}, Value: $${data.reduce((a,c)=>a+c.totalValueUsd,0)}`;
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
