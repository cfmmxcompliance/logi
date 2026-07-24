export interface ContratoRecord {
  id?: string;
  numeroOperacion: string;
  numeroCaja: string;
  selloAsignado: string;
  contrato: string;
  fecha: string; // YYYY-MM-DD for easy filtering
  createdAt: string;
  usuario: string; // Email of the user who captured it
}
