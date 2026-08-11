export interface CheckInModel {
  id?: string;
  asignacionCajaId: string | null;
  numeroOperacion: string;
  carrierRef: string;
  checkInAt: string;
  checkInStatus: string;
  numeroCaja: string;
  placasTracto: string;
  numeroTracto?: string;
  nombreDriver?: string;
  fechaAgendada?: string;
  horaAgendada?: string;
  scac: string;
  transportista: string;
  processed: boolean;
  celular?: string;
  dockAsignado?: string;
}
