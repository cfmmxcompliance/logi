
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs/promises';

async function testPdf() {
    try {
        const buffer = await fs.readFile('./P5005521.pdf');
        const data = new Uint8Array(buffer);

        const loadingTask = pdfjsLib.getDocument({
            data: data,
            useSystemFonts: true, // Config similar to what we had
            disableFontFace: true
        });

        const doc = await loadingTask.promise;
        console.log(`FACT: PDF Loaded. Pages: ${doc.numPages}`);

        const page = await doc.getPage(1);
        const content = await page.getTextContent();

        const strings = content.items.map(item => item.str);
        const text = strings.join(' ');

        console.log(`FACT: Page 1 Item Count: ${content.items.length}`);
        console.log(`FACT: Page 1 Text Length: ${text.length}`);

        if (text.length > 0) {
            console.log("FACT: First 100 chars:", text.substring(0, 100));
        } else {
            console.log("FACT: Text is empty.");
        }
    } catch (e) {
        console.error("FACT: Error loading PDF:", e.message);
    }
}

testPdf();
