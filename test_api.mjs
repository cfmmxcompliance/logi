import { GoogleGenAI } from "@google/genai";
import dotenv from 'dotenv';
dotenv.config();

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function test() {
    try {
        const response = await genAI.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: { parts: [{ text: "echo hello" }] }
        });
        console.log("RESPONSE:", response.text);
    } catch (e) {
        console.error("ERROR:", e.message);
    }
}

test();
