import { XMLCIRecord } from '../types.ts';
import { storageService } from './storageService.ts';

export const xmlciService = {
    extractRecord: (xmlDoc: Document, invoiceNo: string, date: string, currency: string, uuid: string, fileName: string = ''): XMLCIRecord | null => {
        try {
            const comprobante = xmlDoc.getElementsByTagName("cfdi:Comprobante")[0] || xmlDoc.getElementsByTagName("Comprobante")[0];
            const emisor = xmlDoc.getElementsByTagName("cfdi:Emisor")[0] || xmlDoc.getElementsByTagName("Emisor")[0];

            if (!comprobante || !emisor) return null;

            const emisorRfc = emisor.getAttribute("Rfc") || "";
            const emisorNombre = emisor.getAttribute("Nombre") || "";

            // For TipoDeComprobante='T' (Traslado), Total is always 0.00 (fiscal).
            // The real commercial value is the sum of each Concepto's Importe.
            const tipoComp = comprobante.getAttribute("TipoDeComprobante") || "";
            let totalVal = parseFloat(comprobante.getAttribute("Total") || comprobante.getAttribute("total") || "0");
            if (tipoComp === "T") {
                const conceptos = xmlDoc.getElementsByTagName("cfdi:Concepto");
                totalVal = Array.from(conceptos)
                    .reduce((sum, c) => sum + parseFloat(c.getAttribute("Importe") || "0"), 0);
            }
            const exchangeRate = parseFloat(comprobante.getAttribute("TipoCambio") || comprobante.getAttribute("tipoCambio") || "1");

            // Attempt to find Incoterm in Comercio Exterior complement
            let extractedIncoterm = "FCA";
            const cce = xmlDoc.getElementsByTagName("cce11:ComercioExterior")[0] || xmlDoc.getElementsByTagName("cce20:ComercioExterior")[0];
            if (cce) {
                extractedIncoterm = cce.getAttribute("Incoterm") || "FCA";
            }

            // Attempt to find Domicilio
            let emisorDomicilio = comprobante.getAttribute("LugarExpedicion") || "MÉXICO";
            const domFiscal = xmlDoc.getElementsByTagName("cfdi:DomicilioFiscal")[0];
            if (domFiscal) {
                const calle = domFiscal.getAttribute("calle") || "";
                const nExt = domFiscal.getAttribute("noExterior") || "";
                const cp = domFiscal.getAttribute("codigoPostal") || "";
                const mnpio = domFiscal.getAttribute("municipio") || "";
                const edo = domFiscal.getAttribute("estado") || "";
                emisorDomicilio = `${calle} ${nExt}, CP ${cp}, ${mnpio} ${edo}`.trim();
            }

            const docCurrency = (comprobante.getAttribute("Moneda") || "USD").toUpperCase();

            const record: XMLCIRecord = {
                id: uuid || `${invoiceNo}-${emisorRfc}`,
                idFiscal: emisorRfc,
                nombre: emisorNombre,
                domicilio: emisorDomicilio,
                vinculacion: "SI",
                invoiceNo: invoiceNo,
                fecha: date,
                incoterm: extractedIncoterm,
                moneda: docCurrency,
                valMonFact: totalVal,
                factorMoneda: exchangeRate || 1,
                valDolares: docCurrency === 'USD' ? totalVal : (totalVal / (exchangeRate || 1)),
                uuid: uuid,
                archivo: fileName,
                updatedAt: new Date().toISOString()
            };

            return record;
        } catch (error) {
            console.error("Error in xmlciService:", error);
            return null;
        }
    }
};
