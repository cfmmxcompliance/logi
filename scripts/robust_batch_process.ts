
import { geminiService } from '../services/geminiService';
import { PDFDocument } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';

// --- Env Setup (Same as before) ---
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf-8');
    envConfig.split('\n').forEach(line => {
        const parts = line.split('=');
        if (parts.length >= 2) {
            const key = parts[0].trim();
            const val = parts.slice(1).join('=').trim();
            process.env[key] = val;
        }
    });
    if (process.env.VITE_GEMINI_API_KEY) {
        process.env.API_KEY = process.env.VITE_GEMINI_API_KEY;
    }
}
// ---------------------------------

const CHUNK_SIZE = 4; // Pages per chunk for items

async function processPdfRobust(filePath: string) {
    const fileBuffer = fs.readFileSync(filePath);
    // Convert to simple base64
    const base64 = fileBuffer.toString('base64');

    // geminiService.extractPedimento now handles both Small and Large files robustly.
    return await geminiService.extractPedimento(base64, 'application/pdf');
}

async function runRobustBatch() {
    const dir = process.cwd();
    const files = fs.readdirSync(dir).filter(f => f.startsWith('5005') && f.endsWith('.pdf'));

    console.log(`Robust Batch Processor: Found ${files.length} files.`);
    const results = [];
    const errors = [];

    for (const file of files) {
        try {
            const data = await processPdfRobust(path.join(dir, file));
            results.push({ fileName: file, ...data });
            await new Promise(r => setTimeout(r, 2000)); // Rate limit safety
        } catch (e) {
            console.error(`❌ Failed to process ${file}:`, e);
            errors.push({ file, error: String(e) });
        }
    }

    const outputPath = path.join(dir, 'pedimentos_robust_results.json');
    fs.writeFileSync(outputPath, JSON.stringify({ results, errors }, null, 2));

    console.log("\n---------------- SUMMARY ----------------");
    console.table(results.map(r => ({
        File: r.fileName,
        Ped: r.pedimento,
        Items: r.items?.length || 0,
        Value: r.totalValueUsd || r.invoices?.reduce((a: number, i: any) => a + (i.valorDolares || 0), 0).toFixed(2)
    })));
    console.log(`Saved to ${outputPath}`);
}

runRobustBatch();
