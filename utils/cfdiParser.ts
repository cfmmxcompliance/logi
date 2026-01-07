
export interface CFDIResult {
    uuid: string;
    invoiceNo: string;
    date: string;
    amount: number;
    currency: string;
    senderMatches: boolean;
    senderName: string;
    receiverName: string;
    description: string;
    extractedBl?: string;
    extractedContainer?: string;
    items?: {
        description: string;
        quantity: number;
        unit: string;
        unitValue: number;
        amount: number;
        claveProdServ: string;
        claveUnidad: string;
    }[];
    taxDetails?: {
        totalTransferred: number;
        totalRetained: number;
    };
}

export const parseCFDI = async (file: File): Promise<CFDIResult> => {
    const text = await file.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(text, "text/xml");

    // Namespaces often used in CFDI
    // We can just query selector by tag name usually, handling prefixes if needed.

    // 1. Get Comprobante (Root) attributes
    const comprobante = xmlDoc.getElementsByTagName("cfdi:Comprobante")[0] || xmlDoc.getElementsByTagName("Comprobante")[0];
    if (!comprobante) throw new Error("Invalid CFDI: Comprobante node not found/missing prefix");

    // 4. Get TimbreFiscalDigital (Robust Namespace Handling)
    // Often nested: Comprobante -> Complemento -> TimbreFiscalDigital
    let timbre: Element | null = null;
    const complemento = xmlDoc.getElementsByTagName("cfdi:Complemento")[0] || xmlDoc.getElementsByTagName("Complemento")[0];

    if (complemento) {
        // Try direct children scan to avoid namespace issues
        for (let i = 0; i < complemento.children.length; i++) {
            const child = complemento.children[i];
            if (child.tagName.includes("TimbreFiscalDigital")) {
                timbre = child;
                break;
            }
        }
    }

    // Fallback global search if not found in Complemento structure
    if (!timbre) {
        timbre = xmlDoc.getElementsByTagName("tfd:TimbreFiscalDigital")[0] || xmlDoc.getElementsByTagName("TimbreFiscalDigital")[0];
    }

    const uuid = timbre?.getAttribute("UUID") || "";

    // Date Logic: Robust with Regex Fallback
    let dateStr = "";
    if (timbre) {
        dateStr = timbre.getAttribute("FechaTimbrado") || timbre.getAttribute("fechaTimbrado") || "";
    }

    // Fallback 1: Comprobante Fecha
    if (!dateStr || dateStr.length < 5) {
        dateStr = comprobante.getAttribute("Fecha") || comprobante.getAttribute("fecha") || "";
    }

    // Fallback 2: Regex on Raw Text (Final Safety) - UPDATED AGGRESSIVE
    if (!dateStr || dateStr.length < 5) {
        // Matches: FechaTimbrado="2023..." or Fecha="2023..." with spaces allowed
        const allDates = [...text.matchAll(/(FechaTimbrado|Fecha|fecha)\s*=\s*["']([^"']+)["']/gi)];

        // Priority 1: FechaTimbrado
        const tfd = allDates.find(m => m[1].toLowerCase().includes('timbrado'));
        if (tfd) dateStr = tfd[2];

        // Priority 2: Any Fecha
        else if (allDates.length > 0) dateStr = allDates[0][2];
    }

    console.log("CFDI Parser Debug:", { uuid, dateRaw: dateStr, method: "Regex/Attr Mixed" });
    const date = dateStr.split('T')[0];

    const amount = parseFloat(comprobante.getAttribute("Total") || "0");
    const currency = comprobante.getAttribute("Moneda") || "MXN";

    // 2. Get Emisor (Sender)
    const emisor = xmlDoc.getElementsByTagName("cfdi:Emisor")[0] || xmlDoc.getElementsByTagName("Emisor")[0];
    const senderName = emisor?.getAttribute("Nombre") || "";

    // 3. Get Receptor (Receiver)
    const receptor = xmlDoc.getElementsByTagName("cfdi:Receptor")[0] || xmlDoc.getElementsByTagName("Receptor")[0];
    const receiverName = receptor?.getAttribute("Nombre") || "";

    // 4. Get TimbreFiscalDigital (Already extracted above)
    // UUID extracted above

    // 5. Get Invoice Number (Folio/Serie)
    const serie = comprobante.getAttribute("Serie") || "";
    const folio = comprobante.getAttribute("Folio") || comprobante.getAttribute("folio") || "";
    const invoiceNo = (serie + folio) || uuid.split('-')[0]; // Fallback to partial UUID if no folio

    // 6. Get Description (Concepto)
    // 6. Get Description (Concepto) & Detailed Items
    let description = "";
    const conceptosList = xmlDoc.getElementsByTagName("cfdi:Concepto");
    const conceptosFallback = xmlDoc.getElementsByTagName("Concepto");
    const concepts = conceptosList.length > 0 ? conceptosList : conceptosFallback;

    const items: { description: string; quantity: number; unit: string; unitValue: number; amount: number; claveProdServ: string; claveUnidad: string; }[] = [];

    if (concepts.length > 0) {
        // Primary Description (First Item)
        description = concepts[0].getAttribute("Descripcion") || concepts[0].getAttribute("descripcion") || "";

        // Extract All Items
        for (let i = 0; i < concepts.length; i++) {
            const c = concepts[i];
            items.push({
                description: c.getAttribute("Descripcion") || c.getAttribute("descripcion") || "",
                quantity: parseFloat(c.getAttribute("Cantidad") || "0"),
                unit: c.getAttribute("Unidad") || "", // Often "Unidad" is human readable, ClaveUnidad is code
                unitValue: parseFloat(c.getAttribute("ValorUnitario") || "0"),
                amount: parseFloat(c.getAttribute("Importe") || "0"),
                claveProdServ: c.getAttribute("ClaveProdServ") || "",
                claveUnidad: c.getAttribute("ClaveUnidad") || ""
            });
        }
    }

    // 7. Extract Taxes (Global Summary)
    // Try to find global 'Impuestos' node (usually at end of Comprobante)
    let totalTransferred = 0;
    let totalRetained = 0;

    // Note: There might be multiple "Impuestos" nodes (one per Concepto, one Global).
    // We strictly want the Global one which usually has "TotalImpuestos..." attributes.
    // Iterating to find the one with totals.
    const impuestosNodes = xmlDoc.getElementsByTagName("cfdi:Impuestos");
    const impuestosFallbackNodes = xmlDoc.getElementsByTagName("Impuestos");
    const allImpuestos = [...Array.from(impuestosNodes), ...Array.from(impuestosFallbackNodes)];

    for (const imp of allImpuestos) {
        if (imp.hasAttribute("TotalImpuestosTrasladados") || imp.hasAttribute("TotalImpuestosRetenidos")) {
            totalTransferred = parseFloat(imp.getAttribute("TotalImpuestosTrasladados") || "0");
            totalRetained = parseFloat(imp.getAttribute("TotalImpuestosRetenidos") || "0");
            break; // Found the global summary
        }
    }

    console.log("CFDI Parser Debug (Desc & Items):", { description, itemsCount: items.length, taxes: { totalTransferred, totalRetained } });

    // Fallback: Regex on Raw Text (User Request: "Same as Date")
    if (!description || description.includes("No Desc")) {
        // Match Descripcion="Value"
        const descMatch = text.match(/(Descripcion|descripcion)\s*=\s*["']([^"']+)["']/i);
        if (descMatch) {
            description = descMatch[2];
            console.log("CFDI Parser Debug (Desc Regex):", description);
        }
    }

    if (!description) description = "XML Import (No Desc)";

    // 7. Enhanced BL Extraction
    let extractedBl = "";

    // Strict Validation Helper (Same as Controller.tsx)
    const isValidBlCandidate = (str: string) => {
        const clean = str.replace(/[^A-Z0-9]/g, '');
        const digits = (clean.match(/\d/g) || []).length;
        const letters = (clean.match(/[A-Z]/g) || []).length;
        // Logic: SCAC (4 char) + Num (5-12). 
        // Must have at least 5 digits to be a BL/Container.
        return digits >= 5 && letters >= 3 && letters <= 6 && clean.length >= 8 && clean.length <= 20;
    };

    // Regex for potential candidates (broad enough to catch, strict filter later)
    const blRegex = /([A-Z]{3,4}[0-9A-Z]{5,15})/gi;

    // Strategy 1: Description (Primary)
    // Strategy 1: Description (Primary & Only Source per User Request)
    if (description) {
        const matches = [...description.matchAll(blRegex)];
        const valid = matches.find(m => isValidBlCandidate(m[0]));
        if (valid) extractedBl = valid[0];
    }

    // REMOVED Global Scans to avoid "garbage" from digital seals (Sellos).
    // User Instruction: If not in Description/Observaciones, assume empty and let PDF parser handle it.

    // 8. Container Extraction
    // Logic: Look for standard ISO 6346 containers (4 letters, 7 digits).
    // Avoiding overlap with BLs can be tricky as formats are similar, 
    // but containers STRICTLY follow 4 alpha + 7 numeric.
    let extractedContainer = "";
    const containerRegex = /([A-Z]{4}[0-9]{7})/g;

    // Strategy 1: Description Only
    if (description) {
        const matches = description.match(containerRegex);
        // If matches found, verify it's not the same as BL (some BLs mimic container format)
        if (matches) {
            const candidate = matches.find(m => m !== extractedBl);
            if (candidate) extractedContainer = candidate;
            else if (matches.length > 0 && !extractedBl) extractedContainer = matches[0];
        }
    }

    return {
        uuid,
        invoiceNo,
        date,
        amount,
        currency,
        senderMatches: false, // To be checked by caller
        senderName,
        receiverName,
        description,
        extractedBl: extractedBl.toUpperCase(),
        extractedContainer: extractedContainer.toUpperCase(),
        items,
        taxDetails: { totalTransferred, totalRetained }
    };
};
