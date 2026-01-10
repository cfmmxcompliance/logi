
export interface VucemConfig {
    rfc: string;
    keyFile: File | null;
    cerFile: File | null;
    password: string;
}

export interface EdocumentQuery {
    edocument: string;
    adenda?: string;
}

// COVE Data Structures matching the XSD
export interface Cove {
    eDocument: string;
    tipoOperacion: string;
    numeroFacturaRelacionFacturas: string;
    relacionFacturas?: string;
    fechaExpedicion: string;
    tipoFigura: string;
    facturas: Factura[];
    emisor: PersonaCove;
    destinatario: PersonaCove;
    mercancias?: Mercancia[];
    patentesAduanales?: string[];
    rfcsConsulta?: string[];
    observaciones?: string;
}

export interface Factura {
    numeroFactura: string;
    certificadoOrigen?: number;
    subdivision?: number;
    emisor?: PersonaCove;
    destinatario?: PersonaCove;
    mercancias: Mercancia[];
}

export interface PersonaCove {
    tipoIdentificador: number;
    identificacion: string;
    nombre?: string;
    apellidoPaterno?: string;
    apellidoMaterno?: string; // Optional
    domicilio: DomicilioCove;
}

export interface DomicilioCove {
    calle: string;
    numeroExterior: string;
    numeroInterior?: string;
    colonia?: string;
    localidad?: string;
    municipio?: string;
    entidadFederativa?: string;
    pais: string;
    codigoPostal: string;
}

export interface Mercancia {
    descripcionGenerica: string;
    claveUnidadMedida: string;
    tipoMoneda: string;
    cantidad: number;
    valorUnitario: number;
    valorTotal: number;
    valorDolares: number;
    descripcionesEspecificas?: DetalleMercancia[];
}

export interface DetalleMercancia {
    marca?: string;
    modelo?: string;
    subModelo?: string;
    numeroSerie?: string;
}

export interface VucemError {
    mensaje: string;
    code?: string;
}

export interface ConsultarEdocumentResponse {
    contieneError: boolean;
    errores?: string[];
    resultadoBusqueda?: {
        cove?: Cove;
        adenda?: any; // Define properly if needed
    };
}
