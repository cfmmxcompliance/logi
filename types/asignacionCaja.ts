export interface AsignacionCajaModel {
  id?: string;
  fecha: string; // YYYY-MM-DD
  horaAsignacion?: string; // HH:mm
  carrierCodigo?: string;
  numeroCaja: string;
  numeroOperacion?: string;
  subLinea: string;
  placasCaja: string;
  driverId: string;
  nombreDriver: string;
  placasTracto: string;
  modeloAsignado?: string;
  notas?: string;
  createdAt?: string;
  updatedAt?: string;
}
