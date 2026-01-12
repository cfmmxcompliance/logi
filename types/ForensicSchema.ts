
// Senior Frontend Engineer: STRICT Schema for Phase 2 Forensic Extraction
// RULE: All fields are nullable. If data is missing in raw text, it must be null. 
// No guessing, no formatting enforcement beyond basic structure.

export interface ForensicSchema {
    metadata: {
        extractionDate: string;
        pageCount?: number;
        modelUsed?: string;
    };

    header: {
        pedimentoNumber?: { value: string; confidence: number; } | null;
        tipoOperacion?: string | null;
        clavePedimento?: string | null;
        regimen?: string | null;
        tipoCambio?: string | null;
        pesoBruto?: string | null;
        aduanaEntradaSalida?: string | null;
    };

    parties: {
        importer?: {
            name?: string | null;
            rfc?: string | null;
            address?: string | null;
        };
        supplier?: {
            name?: string | null;
            taxId?: string | null;
            address?: string | null;
        };
    };

    transport: {
        identification?: string | null;
        country?: string | null;
        shippingNumber?: string | null; // Guia / BL
        container?: {
            number?: string | null;
            type?: string | null;
        };
    };

    invoices: Array<{
        number: string;
        date?: string | null;
        incoterm?: string | null;
        amount?: number | null;
        currency?: string | null;
        factor?: number | null;
        dollarAmount?: number | null;
    }>;

    itemCount?: number;
    items: Array<{
        sequence?: number | null;
        fraction?: string | null;
        subdivision?: string | null;
        description?: string | null;
        unitPrice?: number | null;
        quantityUMC?: number | null;
        umc?: string | null;
        quantityUMT?: number | null;
        umt?: string | null;
        customsValue?: number | null; // Valor Aduana
        originCountry?: string | null;
        vendorCountry?: string | null;

        // Key Identifiers
        partNumber?: string | null;
        commercialInvoice?: string | null; // CI Identifier value or inferred
        fa?: string | null; // FA (Fixed Asset)

        identifiers?: Array<{ code: string; complement1?: string; complement2?: string }>;
        permissions?: Array<{ code: string; number: string; valueUsd?: number; quantity?: number }>;

        observations?: string | null;
    }>;

    amounts: {
        valorDolares?: number | null;
        valorAduana?: number | null;
        valorComercial?: number | null;
        fletes?: number | null;
        seguros?: number | null;
        otros?: number | null; // Otros Incrementables
        totalEfectivo?: number | null;
    };

    taxes: {
        [key: string]: number | null; // DTA, IVA, IGI, PREV, etc.
    };

    // Forensic Proof
    rawFragments: {
        headerFragment?: string | null;
        totalsFragment?: string | null;
        firstItemFragment?: string | null;
    };
}
