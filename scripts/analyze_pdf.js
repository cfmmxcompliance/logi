

// Polyfill for DOMMatrix in Node
if (typeof DOMMatrix === 'undefined') {
    global.DOMMatrix = class DOMMatrix {
        constructor() {
            this.m11 = 1; this.m12 = 0; this.m21 = 0; this.m22 = 1; this.m41 = 0; this.m42 = 0;
        }
    };
}

import fs from 'fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

// Polyfill for PDF.js in Node environment setup
// Standard import for PDF.js 4+ in Node usually works without canvas if just text
// but might need some mocked globals. Let's try minimal first.

async function extractText(pdfPath) {
    try {
        const data = await fs.readFile(pdfPath);
        const uint8Array = new Uint8Array(data);

        // Load document
        const loadingTask = getDocument({
            data: uint8Array,
            useSystemFonts: true,
            disableFontFace: true,
        });

        const doc = await loadingTask.promise;
        console.log(`Loaded PDF: ${pdfPath}`);
        console.log(`Pages: ${doc.numPages}`);

        let fullText = '';

        for (let i = 1; i <= doc.numPages; i++) {
            const page = await doc.getPage(i);
            const content = await page.getTextContent();

            // Simple extraction: join items with space or newline
            // We can check item.transform for layout analysis if needed, 
            // but usually raw text dump is enough for regex if order is preserved.
            const strings = content.items.map(item => item.str);

            console.log(`--- Page ${i} ---`);
            console.log(strings.join(' | ')); // Use pipe to see separation
            fullText += strings.join('\n') + '\n';
        }

        return fullText;

    } catch (err) {
        console.error("Error reading PDF:", err);
    }
}

const file = process.argv[2] || '/Users/alex/Downloads/logimaster (2)/P5005520.pdf';
extractText(file);
