export type DemandaEstatus =
  | 'Borrador'
  | 'Confirmada'
  | 'Enviada a carriers'
  | 'En proceso de reserva'
  | 'Completada'
  | 'Cancelada';

export interface DemandaCarga53 {
  id?: string;
  fechaDemanda: string;           // YYYY-MM-DD
  estatus: DemandaEstatus;
  totalUnidadesDemandadas: number;
  totalCajasSolicitadas: number;
  observaciones?: string;
  creadoPor: string;              // email
  creadoEn: string;              // ISO timestamp
  actualizadoPor: string;
  actualizadoEn: string;
  confirmadoPor?: string;
  confirmadoEn?: string;
}

export interface DemandaItem53 {
  id?: string;
  productoId: string;
  estilo: string;
  modelo: string;
  cantidadDemandada: number;
  unidadesPorCaja53: number;
  cajasSolicitadas: number;       // Math.ceil(cantidadDemandada / unidadesPorCaja53)
}
