
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { GoogleGenAI } from "@google/genai";
import fs from 'fs';

const firebaseConfig = {
    apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
    authDomain: "logimaster-cfmoto.firebaseapp.com",
    projectId: "logimaster-cfmoto",
    storageBucket: "logimaster-cfmoto.firebasestorage.app",
    messagingSenderId: "924452835722",
    appId: "1:924452835722:web:11a7eedec65ba034dc7873",
    measurementId: "G-01VXE7L5C3"
};

import dotenv from 'dotenv';
dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
// No getGenerativeModel. Use genAI.models.generateContent direct or similar.
// Actually, geminiService.ts uses `ai.models.generateContent`.
// We will call it in the loop.

// Known Patents
const PATENTS = ['3471', '1925', '3178', '1614'];

async function classifyAndFix() {
    console.log("🤖 STARTING AI PATENT CLASSIFICATION...");

    // 1. Gather all items
    const allItems = []; // { id, name, driveId, url, currentDossierId, currentDossierNum }
    const validDossiers = new Map(); // id -> data

    const snap = await getDocs(collection(db, 'electronic_dossiers'));
    for (const d of snap.docs) {
        const data = d.data();
        validDossiers.set(d.id, data);
        const items = data.items || [];
        items.forEach(item => {
            allItems.push({
                ...item,
                currentDossierId: d.id,
                currentDossierNum: data.numPedimento
            });
        });
    }

    console.log(`📦 gathered ${allItems.length} files to classify.`);

    // 2. Batch Process with AI
    const BATCH_SIZE = 40;
    const moves = [];

    for (let i = 0; i < allItems.length; i += BATCH_SIZE) {
        const batch = allItems.slice(i, i + BATCH_SIZE);
        console.log(`🧠 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allItems.length / BATCH_SIZE)}...`);

        const prompt = `
        You are a customs expert. Analyze these filenames to extract the PATENTE and the FULL PEDIMENTO NUMBER.
        
        Valid Patents: 3471, 1925, 3178, 1614.
        
        Rules:
        1. Ignore years like 2024, 2025 unless part of the pedimento number.
        2. Pedimento number usually has 7 digits (sequence) or 15 digits (full). 
        3. If you find a 15-digit number, return it.
        4. If you find a 7-digit number, return it.
        5. Identify which Patent (3471, 1925, 3178, 1614) is present. If none found, look for clues.
        6. Return strictly JSON array.
        
        Input Files:
        ${JSON.stringify(batch.map(b => b.name))}
        
        Output format:
        [
          { "name": "filename...", "patent": "3471" or null, "pedimento": "number" or null }
        ]
        `;

        try {
            const response = await genAI.models.generateContent({
                model: 'gemini-2.0-flash',
                contents: {
                    parts: [{ text: prompt }]
                },
                config: {
                    responseMimeType: 'application/json'
                }
            });

            const text = response.text || ""; // Property access based on file view
            // If function check fails
            if (typeof response.text === 'function') {
                // It shouldn't be based on geminiService.ts usage which treats it as property?
                // Wait, snippet 488: return { ..., text: response.text || "" };
                // It looks like property.
            }

            // Clean markdown just in case (Gemini sometimes adds it even in JSON mode)
            const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
            const analyzed = JSON.parse(jsonStr);

            // Map back to items
            analyzed.forEach(res => {
                const originalItem = batch.find(b => b.name === res.name);
                if (!originalItem) return;

                if (res.pedimento) {
                    // Check if we need to move
                    // We trust AI's extracted pedimento.
                    // If 15 digits, great. If 7, we accept it.

                    const extracted = res.pedimento.toString().replace(/\s+/g, '');
                    const current = originalItem.currentDossierNum.replace(/\s+/g, '');

                    // Match logic:
                    // If current ends with extracted, or extracted ends with current -> Match.
                    const match = current === extracted || current.endsWith(extracted) || extracted.endsWith(current);

                    if (!match) {
                        moves.push({
                            item: originalItem,
                            targetPedimento: extracted,
                            detectedPatent: res.patent
                        });
                    }
                }
            });

        } catch (e) {
            console.error("AI Error:", e);
        }
    }

    console.log(`📋 Values to move: ${moves.length}`);

    // 3. Execute Moves
    const targetCache = new Map();

    for (const move of moves) {
        const { item, targetPedimento, detectedPatent } = move;
        console.log(` -> Moving ${item.name} to ${targetPedimento} (Patent: ${detectedPatent})`);

        // Find or Create Target
        let targetDocId = null;
        if (targetCache.has(targetPedimento)) {
            targetDocId = targetCache.get(targetPedimento).id;
        } else {
            // Search DB
            let found = null;
            for (const [id, data] of validDossiers.entries()) {
                const p = data.numPedimento.replace(/\s+/g, '');
                if (p === targetPedimento || p.endsWith(targetPedimento)) {
                    found = { id, ...data };
                    break;
                }
            }

            if (found) {
                targetDocId = found.id;
                targetCache.set(targetPedimento, found);
            } else {
                // Create
                const newRef = doc(collection(db, 'electronic_dossiers'));
                targetDocId = newRef.id;
                const newDocData = {
                    numPedimento: targetPedimento,
                    items: [],
                    financials: null,
                    lastUpdate: new Date().toISOString(),
                    status: 'Parcial',
                    patent: detectedPatent // Store inferred patent
                };
                await setDoc(newRef, newDocData);
                targetCache.set(targetPedimento, { id: targetDocId, ...newDocData });
                validDossiers.set(targetDocId, newDocData); // Add to local map
            }
        }

        // Add to Target
        const targetRef = doc(db, 'electronic_dossiers', targetDocId);
        // We read fresh to be safe? Or rely on map? 
        // Iterate validDossiers is safer if we update it.
        // We'll trust Firestore update.
        // Reading fresh is expensive but safer for array updates.
        const tSnap = await getDoc(targetRef);
        if (tSnap.exists()) {
            const tData = tSnap.data();
            const tItems = tData.items || [];
            if (!tItems.some(i => i.driveId === item.driveId)) {
                // Clean item before adding (remove internal props)
                const cleanItem = { ...item };
                delete cleanItem.currentDossierId;
                delete cleanItem.currentDossierNum;

                await updateDoc(targetRef, { items: [...tItems, cleanItem] });
            }
        }

        // Remove from Source
        const sourceRef = doc(db, 'electronic_dossiers', item.currentDossierId);
        const sSnap = await getDoc(sourceRef);
        if (sSnap.exists()) {
            const sData = sSnap.data();
            const sItems = sData.items || [];
            const newSItems = sItems.filter(i => i.driveId !== item.driveId);
            if (newSItems.length !== sItems.length) {
                await updateDoc(sourceRef, { items: newSItems });
            }
        }
    }

    // Cleanup empty
    console.log("🧹 Cleanup empty...");
    const finSnap = await getDocs(collection(db, 'electronic_dossiers'));
    for (const d of finSnap.docs) {
        if (!d.data().items || d.data().items.length === 0) {
            await deleteDoc(d.ref);
            console.log(`Deleted empty ${d.id}`);
        }
    }
    console.log("Done.");
    process.exit(0);
}

classifyAndFix().catch(console.error);
