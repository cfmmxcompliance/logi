import {
  collection, doc, setDoc, getDocs, updateDoc, query, where,
} from 'firebase/firestore';
import { db } from './firebaseConfig';
import { ReservaVentana53 } from '../types/reservaVentana53';
import { DemandaCarga53, DemandaItem53 } from '../types/demandaCarga53';
import { asignacionCajaService } from './asignacionCajaService';
import { cajaService } from './cajaService';
import { driverService } from './driverService';

const COL_ASIGNACIONES = 'asignacion_cajas';

export interface BridgeResult {
  creados: number;
  actualizados: number;
  omitidos: number;
}

/**
 * Smart merge bridge between reservasVentanasCarga53 and asignacion_cajas.
 *
 * Strategy:
 *  1. Anti-duplicate guard: if records with this reservaId already exist → skip.
 *  2. MERGE: look for existing asignacion_cajas records for same fecha + carrierId
 *     that are NOT yet linked to a reserva → update & link them (up to cajasReservadas).
 *  3. CREATE: for any remaining cajas without a matching existing record → create new ones.
 *
 * This prevents duplication when ops have already pre-created manual assignments.
 */
export const demandaAsignacionBridge = {
  async generarAsignacionesDesdeReserva(
    reserva: ReservaVentana53,
    demanda: DemandaCarga53,
    items: DemandaItem53[],
    userEmail: string,
  ): Promise<BridgeResult> {

    // ── 1. Anti-duplicate guard ───────────────────────────────────────────────
    const dupeQ = query(collection(db, COL_ASIGNACIONES), where('reservaId', '==', reserva.id));
    const dupes = await getDocs(dupeQ);
    if (!dupes.empty) {
      return { creados: 0, actualizados: 0, omitidos: dupes.size };
    }

    // ── 2. Find existing unlinked records for merge ───────────────────────────
    const mergeQ = query(
      collection(db, COL_ASIGNACIONES),
      where('fecha', '==', reserva.fechaCarga),
      where('carrierCodigo', '==', reserva.carrierId),
    );
    const mergeSnap = await getDocs(mergeQ);
    // Only consider records not yet linked to any reserva
    const unlinked = mergeSnap.docs.filter(d => !d.data().reservaId);

    const fecha = reserva.fechaCarga;
    const modelos = [...new Set(items.map(i => i.modelo))].join(', ');
    const now = new Date().toISOString();

    // ── Catalog enrichment (parallel lookups) ─────────────────────────────────
    // Fetch the caja record to get real placasCaja
    const [cajasCatalogo, driversCatalogo] = await Promise.all([
      reserva.numeroCaja
        ? cajaService.getCajasByCarrier(reserva.carrierId).catch(() => [])
        : Promise.resolve([]),
      reserva.operador
        ? driverService.getDriversByCarrier(reserva.carrierId).catch(() => [])
        : Promise.resolve([]),
    ]);

    const cajaRecord = cajasCatalogo.find(c =>
      c.NumeroCaja?.trim() === reserva.numeroCaja?.trim()
    );
    const driverRecord = driversCatalogo.find(d =>
      d.nombre?.trim().toLowerCase() === reserva.operador?.trim().toLowerCase()
    );

    let totalCreados = 0;
    let totalActualizados = 0;

    for (let cajaN = 1; cajaN <= reserva.cajasReservadas; cajaN++) {
      // Shared fields that enrich/overwrite the asignacion record
      const mergeData: Record<string, any> = {
        // ── Campos visibles en la UI existente ──
        numeroCaja:      reserva.numeroCaja || 'PENDIENTE',
        placasCaja:      cajaRecord?.placas  || reserva.placas || 'PENDIENTE',
        driverId:        driverRecord?.driverId || reserva.operador || 'PENDIENTE',
        nombreDriver:    driverRecord?.nombre   || reserva.operador || 'PENDIENTE',
        placasTracto:    driverRecord?.placasTracto || '',
        transportLineId: reserva.economico  || '',             // transportLineId al seleccionar sub-línea
        subLinea:        reserva.nombreSubLinea || '',
        modeloAsignado: modelos,
        carrierCodigo:  reserva.carrierId,
        observaciones: [
          `Demanda: ${reserva.demandaId}`,
          `Reserva: ${reserva.id}`,
          `Carrier: ${reserva.carrierNombre}`,
          `Nom. Comercial: ${reserva.nombreComercial || ''}`,
          `Sub-Línea: ${reserva.nombreSubLinea || ''}`,
          `Caja ${cajaN} de ${reserva.cajasReservadas}`,
        ].join(' | '),
        // ── Campos de trazabilidad ──
        demandaId:  reserva.demandaId,
        reservaId:  reserva.id,
        ventanaId:  reserva.ventanaId,
        carrierId:  reserva.carrierId,
        origen:     'demanda_reserva',
        updatedAt:  now,
      };

      const unlinkedDoc = unlinked[cajaN - 1]; // try to match an existing record

      if (unlinkedDoc) {
        // ── MERGE: update existing record ────────────────────────────────────
        await updateDoc(unlinkedDoc.ref, mergeData);
        totalActualizados++;
      } else {
        // ── CREATE: no existing record to reuse ──────────────────────────────
        const operacion = await asignacionCajaService.getNextOperationNumber(fecha);
        const docId = `res_${reserva.id}_caja_${cajaN}`;
        const ref = doc(db, COL_ASIGNACIONES, docId);

        await setDoc(ref, {
          id: docId,
          fecha,
          horaAsignacion:   reserva.horaInicio,
          numeroOperacion:  operacion,
          estatusAsignacion: 'Pendiente',
          createdAt: now,
          createdBy: userEmail,
          ...mergeData,
        });
        totalCreados++;
      }
    }

    return { creados: totalCreados, actualizados: totalActualizados, omitidos: 0 };
  },

  /**
   * Fetches the asignacion_cajas records linked to a specific reserva.
   * Used in ReservaVentanas53 to show TL operation numbers per confirmed reserva.
   */
  async getAsignacionesByReserva(reservaId: string): Promise<{ id: string; numeroOperacion: string; numeroCaja: string }[]> {
    const q = query(collection(db, COL_ASIGNACIONES), where('reservaId', '==', reservaId));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({
      id: d.id,
      numeroOperacion: d.data().numeroOperacion || '—',
      numeroCaja: d.data().numeroCaja || '—',
    }));
  },
};
