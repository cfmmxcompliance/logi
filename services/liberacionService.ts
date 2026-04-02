import { collection, doc, setDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { LiberacionRecord } from '../types.ts';

const COLLECTION_NAME = 'liberacionesCaja';

export const liberacionService = {
  async getLiberacionesByDate(fecha: string): Promise<LiberacionRecord[]> {
    if (!db) return [];
    try {
      const q = query(
        collection(db, COLLECTION_NAME),
        where('fechaLiberacion', '==', fecha)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LiberacionRecord));
    } catch (error) {
      console.error('Error fetching liberaciones by date:', error);
      return [];
    }
  },

  async getAllLiberaciones(): Promise<LiberacionRecord[]> {
    if (!db) return [];
    try {
      const snapshot = await getDocs(collection(db, COLLECTION_NAME));
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LiberacionRecord));
    } catch (error) {
      console.error('Error fetching all liberaciones:', error);
      return [];
    }
  },

  async addLiberacion(liberacion: LiberacionRecord): Promise<string> {
    if (!db) throw new Error("Sin conexión a la base de datos (db nulo).");
    try {
      const docId = liberacion.id || doc(collection(db, COLLECTION_NAME)).id;
      const docRef = doc(db, COLLECTION_NAME, docId);
      await setDoc(docRef, {
        ...liberacion,
        id: docId,
        createdAt: liberacion.createdAt || new Date().toISOString()
      });
      return docId;
    } catch (error) {
      console.error('Error adding Liberacion:', error);
      throw error;
    }
  }
};
