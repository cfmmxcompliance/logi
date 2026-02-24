

/** @typedef {import('./schema.js').CFDIInvoice} CFDIInvoice */

/**
 * @param {CFDIInvoice} invoice
 * @param {string} pdfText
 * @returns {CFDIInvoice}
 */
export function resolveWithPDFText(invoice, pdfText) {
    // 1. Resolve Incoterm
    const incotermMatch = pdfText.match(/Incoterm\s+([A-Z]{3})/i);
    if (incotermMatch) {
        invoice.header.incoterm = incotermMatch[1].toUpperCase();
        invoice.provenance['header.incoterm'] = { source: 'pdf', confidence: 0.9 };
    }

    // 2. Resolve Destinatario (Tax ID / Name)
    const destinatarioBlock = pdfText.match(/Destinatario\s+(.+?)(?:\r?\n|$)/i);
    if (destinatarioBlock) {
        invoice.receptor.destinatario_raw = destinatarioBlock[1].trim();
        const taxIdMatch = invoice.receptor.destinatario_raw.match(/TAX\s*ID:\s*([A-Z0-9\-]+)/i);
        if (taxIdMatch) {
            invoice.receptor.tax_id = taxIdMatch[1];
            invoice.provenance['receptor.tax_id'] = { source: 'pdf', confidence: 0.85 };
        }
    }

    // 3. Resolve Global Weights if missing in items
    const netTotalMatch = pdfText.match(/PESO\s+NETO\s+TOTAL\s+([0-9\.]+)\s*KG/i);
    if (netTotalMatch) {
        invoice.totals.peso_neto_total = parseFloat(netTotalMatch[1]);
    }

    const grossTotalMatch = pdfText.match(/PESO\s+BRUTO\s+TOTAL\s+([0-9\.]+)\s*KG/i);
    if (grossTotalMatch) {
        invoice.totals.peso_bruto_total = parseFloat(grossTotalMatch[1]);
    }

    // 4. Resolve Brand/Model
    const brandMatch = pdfText.match(/Brand\s*\/\s*Marca:\s*([^\n\r]+)/i);
    if (brandMatch) {
        invoice.header.brand = brandMatch[1].trim();
    }

    const modelMatch = pdfText.match(/Model\s*\/\s*Modelo:\s*([^\n\r]+)/i);
    if (modelMatch) {
        invoice.header.model = modelMatch[1].trim();
    }

    return invoice;
}
