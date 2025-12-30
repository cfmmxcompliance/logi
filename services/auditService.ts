import { AuditDiscrepancy, AuditReport, CommercialInvoiceItem, DSItemData } from '../types';

export const auditService = {
    runAudit: (pedimentoId: string, items: DSItemData[], invoices: CommercialInvoiceItem[]): AuditReport => {
        const discrepancies: AuditDiscrepancy[] = [];

        // Stats
        let pedimentoTotal = 0;
        let invoiceTotal = 0;

        // 1. Index Commercial Invoice Items for fast lookup
        // Map: InvoiceNo -> PartNo -> Item[] (Handling duplicate part numbers)
        const invoiceMap = new Map<string, Map<string, CommercialInvoiceItem[]>>();

        invoices.forEach(inv => {
            if (!invoiceMap.has(inv.invoiceNo)) {
                invoiceMap.set(inv.invoiceNo, new Map());
            }
            const partMap = invoiceMap.get(inv.invoiceNo)!;
            const cleanPart = normalizePartNumber(inv.partNo);

            if (!partMap.has(cleanPart)) {
                partMap.set(cleanPart, []);
            }
            partMap.get(cleanPart)!.push(inv);

            invoiceTotal += inv.totalAmount;
        });

        // 2. Iterate Pedimento Items and Match
        items.forEach(pItem => {
            pedimentoTotal += pItem.valorDolares;

            const pInvoiceNo = pItem.invoiceNo || "";
            const pPartNo = normalizePartNumber(pItem.partNumber || "");

            // A. Check if Invoice Exists
            if (!invoiceMap.has(pInvoiceNo)) {
                discrepancies.push(createDiscrepancy(
                    pItem,
                    'MISSING_IN_INVOICE',
                    `Invoice ${pInvoiceNo} not found in imported invoices.`,
                    'CRITICAL',
                    pItem.valorDolares,
                    0
                ));
                return;
            }

            const partMap = invoiceMap.get(pInvoiceNo)!;

            // B. Match Part Number
            // Try Exact Match
            let matchedInvItems = partMap.get(pPartNo);

            // Try Heuristic Match (if PartNo is empty/dash but description might match - tricky, skipping for now for safety)
            // Implementation note: Strict Part Number match is preferred for "Zero Fines".

            if (!matchedInvItems || matchedInvItems.length === 0) {
                discrepancies.push(createDiscrepancy(
                    pItem,
                    'PART_NUMBER',
                    `Part Number ${pItem.partNumber} not found in Invoice ${pInvoiceNo}.`,
                    'HIGH',
                    pItem.partNumber || "N/A",
                    "N/A"
                ));
                return;
            }

            // C. Compare Values (Aggregation needed if multiple invoice lines match one pedimento item, or vice versa)
            // Scenario: 1 Pedimento Item <-> 1 Invoice Line (Ideal)
            // Scenario: 1 Pedimento Item <-> N Invoice Lines (Consolidated)

            const invQty = matchedInvItems.reduce((sum, item) => sum + item.qty, 0);
            const invTotal = matchedInvItems.reduce((sum, item) => sum + item.totalAmount, 0);

            // C1. Quantity Check
            if (pItem.cantidadComercial !== invQty) {
                discrepancies.push(createDiscrepancy(
                    pItem,
                    'QUANTITY',
                    `Quantity mismatch: Pedimento=${pItem.cantidadComercial}, Invoice=${invQty}`,
                    'CRITICAL',
                    pItem.cantidadComercial,
                    invQty
                ));
            }

            // C2. Value Check (Tolerance $1.00)
            if (Math.abs(pItem.valorDolares - invTotal) > 1.0) {
                discrepancies.push(createDiscrepancy(
                    pItem,
                    'VALUE_USD',
                    `Value mismatch: Pedimento=$${pItem.valorDolares.toFixed(2)}, Invoice=$${invTotal.toFixed(2)}`,
                    'HIGH',
                    pItem.valorDolares,
                    invTotal
                ));
            }
        });

        return {
            id: crypto.randomUUID(),
            date: new Date().toISOString(),
            pedimentoId,
            totalDiscrepancies: discrepancies.length,
            totalValueStats: {
                pedimentoTotal,
                invoiceTotal,
                difference: pedimentoTotal - invoiceTotal
            },
            discrepancies
        };
    }
};

// Helpers
const normalizePartNumber = (pn: string): string => {
    if (!pn) return "";
    // Remove dashes, spaces, slashes
    return pn.replace(/[- \/]/g, "").toUpperCase();
};

const createDiscrepancy = (
    item: DSItemData,
    type: AuditDiscrepancy['type'],
    desc: string,
    sev: AuditDiscrepancy['severity'],
    pVal: string | number,
    iVal: string | number
): AuditDiscrepancy => {
    return {
        id: crypto.randomUUID(),
        pedimentoId: item.pedimento,
        itemSecuencia: item.secuencia,
        invoiceNo: item.invoiceNo || "N/A",
        partNumber: item.partNumber || "N/A",
        description: desc,
        type,
        severity: sev,
        pedimentoValue: pVal,
        invoiceValue: iVal,
        difference: typeof pVal === 'number' && typeof iVal === 'number' ? pVal - iVal : 0,
        status: 'OPEN'
    };
};
