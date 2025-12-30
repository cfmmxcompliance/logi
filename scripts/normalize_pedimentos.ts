
import * as fs from 'fs';
import * as path from 'path';

const filePath = path.join(process.cwd(), 'pedimentos_robust_results.json');
const raw = fs.readFileSync(filePath, 'utf-8');
const data = JSON.parse(raw);

// User Rule: 
// Year (25) + Aduana (16) + Patente (1614) + Operation (7 digits)
// Current Year: 2025 -> "25"
// Aduana: Manzanillo -> "16"
// Patente: "1614"

const STANDARD_PREFIX = "25 16 1614";

data.results.forEach((entry: any) => {
    // Access the inner object (key is "0" or just properties merged?)
    // In robust script, results.push({ fileName, ...data }).
    // Wait, the structure in the file seems to have an inner "0" key sometimes? 
    // Let's check the grep output.
    // The grep output showed: "0": { ... } inside "results".
    // Let's inspect structure more carefully.

    // Actually, looking at previous view_file, the structure for SOME entries is:
    // { "0": { ...data... }, "fileName": "..." }
    // But for others (like 5005243 in grep) it might be flat?
    // Let's handle both.

    let record = entry["0"] ? entry["0"] : entry;
    // If entry has "0", record is entry["0"]. 
    // If record doesn't have pedimento, maybe it's on entry level?
    // Let's normalize where we find "pedimento".

    // In the previous view_file of the JSON (lines 1-400), we saw:
    // { "0": { "pedimento": "..." }, "fileName": "..." }

    // But for 5005243 (lines 304-315 in view_file earlier), it was flat:
    // { "fileName": "...", "pedimento": "...", ... }

    // So the structure is indeed mixed.
    // Robust script: 
    // Small files -> return await geminiService.extractPedimento (returns Array of 1? or Object?)
    //   -> If gemini returns Array [ {...} ], then merging { fileName, ...data } results in { fileName, "0": {...} }
    // Large files -> return { ...header, items } (Object)
    //   -> merging { fileName, ...data } results in flat object.

    let target = entry;
    if (entry["0"] && entry["0"].pedimento) {
        target = entry["0"];
    }

    if (target.pedimento) {
        const p = target.pedimento.toString().replace(/\s+/g, ''); // Remove spaces
        // If it's the full 15 digits (251616145005237), it length is 15.
        // If it's just operation (5005237), length is 7.

        if (p.length === 7) {
            target.pedimento = `${STANDARD_PREFIX} ${p}`;
            // Also ensure patente is set
            if (!target.patente) target.patente = "1614";
        } else if (p.length > 7) {
            // Assume it has the prefix, just standardize spaces
            // Check if it contains 1614
            if (p.includes("1614")) {
                // Reformat nicely: 25 16 1614 XXXXXXX
                // Extract last 7
                const op = p.slice(-7);
                target.pedimento = `${STANDARD_PREFIX} ${op}`;
                if (!target.patente) target.patente = "1614";
            }
        }
    }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
console.log("Normalized Pedimento Numbers.");
