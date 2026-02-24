
import { parseCFDI } from './xmlParser';
import { resolveWithPDFText } from './resolvers';
import { CFDIInvoice } from './schema';

export async function extractCFDIInvoice(xmlData: string, pdfText?: string): Promise<CFDIInvoice> {
    // Phase 1: Primary XML Extraction
    let invoice = parseCFDI(xmlData);

    // Phase 2: PDF Fallback/Enrichment if available
    if (pdfText) {
        invoice = resolveWithPDFText(invoice, pdfText);
    }

    // Phase 3: Final Validation & Flagging
    validateInvoice(invoice);

    return invoice;
}

/**
 * @param {CFDIInvoice} invoice
 */
function validateInvoice(invoice) {
    const requiredGlobal = ['header.uuid', 'header.fecha_emision', 'header.moneda'];
    const requiredItem = ['vin', 'sku', 'cantidad'];

    requiredGlobal.forEach(key => {
        const k = key.split('.')[1];
        if (!invoice.header[k]) {
            if (!invoice.missing_fields) invoice.missing_fields = [];
            invoice.missing_fields.push(key);
        }
    });

    if (invoice.items) {
        invoice.items.forEach((item, idx) => {
            requiredItem.forEach(field => {
                if (!item[field]) {
                    if (!item.missing) item.missing = [];
                    item.missing.push(field);
                }
            });
        });
    }
}
