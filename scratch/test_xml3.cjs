const { DOMParser } = require('xmldom');
const fs = require('fs');
const text = fs.readFileSync('/Users/alex/Downloads/CFM-26CFTTN-643364-3.xml', 'utf-8');
const parser = new DOMParser();
const wordDoc = parser.parseFromString(text, 'text/xml');
const wts = Array.from(wordDoc.getElementsByTagName('w:t'));
const embedded = wts.map(n => n.textContent || '').join('');
const cfdiStart = embedded.indexOf('<cfdi:Comprobante');
const cfdiEnd = embedded.lastIndexOf('</cfdi:Comprobante>');
const cfdiXml = embedded.substring(cfdiStart, cfdiEnd + '</cfdi:Comprobante>'.length);

const cfdiDoc = parser.parseFromString(cfdiXml, 'text/xml');
const comp = cfdiDoc.getElementsByTagName('cfdi:Comprobante')[0] || cfdiDoc.getElementsByTagName('Comprobante')[0];
const emis = cfdiDoc.getElementsByTagName('cfdi:Emisor')[0] || cfdiDoc.getElementsByTagName('Emisor')[0];
const concs = cfdiDoc.getElementsByTagName('cfdi:Concepto');

console.log("comp found: ", !!comp);
console.log("emis found: ", !!emis);
console.log("concs count: ", concs ? concs.length : 0);

if (!comp || !emis || !concs.length) {
    console.log("Extraction failed here");
} else {
    const timbre = cfdiDoc.getElementsByTagName('tfd:TimbreFiscalDigital')[0] || cfdiDoc.getElementsByTagName('TimbreFiscalDigital')[0];
    const uuid = timbre ? (timbre.getAttribute('UUID') || timbre.getAttribute('uuid')) : '';
    console.log("uuid: ", uuid);
}
