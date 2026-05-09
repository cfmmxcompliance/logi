import {
  collection, doc, getDocs, getDoc,
  setDoc, updateDoc, deleteDoc, query, where, increment,
} from 'firebase/firestore';
import { db } from './firebaseConfig';
import { DemandaCarga53, DemandaItem53, DemandaEstatus } from '../types/demandaCarga53';

const COL = 'demandasCarga53';

export const demandaCarga53Service = {
  async getAllDemandas(): Promise<DemandaCarga53[]> {
    const snap = await getDocs(collection(db, COL));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as DemandaCarga53));
  },

  async getDemandaById(id: string): Promise<DemandaCarga53 | null> {
    const snap = await getDoc(doc(db, COL, id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as DemandaCarga53;
  },

  async createDemanda(demanda: Omit<DemandaCarga53, 'id'>): Promise<string> {
    const ref = doc(collection(db, COL));
    await setDoc(ref, { id: ref.id, ...demanda });
    return ref.id;
  },

  async updateDemanda(id: string, partial: Partial<DemandaCarga53>): Promise<void> {
    await updateDoc(doc(db, COL, id), {
      ...partial,
      actualizadoEn: new Date().toISOString(),
    });
  },

  async confirmarDemanda(id: string, userEmail: string): Promise<void> {
    await updateDoc(doc(db, COL, id), {
      estatus: 'Confirmada' as DemandaEstatus,
      confirmadoPor: userEmail,
      confirmadoEn: new Date().toISOString(),
      actualizadoPor: userEmail,
      actualizadoEn: new Date().toISOString(),
    });
  },

  async cancelarDemanda(id: string, userEmail: string): Promise<void> {
    await updateDoc(doc(db, COL, id), {
      estatus: 'Cancelada' as DemandaEstatus,
      actualizadoPor: userEmail,
      actualizadoEn: new Date().toISOString(),
    });
  },

  // ── Items subcolección ──────────────────────────────────────────────

  async getItemsByDemanda(demandaId: string): Promise<DemandaItem53[]> {
    const snap = await getDocs(collection(db, COL, demandaId, 'items'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as DemandaItem53));
  },

  async addItem(demandaId: string, item: Omit<DemandaItem53, 'id'>): Promise<string> {
    const ref = doc(collection(db, COL, demandaId, 'items'));
    await setDoc(ref, { id: ref.id, ...item });
    return ref.id;
  },

  async updateItem(demandaId: string, itemId: string, partial: Partial<DemandaItem53>): Promise<void> {
    await updateDoc(doc(db, COL, demandaId, 'items', itemId), partial);
  },

  async deleteItem(demandaId: string, itemId: string): Promise<void> {
    await deleteDoc(doc(db, COL, demandaId, 'items', itemId));
  },

  /**
   * Permanently deletes a cancelled demand and cascades:
   * 1. Restores cajasDisponibles in each affected ventana (for active reservas)
   * 2. Deletes all linked reservas
   * 3. Deletes the demand's items subcollection
   * 4. Deletes the demand document
   */
  async eliminarDemanda(id: string): Promise<void> {
    // ── 1. Find all reservas linked to this demanda ──────────────────────────
    const reservasSnap = await getDocs(
      query(collection(db, 'reservasVentanasCarga53'), where('demandaId', '==', id))
    );

    // ── 2. Restore ventana capacity for active reservas ──────────────────────
    for (const r of reservasSnap.docs) {
      const data = r.data();
      if (['Reservada', 'Confirmada'].includes(data.estatus) && data.ventanaId && data.cajasReservadas > 0) {
        const ventanaRef = doc(db, 'ventanasCarga53', data.ventanaId);
        const ventanaSnap = await getDoc(ventanaRef);
        if (ventanaSnap.exists()) {
          const v = ventanaSnap.data();
          const newReservadas = Math.max(0, (v.cajasReservadas || 0) - data.cajasReservadas);
          const newDisponibles = v.capacidadCajas - newReservadas;
          await updateDoc(ventanaRef, {
            cajasReservadas: newReservadas,
            cajasDisponibles: newDisponibles,
            estatus: newReservadas === 0 ? 'Disponible' : newDisponibles > 0 ? 'Parcial' : 'Llena',
            actualizadoEn: new Date().toISOString(),
          });
        }
      }
      // ── 3. Delete each reserva ─────────────────────────────────────────────
      await deleteDoc(r.ref);
    }

    // ── 4. Delete items subcollection ────────────────────────────────────────
    const itemsSnap = await getDocs(collection(db, 'demandasCarga53', id, 'items'));
    await Promise.all(itemsSnap.docs.map(d => deleteDoc(d.ref)));

    // ── 5. Delete parent demand document ─────────────────────────────────────
    await deleteDoc(doc(db, 'demandasCarga53', id));
  },
};
