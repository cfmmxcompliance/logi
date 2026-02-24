
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const fs = require('fs');

async function extractText(pdfPath) {
    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdf = await loadingTask.promise;

    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const strings = content.items.map(item => item.str);
        fullText += `--- Page ${i} ---\n` + strings.join(' ') + '\n';
    }
    return fullText;
}

const pdfPath = '/Users/alex/Downloads/logimaster (2)/CMP220712ND9__CFM-25CFTT406474-12_5219753.pdf';
extractText(pdfPath)
    .then(text => {
        console.log(text);
    })
    .catch(err => {
        console.error(err);
    });
