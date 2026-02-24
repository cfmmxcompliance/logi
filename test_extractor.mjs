
import { extractPedimentoDraft } from './services/extractor/engine.js';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';

async function getPdfText(pdfPath) {
    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const loadingTask = pdfjsLib.getDocument({
        data,
        standardFontDataUrl: 'node_modules/pdfjs-dist/standard_fonts/',
        isEvalSupported: false
    });
    const pdf = await loadingTask.promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        fullText += content.items.map(item => item.str).join(' ') + '\n';
    }
    return fullText;
}

const xmlPath = './CMP220712ND9__CFM-25CFTT406474-12_5219753.xml';
const pdfPath = './CMP220712ND9__CFM-25CFTT406474-12_5219753.pdf';

async function test() {
    console.log("🚀 STARTING EXTRACTION TEST...");
    const pdfText = await getPdfText(pdfPath);
    const draft = await extractPedimentoDraft(xmlPath, pdfText);

    console.log("\n✅ EXTRACTION COMPLETE");
    console.log("-----------------------");
    console.log(`UUID: ${draft.header.uuid}`);
    console.log(`Incoterm: ${draft.header.incoterm || 'MISSING'}`);
    console.log(`Brand: ${draft.header.brand}`);
    console.log(`Model: ${draft.header.model}`);
    console.log(`Tax ID (Destinatario): ${draft.receptor.tax_id || 'MISSING'}`);

    console.log(`\nItems Found: ${draft.items.length}`);
    draft.items.slice(0, 2).forEach((item, i) => {
        console.log(`  Item ${i + 1}: SKU=${item.sku}, VIN=${item.vin || 'MISSING'}, Engine=${item.motor || 'MISSING'}`);
        console.log(`    Weights: Net=${item.peso_neto}, Gross=${item.peso_bruto}`);
    });

    if (draft.missing_fields.length > 0) {
        console.log(`\n⚠️ Missing Global Fields: ${draft.missing_fields.join(', ')}`);
    }
}

test().catch(console.error);
