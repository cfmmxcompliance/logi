export interface AsignacionCajaModel {
  id?: string;
  fecha: string; // YYYY-MM-DD
  horaAsignacion?: string; // HH:mm
  arribo?: string;          // HH:mm — hora real de arribo
  comentariosArribo?: string; // max 50 chars
  carrierCodigo?: string;
  transportLineId?: string; // FK -> TransportLine (Razón Social)
  numeroCaja: string;
  numeroOperacion?: string;
  subLinea: string;
  placasCaja: string;
  driverId: string;
  nombreDriver: string;
  placasTracto: string;
  modeloAsignado?: string;
  observaciones?: string;
  notas?: string;
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
}
