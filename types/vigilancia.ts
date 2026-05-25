// ─────────────────────────────────────────────────────────────────────────────
// types/vigilancia.ts
// Inspección de 7 puntos + fotos de placas (Caja y Tracto) por asignación.
// ─────────────────────────────────────────────────────────────────────────────

export interface VigilanciaRecord {
  id?: string;

  // Referencia a la asignación del día
  fecha: string;                   // YYYY-MM-DD
  asignacionCajaId: string;
  numeroCaja: string;

  // Auditoría
  usuario: string;
  fechaHoraRegistro: string;
  createdAt?: string;

  // ── Fotos de Placas ──
  fotoPlacasCaja?: string;         // URL en Drive
  fotoPlacasTracto?: string;

  // ── Tarjeta de Licencia ──
  fotoLicencia?: string;           // URL en Drive
  licenciaExtraida?: {
    nombre?: string;
    numeroLicencia?: string;
    tipo?: string;
    fechaNacimiento?: string;
    fechaVencimiento?: string;
    estado?: string;
    curp?: string;
  };

  // ── 7 Puntos de Inspección ──
  fotoLadoIzquierdo?: string;      // Left Side
  fotoTecho?: string;              // Ceiling / Roof
  fotoParedFrontal?: string;       // Front Wall
  fotoPuertas?: string;            // Inside / Outside Doors
  fotoLadoDerecho?: string;        // Right Side
  fotoPisoInterior?: string;       // Inside Floor
  fotoParteBaja?: string;          // Outside / Undercarriage

  // ── Validación física previa ──
  validacionChofer?: boolean;
  validacionCaja?: boolean;
  validacionTracto?: boolean;
  placasCajaFisica?: string;       // Placas capturadas en físico por el chofer
  placasTractoFisica?: string;
  discrepancia?: boolean;
  discrepanciaDetalle?: string;    // Detalle libre si hubo discrepancia
}
