export type VentanaEstatus = 'Disponible' | 'Parcial' | 'Llena' | 'Cerrada' | 'Cancelada';

export interface VentanaCarga53 {
  id?: string;
  fecha: string;           // YYYY-MM-DD
  horaInicio: string;      // HH:mm
  horaFin: string;         // HH:mm
  capacidadCajas: number;
  cajasReservadas: number;
  cajasDisponibles: number; // = capacidadCajas - cajasReservadas
  estatus: VentanaEstatus;
  creadoPor: string;
  creadoEn: string;
  actualizadoPor: string;
  actualizadoEn: string;
}
