import { GoogleGenAI } from "@google/genai";
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function test() {
  const apiKey = process.env.VITE_GEMINI_API_KEY;
  if (!apiKey) throw new Error("No API key");
  const ai = new GoogleGenAI({ apiKey });

  const dummyBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==";
  const mimeType = 'image/jpeg';
  const prompt = "Extract number";

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [{ inlineData: { mimeType, data: dummyBase64 } }, { text: prompt }]
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
    console.log("Response:", response.text);
  } catch (e) {
    console.error("SDK Error:", e);
  }
}
test();
