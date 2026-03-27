export interface TransportLineModel {
  transportLineId: string; // Identifier
  carrierCodigo: string; // Relational bridge to Carrier
  TransportLine: string; // Brand or internal name
  nombreSubLinea?: string; // Sub-linea classification (Replaces array concept)
  razonSocial: string; // Legal entity name
  createdAt?: string;
  updatedAt?: string;
}
