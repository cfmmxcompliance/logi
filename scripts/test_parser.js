// Logic replicated from services/pedimentoParser.ts for Node.js verification
// Uses 'fs' instead of 'File' API.

if (typeof DOMMatrix === 'undefined') {
    global.DOMMatrix = class DOMMatrix {
        constructor() {
            this.m11 = 1; this.m12 = 0; this.m21 = 0; this.m22 = 1; this.m41 = 0; this.m42 = 0;
        }
    };
}

import fs from 'fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

async function parsePedimentoData(pdfPath) {
    console.log(`Analyzing: ${pdfPath}`);
    const buffer = await fs.readFile(pdfPath);
    const data = new Uint8Array(buffer);

    // Load document
    const loadingTask = getDocument({
        data: data,
        useSystemFonts: true,
        disableFontFace: true,
    });

    const doc = await loadingTask.promise;
    let fullText = '';
    const items = [];
    let header = {
        pedimentoNo: '',
        isSimplified: false,
        fechaPago: ''
    };

    const regexPedimento = /(\d{2})\s+(\d{2})\s+(\d{4})\s+(\d{7})/;
    const regexFechaPago = /FECHA\s+DE\s+PAGO[:\s]+(\d{2}[-/]\d{2}[-/]\d{4})|(\d{2}[-/]\d{2}[-/]\d{4})\s+\|\s+PAGO/i;

    for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        const strings = content.items.map(item => item.str);
        const pageText = strings.join(' | ');
        fullText += pageText + '\n';

        // Detect Simplified
        if (i === 1 && (pageText.includes('FORMA SIMPLIFICADA') || pageText.includes('SimpDec'))) {
            header.isSimplified = true;
        }

        // DEBUG: Log RFC context
        if (pageText.includes('RFC')) {
            const idx = pageText.indexOf('RFC');
            console.log(`DEBUG PAGE ${i} RFC CONTEXT:`, pageText.substring(idx, idx + 50));
        }

        // --- Header Extraction ---
        if (!header.pedimentoNo) {
            const match = pageText.match(/(\d{2})\s+(\d{2})\s+(\d{4})\s+(\d{7})/);
            if (match) header.pedimentoNo = match[0].replace(/\s+/g, '');
        }

        // Revised RFC Regex (Looser)
        if (!header.rfc) {
            // Find "RFC" then look ahead for 12-13 alphanumeric.
            // Ignroing pipes and labels like "CURP" if they intervene?
            // "RFC: | CURP: | ... | CMP..." matches "CMP..."
            const rfcMatch = pageText.match(/RFC.*?\|.*?([A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3})/i);
            if (rfcMatch) header.rfc = rfcMatch[1];
        }

        // Revised Values
        if (!header.valorDolares) {
            const m = pageText.match(/VAL\.?\s*DOLARES.*?([\d,]+\.?\d*)/i); // Greedy match until number?
            // Be careful not to skip too far.
            // "VAL. DOLARES | 11843.08"
            const strictM = pageText.match(/VAL\.?\s*DOLARES(?:[^0-9]*)([\d,]+\.?\d*)/i);
            if (strictM) header.valorDolares = parseFloat(strictM[1].replace(/,/g, ''));
        }
        if (!header.valorAduana) {
            const strictM = pageText.match(/VAL\.?\s*ADUANA(?:[^0-9]*)([\d,]+\.?\d*)/i);
            if (strictM) header.valorAduana = parseFloat(strictM[1].replace(/,/g, ''));
        }
        if (!header.valorComercial) {
            const strictM = pageText.match(/VAL\.?\s*COMERCIAL(?:[^0-9]*)([\d,]+\.?\d*)/i);
            if (strictM) header.valorComercial = parseFloat(strictM[1].replace(/,/g, ''));
        }

        // Dates (Entrada, Pago)
        // FECHA DE ENTRADA. | 24/09/2024
        // PAGO ELECTRONICO | 25/09/2024
        const fechaEntrada = pageText.match(/FECHA\s*DE\s*ENTRADA.*?(\d{2}\/\d{2}\/\d{4})/i);
        if (fechaEntrada) header.fechaEntrada = fechaEntrada[1];

        const fechaPago = pageText.match(/(?:FECHA\s*DE\s*PAGO|PAGO\s*ELECTRONICO).*?(\d{2}\/\d{2}\/\d{4})/i);
        if (fechaPago) header.fechaPago = fechaPago[1];

        // Clave Documento
        if (!header.claveDocumento) {
            const match = pageText.match(/CVE\.\s*PEDIM.*?([A-Z0-9]{2})\b/i);
            if (match) header.claveDocumento = match[1];
        }
        // "TIPO DE CAMBIO: | 19.3456"
        const tcMatch = pageText.match(/TIPO\s*DE\s*CAMBIO\s*[:\.]?\s*\|\s*([\d\.]+)/i);
        if (tcMatch) header.tipoCambio = parseFloat(tcMatch[1]);

        // 3. GLOBAL VALUES (VAL. ADUANA, ETC)
        // Usually in a row: "VAL. SEGUROS | VAL. SEGUROS ... VAL. ADUANA | VAL. COMERCIAL"
        // And values row below: "0 | 0 ... | 114555 | 6500"

        // Strategy: Look for specific labels and take the number in the corresponding "pipe slot" or just regex proximity?
        // VAL. DOLARES | 11843.08
        // VAL. ADUANA | 228994

        // Regex: /VAL\.\s*DOLARES\s*\|\s*([\d,\.]+)/
        // Sometimes newlines are between.

        // ... existing header extraction ...

        // --- ANEXO 22 HEADER BLOCKS ---

        // 1. INCREMENTABLES
        // "VAL. SEGUROS | .00 | VAL. FLETES | .00 | EMBALAJES | .00 | OTROS INCREMENTABLES | .00"
        // Regex for values near keywords.
        const segurosMatch = pageText.match(/VAL\.?\s*SEGUROS(?:[^|]*\|)?\s*([\d,]+\.?\d*)/i);
        const fletesMatch = pageText.match(/VAL\.?\s*FLETES(?:[^|]*\|)?\s*([\d,]+\.?\d*)/i);
        const embalajesMatch = pageText.match(/EMBALAJES(?:[^|]*\|)?\s*([\d,]+\.?\d*)/i);
        const otrosMatch = pageText.match(/OTROS\s*INCREMENTABLES(?:[^|]*\|)?\s*([\d,]+\.?\d*)/i);

        if (segurosMatch) header.valores.seguros = parseFloat(segurosMatch[1]);
        if (fletesMatch) header.valores.fletes = parseFloat(fletesMatch[1]);
        if (embalajesMatch) header.valores.embalajes = parseFloat(embalajesMatch[1]);
        if (otrosMatch) header.valores.otros = parseFloat(otrosMatch[1]);

        // 2. TRANSPORTE
        // Block: "TRANSPORTE | IDENTIFICACION | PAIS | TRANSPORTISTA | RFC"
        // "ENTRADA/SALIDA: 7 | ... | ..."
        // Difficult to parse tabular without layout. 
        // Search for "MEDIOS DE TRANSPORTE" and scan next tokens?
        const transpMatch = pageText.match(/MEDIOS\s*DE\s*TRANSPORTE.*?(?:ENTRADA|SALIDA)[^:]*:\s*(\d{1,2})/i);
        if (transpMatch) header.transporte.medios.push(transpMatch[1]);

        // 3. GUIAS / CONTENEDORES
        // Search for keywords and grab following IDs.
        // GUIA: [A-Z0-9-]{5,}
        // CONTENEDOR: [A-Z]{4}\d{7}

        const containerMatches = pageText.match(/[A-Z]{4}\s*\d{7}/g);
        if (containerMatches) {
            header.contenedores = [...new Set(containerMatches)].map(c => ({ numero: c, tipo: 'Unknown' }));
        }

        // 4. FACTURAS
        // Block starts with "FACTURAS"
        // Data: NUM. FACTURA | FECHA | INCOTERM | MONEDA | FACTOR MON | VAL. DOLARES
        // Regex: Date (dd/mm/yyyy) near Invoice No?
        // Invoice No often Alphanumeric.
        // Let's just log if we find the block "FACTURAS" for now.
        if (pageText.includes('FACTURAS')) {
            console.log("Found FACTURAS block on page " + i);
        }



        // Items Logic
        if (!header.isSimplified) {
            for (let j = 0; j < strings.length; j++) {
                const str = strings[j];
                const partMatch = str.match(/No\.\s*De\s*parte:\s*([A-Z0-9-]+)/i);
                if (partMatch) {
                    const newItem = {
                        partNo: partMatch[1],
                        page: i
                    };
                    // 5. TAXES (Contribuciones)
                    // Extended list per Anexo 22
                    const taxKeys = ['IGI', 'IVA', 'DTA', 'PRV', 'CNT', 'CC', 'IEPS', 'ISAN', 'REC', 'DTI', 'BB'];
                    const blockParts = pageText.split('|').map(s => s.trim());
                    newItem.contribuciones = [];

                    // Iterate parts and find keys
                    for (let t = 0; t < blockParts.length; t++) {
                        const token = blockParts[t];
                        if (taxKeys.includes(token)) {
                            // Look ahead for values
                            // Stop if we hit another tax key
                            const lookAhead = blockParts.slice(t + 1, t + 8);
                            let validWindow = [];

                            for (const subToken of lookAhead) {
                                if (taxKeys.includes(subToken)) break;
                                // Clean value chars? "16.00"
                                if (/^\d+(\.\d+)?$/.test(subToken)) validWindow.push(parseFloat(subToken));
                            }

                            if (validWindow.length > 0) {
                                // Assume last is Importe
                                const importe = validWindow[validWindow.length - 1];
                                newItem.contribuciones.push({ clave: token, importe });
                            }
                        }
                    }
                    items.push(newItem);
                }
            }
        }
    }

    console.log("--- SYNOPSIS ---");
    if (header.pedimentoNo) {
        console.log(`[PASS] Pedimento No is Present: ${header.pedimentoNo}`);
    } else {
        console.error(`[FAIL] Pedimento No is Missing`);
    }

    // COMPLIANCE SIMULATION
    console.log("\n--- COMPLIANCE CHECKS (Simulation) ---");
    items.forEach(item => {
        // 1. Check Origin vs Treaty
        // Simulate CHN origin with TL USA logic?
        // We extracted Origin: CHN.
        // Check identifiers.
        const tl = item.identifiers ? item.identifiers.find(c => c === 'TL') : null;
        if (item.paisOrigen === 'CHN' && tl) {
            console.warn(`[WARN] Item ${item.partNo}: Origin CHN but declares TL (Treaty). Verify applicability.`);
        }

        // 2. Check USMCA Opportunity
        if (item.paisOrigen === 'USA') {
            // Did we pay IGI?
            const igi = item.contribuciones.find(c => c.clave === 'IGI');
            if (igi && igi.importe > 0 && !tl) {
                console.warn(`[INFO] Item ${item.partNo}: Origin USA with IGI Paid ($${igi.importe}). Verify if USMCA applies.`);
            }
        }
    });
    console.log("Simplified:", header.isSimplified);
    console.log("Payment Date:", header.fechaPago);
    console.log("Items Count:", items.length);
    console.log("Items:", JSON.stringify(items, null, 2));

    // Extract Importer if possible (simple regex)
    const importerMatch = fullText.match(/DATOS DEL IMPORTADOR[^|]+\|([^|]+)\|/);
    if (importerMatch) console.log("Importer:", importerMatch[1].trim());


    // --- FINANCIAL ANALYSIS ---
    let globalTaxes = { DTA: 0, IGI: 0, IVA: 0, PRV: 0, TOTAL: 0 };

    // Page 1: Capture Global Totals
    // Pattern: "TASAS A NIVEL PEDIMENTO ... DTA ... 445.00 ... IVA ... 290.00"
    // Or "CUADRO DE LIQUIDACION ... EFECTIVO ... 2116"

    // Simplistic Regex for Page 1 Totals (Global)
    // We look for the "CUADRO DE LIQUIDACION" or specific tax keys followed by numbers
    const dtaMatch = fullText.match(/DTA\s*\|\s*(\d+)/); // e.g. DTA | 4 | 445.00 ?? No, regex needs to be careful
    // From logs: "DTA | 4 | 445.00" -> The amount is the second number usually? Or strict structure.
    // Logs: "DTA | 4 | 445.00 | PRV | 2 | 290.00 | IVA/PRV | 1 | 16.00" -> Wait, 16.00 is small.
    // Let's look at "CUADRO DE LIQUIDACION" section in logs:
    // "IGI | 0 | 0 | 445 ... IVA | 0 | 0 | 554 ... TOTAL | 2116"

    // Let's regex for the "CUADRO DE LIQUIDACION" block to be safe.
    const liquidationBlock = fullText.split('CUADRO DE LIQUIDACION')[1]?.split('DEPOSITO REFERENCIADO')[0] || '';

    const extractTax = (name, text) => {
        // Look for Name followed by pipe-separated values, capturing the last numeric-like field that isn't a code (0/1/2) 
        // OR specific to this layout: "IGI | <code?> | <val?> | <AMOUNT>"
        // Raw: "IGI | 1 | 0 | 308"
        // Regex: /IGI(?:\|[^|]+){0,5}\|\s*([0-9,]+(?:\.[0-9]+)?)/
        // But "1" and "0" are also numbers.
        // Heuristic: amounts usually larger? Or last one?
        // Let's print the match to see.

        const strictRegex = new RegExp(`${name}\\s*(\\|\\s*[^|]+\\s*){1,5}`);
        const match = text.match(strictRegex);
        if (match) {
            // Found the sequence starting with IGI...
            // Extract the immediate following numbers.
            // "IGI | 1 | 0 | 308 | IVA"
            // We can split by pipe and find the largest number?
            // Or just logging the segment for now.
            return "Detected";
        }
        return 0;
    };

    // DEBUG: Log the block for TBT070
    if (fullText.includes("TBT070")) {
        const idx = fullText.indexOf("TBT070");
        console.log("--- DEBUG BLOCK TBT070 ---");
        console.log(fullText.substring(idx - 400, idx).replace(/\n/g, ' '));
    }

    // Actually, looking at Page 1 logs:
    // "DTA | 4 | 445.00"
    // "PRV | 2 | 290.00"
    // "IVA/PRV | 1 | 16.00" ??
    // "CUADRO DE LIQUIDACION ... TOTALES ... EFECTIVO ... 2116"

    // Let's use the explicit matches seen in the file dump for 19251605700387
    if (fullText.includes("19251605700387")) {
        // Hardcoded logic for valid structure parsing based on previous dump
        // DTA: 445
        // IVA: 554 (calculated? or read?)
        // IGI: 781 ?? 
        // Let's Try generic extraction from lines
    }

    // --- ITEM ANALYSIS ---
    // Iterate items and try to find their tax blocks.
    // We already loop pages. Let's do a second pass per item page text.

    items.forEach(item => {
        // Extract page text for this item
        // We stored page index
        // We'll approximate the text block for the item.
        // It's brittle but sufficient for "Synopsis".

        // Find text around PartNo
        const pageIndex = item.page;
        // ... (We need to re-read or access page text. In this script we just concatenated fullText. 
        // Let's just search fullText for the partNo block)

        const partIndex = fullText.indexOf(item.partNo);
        if (partIndex === -1) return;

        // Look backwards/forwards for IGI / IVA
        const block = fullText.substring(partIndex - 1000, partIndex + 500);

        item.taxes = {
            IGI: extractTax('IGI', block),
            IVA: extractTax('IVA', block)
        };

        // --- UNIVERSAL BACKWARD SCAN (Anchor: Part Number) ---
        // The PDF reading order places "No. De parte" at the END of the item block.
        // We scan backwards from the Part Number index.

        const partIdx = fullText.indexOf(item.partNo);
        if (partIdx !== -1) {
            // Grab large chunk before part number (e.g. 2000 chars)
            // But ensure we don't bleed into previous item? 
            // We rely on Part Numbers being far apart or distinct blocks.
            const bigBlock = fullText.substring(Math.max(0, partIdx - 1500), partIdx);

            // 1. IDENTIFIERS (Nearest 'IDENTIF.' block backwards)
            const identifIdx = bigBlock.lastIndexOf('IDENTIF.');
            if (identifIdx !== -1) {
                const identSection = bigBlock.substring(identifIdx); // From IDENTIF to End (approx)
                const cleanIdentif = identSection.split('OBSERVACIONES')[0].replace(/COMPLEMENTO \d/g, '');
                const codes = cleanIdentif.match(/\b[A-Z0-9]{2,3}\b/g);
                if (codes) {
                    item.identifiers = codes.filter(c => !['COM', 'PLE', 'MEN', 'TO', 'OBS', 'ERV', 'ACI', 'ONES', 'IDE', 'NTI'].includes(c));
                }
            }

            // 2. QUANTITY (Scan backwards from Identifiers or End)
            // We need to skip the Tax Block (IGI, IVA) if present.
            // Heuristic: Split into segments, iterate reverse, skip segments near IGI/IVA keywords.

            const scanBlock = identifIdx !== -1 ? bigBlock.substring(0, identifIdx) : bigBlock;
            const segments = scanBlock.split('|').map(s => s.trim()).reverse();

            let foundQty = false;
            let skipMode = false; // To skip tax blocks

            for (let k = 0; k < segments.length; k++) {
                const seg = segments[k];
                if (!seg) continue;

                // If we see Tax Keywords, we might be in a tax block (reading backwards)
                if (['IGI', 'IVA', 'DTA', 'PRV'].includes(seg)) {
                    // We passed the tax block, safe to look for Qty now? 
                    // No, reading backwards: [Desc] [Qty] [Tax] [Tax] ...
                    // So if we see 'IGI', we are 'entering' the dangerous zone? 
                    // Actually, if we read backwards: we see Taxes FIRST, then Qty.
                    continue;
                }

                // Qty Candidates:
                // A) Strict 3-decimal: "6.000"
                if (/^\d+\.\d{3}$/.test(seg)) {
                    item.qty = parseFloat(seg);
                    foundQty = true;
                    // Strong match, stop looking for other Qty candidates (e.g. integer aliases)
                    // But we must continue to find Description.
                }

                // B) Repeated Integer: "1352" ... "1352"
                // Only accept if we haven't found a decimal Qty yet.
                // And ensure it's not a Tax Code (like 881).
                // Tax codes are usually single, Qty integer is often repeated in "Cantidad UMC" and "Cantidad Tarifa".

                else if (!foundQty && /^\d+$/.test(seg)) {
                    // Check neighbors for repetition
                    const nextSeg = segments[k + 1];
                    const nextNextSeg = segments[k + 2];
                    if (nextSeg === seg || nextNextSeg === seg) {
                        item.qty = parseInt(seg);
                        foundQty = true;
                    }
                }

                if (foundQty) {
                    // If we found an Integer Qty, we might still find a better Decimal Qty further back?
                    // In TBT070: ... 6.000 ... 881 ...
                    // Backward scan sees 881 first.
                    // If 881 is not repeated, we skip it (Rule B).
                    // Wait, 881 | 881 pattern? 
                    // Debug block: "... | 35.00000 | 881 |   | 881 |   | 146.83333 | ..."
                    // Yes, 881 is repeated! It's likely a Value or Tax Base? 
                    // It appears AFTER "35.00000" (Unit Price) and BEFORE "146..." (Total).
                    // So it matches the "Repeated Integer" rule.

                    // Critical Fix: Decimal Qty "6.000" is definitely Quantity. 
                    // Integers are risky.
                    // If we found an Integer, DO NOT break. Continue scanning for a Decimal.
                    // If we find a Decimal later, overwrite Item Qty.

                    if (/^\d+\.\d{3}$/.test(seg)) {
                        // This is definitive.
                        // Proceed to find UMC and break.
                    } else {
                        // This is tentative (Integer).
                        // Continue scanning for better match?
                        // But we need to switch state to "Find UMC".
                        // Complexity: If we treat 881 as Qty, we look for UMC 881...
                        // Let's enforce: If Decimal Found -> Lock it. If Integer Found -> Keep looking for Decimal within reasonable range (e.g. 5 segments).
                        // Simplified: Just overwrite if we find decimal.
                    }

                    // Refined Logic being swapped in REPLACEMENT:
                    // 1. Scan ALL segments. Collect candidates.
                    // 2. Pick Best.
                    // 3. Then locate Description relative to Best.
                }
            }
        }

        // --- EXTRA ITEM FIELDS (Origin, Vinc, Metodo) ---
        // These are usually short codes in the "PARTIDAS" block columns.
        // Block: ... | CHN | CHN | VIN | MET | ...

        // 1. Origin / Vendor Country
        // Debug: "| CHN |   | CHN |   | IGI"
        // Regex: (Code) ... (Code) ... IGI

        const igiIndex = block.lastIndexOf('IGI');
        if (igiIndex !== -1) {
            const preIgi = block.substring(Math.max(0, igiIndex - 100), igiIndex);
            const revPreIgi = preIgi.split('|').map(s => s.trim()).reverse();

            // Scan backwards from IGI: Expect [Start Tax Block?] -> [Orig] -> [Vend]
            // Usually Origin is closest to IGI?

            const countries = [];
            for (const seg of revPreIgi) {
                if (/^[A-Z]{3}$/.test(seg)) countries.push(seg);
                if (countries.length >= 2) break;
            }

            if (countries.length > 0) item.paisOrigen = countries[0];
            if (countries.length > 1) item.paisVendedor = countries[1];
        }

        // 2. Vinculacion / Metodo Valoracion (Placeholder)
        // Usually codes: "VIN" (0/1/2), "MET" (1/...).

        // Fallback Description if undefined
        if (!item.description || item.description === 'Unknown') item.description = "Extracted Item";

        console.log(`    > Desc: ${item.description}`);
        console.log(`    > Qty: ${item.qty} (UMC: ${item.umc})`);
        console.log(`    > Identifiers: ${item.identifiers ? item.identifiers.join(', ') : 'None'}`);
    }); // End items loop

    console.log("--- HEADER EXTRACTION ---");
    console.log(`RFC: ${header.rfc}`);
    console.log(`Tipo Cambio: ${header.tipoCambio}`);
    console.log(`Valores: Aduana=$${header.valorAduana}, USD=$${header.valorDolares}, Comercial=$${header.valorComercial}`);

    console.log("\n--- ITEM EXTRA DETAILS ---");
    items.forEach((item, idx) => {
        console.log(`Item ${idx + 1} (${item.partNo}):`);
        console.log(`  Origin: ${item.paisOrigen} (Vendor: ${item.paisVendedor})`);
        console.log(`  Qty: ${item.qty} (UMC: ${item.umc})`);
    });

    // DEBUG: Log the block for TBT085 to see why Qty failed
    if (fullText.includes("TBT085")) {
        const idx = fullText.indexOf("TBT085");
        console.log("--- DEBUG BLOCK TBT085 ---");
        console.log(fullText.substring(idx - 600, idx).replace(/\n/g, ' '));
    }

    console.log("\n--- FINANCIAL ANALYSIS ---");
    console.log("Global Totals (Approx):");
    // Extract precise Payment Total
    const paymentMatch = fullText.match(/IMPORTE\s+PAGADO[:\s]+\$\s*([0-9,]+\.\d{2}|[0-9,]+)/) || fullText.match(/EFECTIVO\s+\|\s*([0-9,]+)/);
    const totalPaid = paymentMatch ? paymentMatch[1] : "Unknown";
    console.log(`Total Paid (Efectivo): $${totalPaid}`);

    console.log("\n--- PER SEQUENCE DETAILS ---");
    items.forEach((item, idx) => {
        console.log(`Seq ${idx + 1} (Part ${item.partNo}):`);
        // We need to fetch the lines from the earlier dump to get values. 
        // Since we can't easily parse table rows in this linear script without complex XY logic,
        // we will report what we can find near the Part Number.

        // Manual search in previous output showed:
        // Part 1 (TBT070): IGI 308, IVA 226.
        // Part 2 (TBT085): IGI 473, IVA 328.

        // Let's implement specific regex for the format "IGI | ... | <amount>"
        // In the dump: "IGI | 1 | 0 | 308"
        // "IVA | 16.00000 | 1 | 0 | 226"

        console.log(`  Page: ${item.page}`);
    });





}

const file = process.argv[2];
if (file) parsePedimentoData(file);
else console.log("Please provide a file path");
