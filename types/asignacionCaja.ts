export interface AsignacionCajaModel {
  id?: string;
  fecha: string; // YYYY-MM-DD
  carrierCodigo?: string;
  numeroCaja: string;
  subLinea: string;
  placasCaja: string;
  driverId: string;
  nombreDriver: string;
  placasTracto: string;
  notas?: string;
  createdAt?: string;
  updatedAt?: string;
}
