
export interface Evidence {
    source: 'xml' | 'pdf' | 'ai';
    confidence: number;
}

export interface Party {
    rfc?: string;
    nombre?: string;
    regimen?: string;
    residencia_fiscal?: string;
    tax_id?: string;
    domicilio_texto?: string;
}

export interface ItemLine {
    line_no: number;
    sku: string;
    descripcion: string;
    cantidad: number;
    unidad_cfdi?: string;
    clave_unidad?: string;
    clave_prodserv?: string;
    valor_unitario: number;
    importe: number;
    peso_neto?: number;
    peso_bruto?: number;
    vin?: string;
    motor?: string;
    atributos_extra: Record<string, any>;
    missing: string[];
}

export interface CFDIInvoice {
    header: Record<string, any>;
    emisor: Party;
    receptor: Party;
    items: ItemLine[];
    totals: Record<string, any>;
    missing_fields: string[];
    provenance: Record<string, Evidence>;
}
