export interface CajaModel {
  NumeroCaja: string; // Identifier
  carrierCodigo: string; // Relational bridge
  TransportLine: string;
  nombreSubLinea?: string; // New: NOMBRE SUB-LÍNEA
  claveApendice10?: string; // Relational lookup with Anexo 22
  TipoCaja: string;
  placas?: string;
  createdAt?: string;
  updatedAt?: string;
}
