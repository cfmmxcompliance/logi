
/**
 * xmlFinancialParser.ts
 * Extracts detailed financial and contribution execution data from VUCEM Pedimento XMLs.
 * Targets specific tax keys (DTA, IGI, IVA, PRV) for financial reporting.
 */

export interface PedimentoFinancials {
    pedimentoNum: string;
    clavePedimento: string; // A1, AF, etc.
    fechaPago: string;
    montoPagado: number; // Cash total
    lineaCaptura: string;
    banco?: string; // Payment Bank
    valorAduana: number;

    // Taxes / Contribuciones
    dta: number; // Clave 1
    igi: number; // Clave 6
    iva: number; // Clave 3
    prv: number; // Clave 21/15
    ivaPrv: number; // Calculated or separate? Usually PRV is straight fee.
    cnt: number; // Clave 11? Fee?

    // Supplier Info (From first invoice or header)
    supplierName: string;
    supplierTaxId: string;
    supplierCountry: string;
}

export const parsePedimentoFinancials = (xmlStr: string): PedimentoFinancials => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlStr, "text/xml");

    // Helper for namespaced tags
    const getTxt = (tag: string, parent: Element | Document = doc) => {
        const els = parent.getElementsByTagName("*");
        for (let i = 0; i < els.length; i++) {
            if (els[i].localName === tag) return els[i].textContent || "";
        }
        return "";
    };

    // 1. Header Info
    const pedimentoNum = getTxt("numeroPedimento") || "";
    const clavePedimento = getTxt("clavePedimento") || "";
    const fechaPago = getTxt("fechaPago") ? `${getTxt("fechaPago")} ${getTxt("horaPago") || ''}`.trim() : "";
    const lineaCaptura = getTxt("lineaCaptura") || "";

    // 2. Totals
    const totalEfectivo = parseFloat(getTxt("totalEfectivo") || "0");
    const valorAduana = parseFloat(getTxt("valorAduana") || "0"); // Usually in header

    // 3. Contributions (Iterate all <contribucion> or <tasas>)
    let dta = 0;
    let igi = 0;
    let iva = 0;
    let prv = 0;
    let cnt = 0;

    // VUCEM XML structure for contributions often varies (partida level vs global). 
    // We look for global <contribuciones> or <tasas> at document level for the SUMMARY.
    // NOTE: Some XMLs sum up at the bottom.

    const contribNodes = doc.getElementsByTagName("*");
    for (let i = 0; i < contribNodes.length; i++) {
        // Look for nodes that look like simple contributions (clave + importe)
        // Typically <contribucion clave="1" importe="500" ... /> or nested tags
        if (contribNodes[i].localName === "contribucion") {
            const clave = contribNodes[i].getAttribute("clave") || getTxt("clave", contribNodes[i]);
            const importe = parseFloat(contribNodes[i].getAttribute("importe") || getTxt("importe", contribNodes[i]) || "0");

            if (clave === "1") dta += importe;
            if (clave === "6") igi += importe;
            if (clave === "3") iva += importe;
            if (clave === "15" || clave === "21") prv += importe;
            // Fee/Other?
        }
    }

    // 4. Supplier Info (Try to find first <factura> or <proveedor>)
    let supplierName = "";
    let supplierTaxId = "";
    let supplierCountry = "";

    const proveedores = doc.getElementsByTagName("*");
    for (let i = 0; i < proveedores.length; i++) {
        if (proveedores[i].localName === "proveedor" || proveedores[i].localName === "emisor") {
            supplierName = getTxt("nombre", proveedores[i]);
            supplierTaxId = getTxt("identificacion", proveedores[i]);
            // Country usually in address
            const domicilio = proveedores[i].getElementsByTagName("*");
            for (let j = 0; j < domicilio.length; j++) {
                if (domicilio[j].localName === "pais") supplierCountry = domicilio[j].textContent || "";
            }
            if (supplierName) break; // Take first one
        }
    }

    return {
        pedimentoNum,
        clavePedimento,
        fechaPago,
        montoPagado: totalEfectivo,
        lineaCaptura,
        banco: getTxt("institucionBancaria") || getTxt("banco") || getTxt("claveBanco"),
        valorAduana,
        dta,
        igi,
        iva,
        prv,
        ivaPrv: 0, // Hard to extract without specific 'IVA sobre PRV' logic, usually calculated
        cnt,
        supplierName,
        supplierTaxId,
        supplierCountry
    };
};
