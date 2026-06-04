import {
  collection, doc, getDocs, setDoc, updateDoc, deleteDoc,
  runTransaction, query, where,
} from 'firebase/firestore';
import { db } from './firebaseConfig';
import { ReservaVentana53, ReservaEstatus } from '../types/reservaVentana53';
import { VentanaCarga53, VentanaEstatus } from '../types/ventanaCarga53';

const COL_RESERVAS = 'reservasVentanasCarga53';
const COL_VENTANAS = 'ventanasCarga53';

export const reservaVentana53Service = {
  async getAllReservas(): Promise<ReservaVentana53[]> {
    const snap = await getDocs(collection(db, COL_RESERVAS));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as ReservaVentana53));
  },

  async getReservasByDate(start: string, end: string): Promise<ReservaVentana53[]> {
    const q = query(
      collection(db, COL_RESERVAS),
      where('fechaCarga', '>=', start),
      where('fechaCarga', '<=', end)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as ReservaVentana53));
  },

  async getReservasByDemanda(demandaId: string): Promise<ReservaVentana53[]> {
    const q = query(collection(db, COL_RESERVAS), where('demandaId', '==', demandaId));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as ReservaVentana53));
  },

  async getReservasByCarrier(carrierId: string): Promise<ReservaVentana53[]> {
    const q = query(collection(db, COL_RESERVAS), where('carrierId', '==', carrierId));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as ReservaVentana53));
  },

  /**
   * Creates a reserva atomically using a Firestore transaction.
   * Validates: ventana available, enough space, cajasReservadas > 0.
   * Updates: ventana.cajasReservadas, ventana.cajasDisponibles, ventana.estatus.
   */
  async crearReservaConTransaccion(
    reservaData: Omit<ReservaVentana53, 'id' | 'estatus' | 'creadoEn' | 'actualizadoEn'>
  ): Promise<string> {
    const reservaRef = doc(collection(db, COL_RESERVAS));
    const ventanaRef = doc(db, COL_VENTANAS, reservaData.ventanaId);

    await runTransaction(db, async (tx) => {
      const ventanaSnap = await tx.get(ventanaRef);
      if (!ventanaSnap.exists()) throw new Error('Ventana no encontrada.');

      const ventana = ventanaSnap.data() as VentanaCarga53;

      if (ventana.estatus === 'Cerrada' || ventana.estatus === 'Cancelada') {
        throw new Error(`Ventana cerrada o cancelada. No es posible reservar.`);
      }
      if (ventana.estatus === 'Llena') {
        throw new Error('Ventana completa. No hay cajas disponibles.');
      }
      if (reservaData.cajasReservadas <= 0) {
        throw new Error('El número de cajas a reservar debe ser mayor a cero.');
      }

      const disponibles = ventana.capacidadCajas - (ventana.cajasReservadas || 0);
      if (reservaData.cajasReservadas > disponibles) {
        throw new Error(`Solo hay ${disponibles} caja(s) disponibles en esta ventana.`);
      }

      const nuevasReservadas = (ventana.cajasReservadas || 0) + reservaData.cajasReservadas;
      const nuevoEstatus: VentanaEstatus =
        nuevasReservadas >= ventana.capacidadCajas ? 'Llena' :
        nuevasReservadas > 0 ? 'Parcial' : 'Disponible';

      const now = new Date().toISOString();

      tx.set(reservaRef, {
        id: reservaRef.id,
        ...reservaData,
        estatus: 'Reservada' as ReservaEstatus,
        creadoEn: now,
        actualizadoEn: now,
      });

      tx.update(ventanaRef, {
        cajasReservadas: nuevasReservadas,
        cajasDisponibles: ventana.capacidadCajas - nuevasReservadas,
        estatus: nuevoEstatus,
        actualizadoEn: now,
      });
    });

    return reservaRef.id;
  },

  async confirmarReserva(id: string, userEmail: string): Promise<void> {
    await updateDoc(doc(db, COL_RESERVAS, id), {
      estatus: 'Confirmada' as ReservaEstatus,
      confirmadoPor: userEmail,
      confirmadoEn: new Date().toISOString(),
      actualizadoPor: userEmail,
      actualizadoEn: new Date().toISOString(),
    });
  },

  async rechazarReserva(id: string, userEmail: string): Promise<void> {
    await updateDoc(doc(db, COL_RESERVAS, id), {
      estatus: 'Rechazada' as ReservaEstatus,
      actualizadoPor: userEmail,
      actualizadoEn: new Date().toISOString(),
    });
  },

  /**
   * Cancels a reserva and atomically restores capacity to the ventana.
   */
  async cancelarReserva(id: string, userEmail: string, ventanaId: string, cajasALiberar: number): Promise<void> {
    const reservaRef = doc(db, COL_RESERVAS, id);
    const ventanaRef = doc(db, COL_VENTANAS, ventanaId);
    const now = new Date().toISOString();

    await runTransaction(db, async (tx) => {
      const ventanaSnap = await tx.get(ventanaRef);

      if (ventanaSnap.exists()) {
        const ventana = ventanaSnap.data() as VentanaCarga53;
        const nuevasReservadas = Math.max(0, (ventana.cajasReservadas || 0) - cajasALiberar);
        const nuevoEstatus: VentanaEstatus =
          nuevasReservadas === 0 ? 'Disponible' : 'Parcial';

        tx.update(ventanaRef, {
          cajasReservadas: nuevasReservadas,
          cajasDisponibles: ventana.capacidadCajas - nuevasReservadas,
          estatus: nuevoEstatus,
          actualizadoEn: now,
        });
      }

      tx.update(reservaRef, {
        estatus: 'Cancelada' as ReservaEstatus,
        actualizadoPor: userEmail,
        actualizadoEn: now,
      });
    });
  },

  /** Permanently deletes a cancelled reservation (no ventana rollback needed as it was already freed on cancel). */
  async deleteReserva(id: string): Promise<void> {
    await deleteDoc(doc(db, COL_RESERVAS, id));
  },
};
