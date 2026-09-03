const { DOMParser } = require('@xmldom/xmldom');
const xml = `<?xml version="1.0" encoding="UTF-8"?><w:t>&lt;cfdi:Comprobante</w:t>`;
const doc = new DOMParser().parseFromString(xml, 'text/xml');
console.log(doc.getElementsByTagName('w:t')[0].textContent);
