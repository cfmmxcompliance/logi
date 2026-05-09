export type ReservaEstatus = 'Reservada' | 'Confirmada' | 'Rechazada' | 'Cancelada' | 'Completada';

export interface ReservaVentana53 {
  id?: string;
  demandaId: string;
  ventanaId: string;
  carrierId: string;         // email or SCAC of carrier user
  carrierNombre: string;
  fechaCarga: string;        // YYYY-MM-DD
  horaInicio: string;        // HH:mm
  horaFin: string;           // HH:mm
  cajasReservadas: number;
  numeroCaja?: string;       // Trailer / unit number (optional at reservation time)
  placas?: string;
  economico?: string;
  driverId?: string;
  operador?: string;
  telefonoOperador?: string;
  estatus: ReservaEstatus;
  comentarios?: string;
  creadoPor: string;
  creadoEn: string;
  actualizadoPor: string;
  actualizadoEn: string;
  confirmadoPor?: string;
  confirmadoEn?: string;
}
