const { DOMParser } = require('xmldom');
const fs = require('fs');
const text = fs.readFileSync('/Users/alex/Downloads/CFM-26CFTTN-643364-3.xml', 'utf-8');
const parser = new DOMParser();
const wordDoc = parser.parseFromString(text, 'text/xml');
console.log("has pkg:package: ", wordDoc.getElementsByTagName('pkg:package').length > 0);
const isInsideDel = (node) => {
    let parent = node.parentNode;
    while (parent) {
        if (parent.tagName === 'w:del') return true;
        parent = parent.parentNode;
    }
    return false;
};
const wts = Array.from(wordDoc.getElementsByTagName('w:t'));
console.log("Number of w:t nodes: ", wts.length);
const embedded = wts
    .filter(n => !isInsideDel(n))
    .map(n => n.textContent || '').join('');

console.log("embedded includes cfdi:Comprobante: ", embedded.includes('cfdi:Comprobante'));
console.log("embedded includes <cfdi:Comprobante: ", embedded.includes('<cfdi:Comprobante'));
const cfdiStart = embedded.indexOf('<cfdi:Comprobante');
const cfdiEnd = embedded.lastIndexOf('</cfdi:Comprobante>');
console.log("start:", cfdiStart, "end:", cfdiEnd);
