export interface DriverModel {
  driverId: string;
  nombre: string;
  licencia: string;
  tipoLicencia?: string;
  telefono: string;
  placasTracto?: string;
  carrierCodigo: string; // Relacional FK
  transportLineId?: string; // FK -> TransportLine (Raón Social)
  createdAt?: string;
  updatedAt?: string;
}
