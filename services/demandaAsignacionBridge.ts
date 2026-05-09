import { collection, doc, setDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { ReservaVentana53 } from '../types/reservaVentana53';
import { DemandaCarga53, DemandaItem53 } from '../types/demandaCarga53';
import { asignacionCajaService } from './asignacionCajaService';

const COL_ASIGNACIONES = 'asignacion_cajas';

export interface BridgeResult {
  creados: number;
  omitidos: number;
}

/**
 * Non-destructive bridge between the new reserva module and the existing
 * asignacion_cajas collection. Generates one record per reserved caja.
 *
 * Rules:
 * - Anti-duplicate: if records with this reservaId already exist, skip.
 * - Uses getNextOperationNumber() to keep TLxxx consecutives per date.
 * - Adds technical traceability fields that don't break the existing UI.
 */
export const demandaAsignacionBridge = {
  async generarAsignacionesDesdeReserva(
    reserva: ReservaVentana53,
    demanda: DemandaCarga53,
    items: DemandaItem53[],
    userEmail: string,
  ): Promise<BridgeResult> {
    // Anti-duplicate guard
    const q = query(collection(db, COL_ASIGNACIONES), where('reservaId', '==', reserva.id));
    const existing = await getDocs(q);
    if (!existing.empty) {
      return { creados: 0, omitidos: existing.size };
    }

    const fecha = reserva.fechaCarga;
    const modelos = [...new Set(items.map(i => i.modelo))].join(', ');

    let totalCreados = 0;

    for (let cajaN = 1; cajaN <= reserva.cajasReservadas; cajaN++) {
      const operacion = await asignacionCajaService.getNextOperationNumber(fecha);
      const docId = `res_${reserva.id}_caja_${cajaN}`;
      const ref = doc(db, COL_ASIGNACIONES, docId);

      await setDoc(ref, {
        id: docId,
        // ── Campos visibles en la UI existente (no renombrar) ──────────
        fecha,
        horaAsignacion: reserva.horaInicio,
        numeroCaja: reserva.numeroCaja || 'PENDIENTE',
        numeroOperacion: operacion,
        subLinea: '',
        placasCaja: reserva.placas || 'PENDIENTE',
        driverId: reserva.driverId || 'PENDIENTE',
        nombreDriver: reserva.operador || 'PENDIENTE',
        placasTracto: reserva.placas || 'PENDIENTE',
        modeloAsignado: modelos,
        carrierCodigo: reserva.carrierId,
        observaciones: [
          `Demanda: ${reserva.demandaId}`,
          `Reserva: ${reserva.id}`,
          `Carrier: ${reserva.carrierNombre}`,
          `Caja ${cajaN} de ${reserva.cajasReservadas}`,
        ].join(' | '),
        // ── Campos técnicos de trazabilidad (no rompen UI) ─────────────
        demandaId: reserva.demandaId,
        reservaId: reserva.id,
        ventanaId: reserva.ventanaId,
        carrierId: reserva.carrierId,
        origen: 'demanda_reserva',
        estatusAsignacion: 'Pendiente',
        createdAt: new Date().toISOString(),
        createdBy: userEmail,
        updatedAt: new Date().toISOString(),
      });

      totalCreados++;
    }

    return { creados: totalCreados, omitidos: 0 };
  },
};
