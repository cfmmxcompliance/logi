export interface DriverModel {
  driverId: string;
  nombre: string;
  licencia: string;
  telefono: string;
  placasTracto?: string;
  carrierCodigo: string; // Relacional FK
  createdAt?: string;
  updatedAt?: string;
}
