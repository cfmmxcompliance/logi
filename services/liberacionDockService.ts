import { collection, doc, setDoc, getDocs, getDocsFromCache, updateDoc, query, where } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { LiberacionDockRecord } from '../types.ts';

const COLLECTION_NAME = 'liberacionesDock';

export const liberacionDockService = {
  async getLiberacionesDockByDate(fecha: string): Promise<LiberacionDockRecord[]> {
    if (!db) return [];
    try {
      const q = query(
        collection(db, COLLECTION_NAME),
        where('fechaLiberacion', '==', fecha)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as LiberacionDockRecord));
    } catch (error) {
      console.error('Error fetching liberacionesDock by date:', error);
      return [];
    }
  },

  async getLiberacionesDockByDateCached(fecha: string): Promise<LiberacionDockRecord[]> {
    if (!db) return [];
    const q = query(collection(db, COLLECTION_NAME), where('fechaLiberacion', '==', fecha));
    try {
      const cached = await getDocsFromCache(q);
      if (!cached.empty) return cached.docs.map(d => ({ id: d.id, ...d.data() } as LiberacionDockRecord));
    } catch { /* cache miss */ }
    try {
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as LiberacionDockRecord));
    } catch (error) {
      console.error('Error fetching liberacionesDock by date (fallback):', error);
      return [];
    }
  },

  async getLiberacionesDockByDateRange(dateStart: string, dateEnd: string): Promise<LiberacionDockRecord[]> {
    if (!db) return [];
    try {
      const q = query(
        collection(db, COLLECTION_NAME),
        where('fechaLiberacion', '>=', dateStart),
        where('fechaLiberacion', '<=', dateEnd)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as LiberacionDockRecord));
    } catch (error) {
      console.error('Error fetching liberacionesDock by date range:', error);
      return [];
    }
  },

  async getAllLiberacionesDock(): Promise<LiberacionDockRecord[]> {
    if (!db) return [];
    try {
      const snapshot = await getDocs(collection(db, COLLECTION_NAME));
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LiberacionDockRecord));
    } catch (error) {
      console.error('Error fetching all liberacionesDock:', error);
      return [];
    }
  },

  async addLiberacionDock(record: LiberacionDockRecord): Promise<string> {
    if (!db) throw new Error('Sin conexión a la base de datos.');
    const docId = record.id || doc(collection(db, COLLECTION_NAME)).id;
    const docRef = doc(db, COLLECTION_NAME, docId);
    await setDoc(docRef, {
      ...record,
      id: docId,
      createdAt: record.createdAt || new Date().toISOString(),
    });
    return docId;
  },

  async updateLiberacionDock(id: string, data: Partial<LiberacionDockRecord>): Promise<void> {
    if (!db) return;
    const docRef = doc(db, COLLECTION_NAME, id);
    await updateDoc(docRef, data as Record<string, unknown>);
  },
};
