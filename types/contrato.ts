export interface ContratoRecord {
  id?: string;
  numeroOperacion: string;
  numeroCaja: string;
  selloAsignado: string;
  scac?: string;
  contrato: string;
  contrato2?: string;
  factura?: string; // Número de factura aduanera (报关发票号) — opcional
  fotoUrlContrato1?: string;
  fotoUrlContrato2?: string;
  fotoUrlFactura?: string;
  xmlUrl?: string; // URL del XML subido
  xmlUUID?: string; // UUID SAT extraído del CFDI
  xmlUploadedBy?: string;
  xmlUploadedAt?: string;
  xmlFileName?: string;
  fecha: string; // YYYY-MM-DD for easy filtering
  createdAt: string;
  usuario: string; // Email of the user who captured it
  asignadoA?: string; // User assigned to this record
  layoutUrl?: string;
  layoutUploadedBy?: string;
  layoutUploadedAt?: string;
  layoutFileName?: string;
  ccpUrl?: string;
  ccpUploadedBy?: string;
  ccpUploadedAt?: string;
  ccpFileName?: string;
  anexo29Url?: string;
  anexo29UploadedBy?: string;
  anexo29UploadedAt?: string;
  anexo29FileName?: string;
  cerrado?: boolean;
  carrierRef?: string;
  observaciones?: string;
  dealerAsignado?: string;
}
