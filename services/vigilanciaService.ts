// ─────────────────────────────────────────────────────────────────────────────
// services/vigilanciaService.ts
// CRUD de registros de Vigilancia — patrón idéntico a selloService.ts
// ─────────────────────────────────────────────────────────────────────────────

import { db } from './firebaseConfig';
import {
  collection, doc, getDocs, getDocsFromCache,
  setDoc, updateDoc, query, where, getDoc
} from 'firebase/firestore';
import { VigilanciaRecord } from '../types/vigilancia.ts';

const COL = 'vigilancia';

export const vigilanciaService = {

  /** Devuelve todos los registros de vigilancia de una fecha. */
  async getByDate(fecha: string): Promise<VigilanciaRecord[]> {
    if (!db) return [];
    try {
      const q = query(collection(db, COL), where('fecha', '==', fecha));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as VigilanciaRecord));
    } catch (error) {
      console.error('Error fetching vigilancia by date:', error);
      return [];
    }
  },

  /** Cache-first: igual patrón que getSellosByDateCached. */
  async getByDateCached(fecha: string): Promise<VigilanciaRecord[]> {
    if (!db) return [];
    const q = query(collection(db, COL), where('fecha', '==', fecha));
    try {
      const cached = await getDocsFromCache(q);
      if (!cached.empty) return cached.docs.map(d => ({ id: d.id, ...d.data() } as VigilanciaRecord));
    } catch { /* cache miss */ }
    try {
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as VigilanciaRecord));
    } catch (error) {
      console.error('Error fetching vigilancia by date:', error);
      return [];
    }
  },

  /** Rango de fechas. */
  async getByDateRange(start: string, end: string): Promise<VigilanciaRecord[]> {
    if (!db) return [];
    try {
      const q = query(collection(db, COL), where('fecha', '>=', start), where('fecha', '<=', end));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as VigilanciaRecord));
    } catch (error) {
      console.error('Error fetching vigilancia by range:', error);
      return [];
    }
  },

  /** Crea un nuevo registro. ID pre-generado para poder usarlo antes de confirmar.
   *  Lanza error si falla (igual que addSello). */
  async create(record: VigilanciaRecord): Promise<string> {
    if (!db) throw new Error('Sin conexión a la base de datos.');
    const id = `vig_${record.asignacionCajaId}_${record.fecha}`;
    const docRef = doc(db, COL, id);
    await setDoc(docRef, { ...record, id, createdAt: new Date().toISOString() }, { merge: true });
    return id;
  },

  /** Actualiza campos parciales de un registro existente (igual que updateSello). */
  async update(id: string, data: Partial<VigilanciaRecord>): Promise<boolean> {
    if (!db) return false;
    try {
      const docRef = doc(db, COL, id);
      await updateDoc(docRef, data as any);
      return true;
    } catch (error) {
      console.error('Error updating vigilancia:', error);
      return false;
    }
  },

  /** Obtiene por ID directamente. */
  async getById(id: string): Promise<VigilanciaRecord | null> {
    if (!db) return null;
    const snap = await getDoc(doc(db, COL, id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as VigilanciaRecord;
  },

  /** Obtiene por asignacionCajaId y fecha. */
  async getByAsignacion(asignacionCajaId: string, fecha: string): Promise<VigilanciaRecord | null> {
    if (!db) return null;
    const q = query(
      collection(db, COL),
      where('asignacionCajaId', '==', asignacionCajaId),
      where('fecha', '==', fecha)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { id: d.id, ...d.data() } as VigilanciaRecord;
  },
};
