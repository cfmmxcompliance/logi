export interface ContratoRecord {
  id?: string;
  numeroOperacion: string;
  numeroCaja: string;
  selloAsignado: string;
  scac?: string;
  contrato: string;
  contrato2?: string;
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
  cerrado?: boolean;
  carrierRef?: string;
  observaciones?: string;
}
