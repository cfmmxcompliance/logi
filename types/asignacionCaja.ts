export interface AsignacionCajaModel {
  id?: string;
  fecha: string; // YYYY-MM-DD
  horaAsignacion?: string; // HH:mm
  arribo?: string;          // HH:mm — hora real de arribo
  arriboAt?: string;        // ISO timestamp completo del momento de registro de arribo
  arriboBy?: string;        // Email del usuario que registró el arribo
  comentariosArribo?: string; // max 50 chars
  dockArribo?: string;      // DOCK 1..13 — asignado desde handheld
  carrierCodigo?: string;
  scac?: string;              // TransportLine name shown in SCAC column (e.g. MXTL)
  customId?: string;          // Structured ID: {numeroOperacion}{YYYYMMDD}{carrierCodigo}{scac}
  transportLineId?: string; // FK -> TransportLine (Razón Social)
  numeroCaja: string;
  numeroOperacion?: string;
  subLinea: string;
  placasCaja: string;
  driverId: string;
  nombreDriver: string;
  placasTracto: string;
  modeloAsignado?: string;
  dealerAsignado?: string;
  observaciones?: string;
  carrierRef?: string;          // Referencia manual del carrier (ej. CFM-26CFTTN-...)
  notas?: string;
  // Bridge fields (set when created from ReservaVentanas53)
  reservaId?: string;         // ID of the linked ReservaVentana53
  ventanaId?: string;         // ID of the linked VentanaCarga53
  cajasReservadas?: number;   // How many cajas were reserved (for capacity restore)
  demandaId?: string;
  carrierId?: string;
  origen?: string;
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  layoutUrl?: string;
  layoutUploadedBy?: string;
  layoutUploadedAt?: string;
  ccpUrl?: string;
  ccpUploadedBy?: string;
  ccpUploadedAt?: string;
  anexo29Url?: string;
  anexo29UploadedBy?: string;
  anexo29UploadedAt?: string;
  anexo29FileName?: string;
  workingWasAvailable?: boolean;  // set true permanently when barcode+no arribo+no dock+>1h
  isDealer?: boolean;
}
