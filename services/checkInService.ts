import { collection, doc, setDoc, getDocs, updateDoc, query, where, orderBy, deleteDoc } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { CheckInModel } from '../types/checkIn';
import { v4 as uuidv4 } from 'uuid';

const COLLECTION_NAME = 'driver_check_ins';

export const checkInService = {
  // cutoffDate (ISO string opcional): si se pasa, solo trae check-ins desde esa fecha.
  // El filtro processed==false se aplica en memoria para evitar índice compuesto nuevo.
  async getUnprocessedCheckIns(cutoffDate?: string): Promise<CheckInModel[]> {
    let q;
    if (cutoffDate) {
      // Filtra por checkInAt >= cutoff (índice de un campo — no requiere índice compuesto)
      q = query(
        collection(db, COLLECTION_NAME),
        where('checkInAt', '>=', cutoffDate)
      );
    } else {
      q = query(collection(db, COLLECTION_NAME), where('processed', '==', false));
    }
    const snapshot = await getDocs(q);
    const docs = snapshot.docs
      .map(doc => ({ id: doc.id, ...(doc.data() as any) } as CheckInModel))
      .filter(d => cutoffDate ? !d.processed : true);
    docs.sort((a, b) => b.checkInAt.localeCompare(a.checkInAt));
    return docs;
  },

  async createCheckIn(data: Omit<CheckInModel, 'id'>): Promise<string> {
    // DEDUPLICATION GUARD: If an active (unprocessed) check-in already exists
    // for the same asignación, return its ID instead of creating a duplicate.
    if (data.asignacionCajaId) {
      try {
        const q = query(
          collection(db, COLLECTION_NAME),
          where('asignacionCajaId', '==', data.asignacionCajaId),
          where('processed', '==', false)
        );
        const existing = await getDocs(q);
        if (!existing.empty) {
          console.warn('[CheckIn] Duplicate blocked — active check-in already exists for asignacionCajaId:', data.asignacionCajaId);
          return existing.docs[0].id;
        }
      } catch (e) {
        console.warn('[CheckIn] Dedup query failed, proceeding with insert:', e);
      }
    }
    const id = uuidv4();
    const payload = { ...data, id };
    await setDoc(doc(db, COLLECTION_NAME, id), payload);
    return id;
  },

  async markAsProcessed(id: string, dockAsignado?: string): Promise<void> {
    const payload: Partial<CheckInModel> = { processed: true };
    if (dockAsignado) {
      payload.dockAsignado = dockAsignado;
    }
    await updateDoc(doc(db, COLLECTION_NAME, id), payload as any);
  },
  
  async deleteCheckIn(id: string): Promise<void> {
    await deleteDoc(doc(db, COLLECTION_NAME, id));
  }
};
