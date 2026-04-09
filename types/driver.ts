export interface DriverModel {
  driverId: string;
  nombre: string;
  licencia: string;
  telefono: string;
  placasTracto?: string;
  carrierCodigo: string; // Relacional FK
  transportLineId?: string; // FK -> TransportLine (Raón Social)
  createdAt?: string;
  updatedAt?: string;
}
