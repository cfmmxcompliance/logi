export interface FianzaRecord {
    id: string;
    pedimento: string;
    nombre: string;
    provisionado: number;
    fechaRegistro?: string;
    pagado: number;
    fechaPago?: string;
    saldoInicial: number;
    saldoFinal: number;
}
