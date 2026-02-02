
import { GoogleGenAI } from "@google/genai";

const apiKey = "TEST";
const genAI = new GoogleGenAI({ apiKey });

console.log("Keys on instance:", Object.keys(genAI));
console.log("Prototype:", Object.getPrototypeOf(genAI));
try {
    console.log("getGenerativeModel:", genAI.getGenerativeModel);
} catch (e) {
    console.log("Error accessing getGenerativeModel:", e.message);
}
