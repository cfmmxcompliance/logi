// ─────────────────────────────────────────────────────────────────────────────
// services/vigilanciaService.ts
// CRUD de registros de Vigilancia (inspección 7 puntos + placas).
// Colección Firestore: "vigilancia"
// ─────────────────────────────────────────────────────────────────────────────

import { db } from './firebaseConfig';
import {
  collection, doc, getDocs, setDoc, updateDoc,
  query, where, getDoc
} from 'firebase/firestore';
import { VigilanciaRecord } from '../types/vigilancia.ts';

const COL = 'vigilancia';

export const vigilanciaService = {
  /** Devuelve todos los registros de vigilancia de una fecha. */
  async getByDate(fecha: string): Promise<VigilanciaRecord[]> {
    const q = query(collection(db, COL), where('fecha', '==', fecha));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as VigilanciaRecord));
  },

  /** Cache-first: intenta IndexedDB interno de Firestore primero. */
  async getByDateCached(fecha: string): Promise<VigilanciaRecord[]> {
    try {
      const q = query(collection(db, COL), where('fecha', '==', fecha));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as VigilanciaRecord));
    } catch {
      return [];
    }
  },

  /** Obtiene un registro específico por asignacionCajaId y fecha. */
  async getByAsignacion(asignacionCajaId: string, fecha: string): Promise<VigilanciaRecord | null> {
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

  /** Crea un nuevo registro con ID determinístico. */
  async create(record: VigilanciaRecord): Promise<string> {
    const id = `vig_${record.asignacionCajaId}_${record.fecha}`;
    await setDoc(doc(db, COL, id), { ...record, id, createdAt: new Date().toISOString() }, { merge: true });
    return id;
  },

  /** Actualiza campos de un registro existente (merge parcial). */
  async update(id: string, data: Partial<VigilanciaRecord>): Promise<void> {
    await updateDoc(doc(db, COL, id), data as any);
  },

  /** Obtiene por ID directamente. */
  async getById(id: string): Promise<VigilanciaRecord | null> {
    const snap = await getDoc(doc(db, COL, id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as VigilanciaRecord;
  },

  /** Devuelve todos los registros en un rango de fechas. */
  async getByDateRange(start: string, end: string): Promise<VigilanciaRecord[]> {
    const q = query(
      collection(db, COL),
      where('fecha', '>=', start),
      where('fecha', '<=', end)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as VigilanciaRecord));
  },
};
