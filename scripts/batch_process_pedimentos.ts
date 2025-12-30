
import { geminiService } from '../services/geminiService';
import * as fs from 'fs';
import * as path from 'path';

// --- Env Setup ---
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
} else {
    console.warn("WARNING: .env.local not found. API Key might be missing.");
}
// -----------------

async function batchProcess() {
    const dir = process.cwd();
    // Find files matching 5005*.pdf
    const files = fs.readdirSync(dir).filter(f => f.startsWith('5005') && f.endsWith('.pdf'));

    console.log(`Found ${files.length} Pedimento files to process.`);

    const results = [];
    const errors = [];

    console.log("Starting Batch Extraction... (This may take a minute)");

    for (const [index, file] of files.entries()) {
        const filePath = path.join(dir, file);
        process.stdout.write(`[${index + 1}/${files.length}] Processing ${file}... `);

        try {
            const fileBuffer = fs.readFileSync(filePath);
            const base64Data = fileBuffer.toString('base64');

            const data = await geminiService.extractPedimento(base64Data, 'application/pdf');

            // Add filename to the record for reference
            const record = { fileName: file, ...data };
            results.push(record);
            process.stdout.write(`✅ Success (Ped: ${data.pedimento})\n`);

        } catch (err) {
            process.stdout.write(`❌ Failed\n`);
            errors.push({ file, error: err instanceof Error ? err.message : String(err) });
        }

        // Small delay to be nice to API rate limits (optional but good practice)
        await new Promise(r => setTimeout(r, 1000));
    }

    // Save Results
    const outputPath = path.join(dir, 'pedimentos_batch_results.json');
    fs.writeFileSync(outputPath, JSON.stringify({ results, errors }, null, 2));

    console.log("\n---------------- SUMMARY ----------------");
    console.table(results.map(r => ({
        File: r.fileName,
        Pedimento: r.pedimento,
        Patente: r.patente,
        RFC: r.rfc,
        'Op Type': r.tipoOperacion,
        'Clave': r.claveDocumento,
        'Items': r.items?.length || 0,
        'Total USD': r.invoices?.reduce((acc: number, inv: any) => acc + (inv.valorDolares || 0), 0).toFixed(2)
    })));

    if (errors.length > 0) {
        console.log("\nErrors:");
        console.table(errors);
    }

    console.log(`\nFull results saved to: ${outputPath}`);
}

batchProcess();
