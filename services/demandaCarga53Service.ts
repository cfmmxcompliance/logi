import {
  collection, doc, getDocs, getDoc,
  setDoc, updateDoc, deleteDoc,
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
};
