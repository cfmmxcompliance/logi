import { XMLParser } from 'fast-xml-parser';
import { CFDIInvoice, ItemLine } from './schema';

export function parseCFDI(xmlData: string): CFDIInvoice {
    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: ""
    });
    const jsonObj = parser.parse(xmlData);
    const comp = jsonObj['cfdi:Comprobante'];

    const invoice: CFDIInvoice = {
        header: {
            cfdi_version: comp?.Version,
            tipo_comprobante: comp?.TipoDeComprobante,
            uuid: comp?.['cfdi:Complemento']?.['tfd:TimbreFiscalDigital']?.UUID,
            folio: comp?.Folio,
            fecha_emision: comp?.Fecha,
            moneda: comp?.Moneda,
            tipo_cambio: comp?.TipoCambio,
            lugar_expedicion_cp: comp?.LugarExpedicion,
            exportacion_clave: comp?.Exportacion
        },
        emisor: {
            rfc: comp?.['cfdi:Emisor']?.Rfc,
            nombre: comp?.['cfdi:Emisor']?.Nombre,
            regimen: comp?.['cfdi:Emisor']?.RegimenFiscal
        },
        receptor: {
            rfc: comp?.['cfdi:Receptor']?.Rfc,
            nombre: comp?.['cfdi:Receptor']?.Nombre,
            residencia_fiscal: comp?.['cfdi:Receptor']?.ResidenciaFiscal,
            tax_id: comp?.['cfdi:Receptor']?.NumRegIdTrib,
            regimen: comp?.['cfdi:Receptor']?.RegimenFiscalReceptor
        },
        items: [],
        totals: {
            subtotal: comp?.SubTotal,
            total: comp?.Total
        },
        missing_fields: [],
        provenance: {}
    };

    // Add initial provenance for header
    invoice.provenance['header.uuid'] = { source: 'xml', confidence: 1.0 };

    const conceptos = comp?.['cfdi:Conceptos']?.['cfdi:Concepto'];
    const conceptoList = Array.isArray(conceptos) ? conceptos : (conceptos ? [conceptos] : []);

    conceptoList.forEach((c: any, idx: number) => {
        const item: ItemLine = {
            line_no: idx + 1,
            sku: c.NoIdentificacion,
            descripcion: c.Descripcion,
            cantidad: parseFloat(c.Cantidad),
            unidad_cfdi: c.Unidad,
            clave_unidad: c.ClaveUnidad,
            clave_prodserv: c.ClaveProdServ,
            valor_unitario: parseFloat(c.ValorUnitario),
            importe: parseFloat(c.Importe),
            atributos_extra: {},
            missing: []
        };

        // Extract hidden data from Description using regex
        const vinMatch = c.Descripcion.match(/VIN\s+([A-Z0-9]{17,})/i);
        if (vinMatch) item.vin = vinMatch[1];

        const engineMatch = c.Descripcion.match(/ENGINE\s+([A-Z0-9\-\/]+)/i);
        if (engineMatch) item.motor = engineMatch[1];

        const weightNetMatch = c.Descripcion.match(/PESO\s+NETO\s+([0-9\.]+)\s*KG/i);
        if (weightNetMatch) item.peso_neto = parseFloat(weightNetMatch[1]);

        const weightGrossMatch = c.Descripcion.match(/PESO\s+BRUTO\s+([0-9\.]+)/i);
        if (weightGrossMatch) item.peso_bruto = parseFloat(weightGrossMatch[1]);

        const valAgregadoMatch = c.Descripcion.match(/Val\.\s+Agregado\s+USD\s+([0-9\.]+)/i);
        if (valAgregadoMatch) item.atributos_extra.valor_agregado = parseFloat(valAgregadoMatch[1]);

        invoice.items.push(item);
    });

    return invoice;
}
