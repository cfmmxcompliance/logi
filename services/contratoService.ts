import { collection, doc, setDoc, getDocs, getDocsFromCache, deleteDoc, updateDoc, query, where } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { ContratoRecord } from '../types/contrato';

const COLLECTION_NAME = 'contratos';

export const contratoService = {
  async getAllContratos(): Promise<ContratoRecord[]> {
    if (!db) return [];
    try {
      const snapshot = await getDocs(collection(db, COLLECTION_NAME));
      return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ContratoRecord));
    } catch (error) {
      console.error('Error fetching all contratos:', error);
      return [];
    }
  },

  async getContratoByNumeroCaja(numeroCaja: string): Promise<ContratoRecord | null> {
    if (!db) return null;
    try {
      const q = query(
        collection(db, COLLECTION_NAME),
        where('numeroCaja', '==', numeroCaja)
      );
      const snapshot = await getDocs(q);
      if (snapshot.empty) return null;
      return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as ContratoRecord;
    } catch (error) {
      console.error('Error fetching contrato by numeroCaja:', error);
      return null;
    }
  },

  async getContratosByDateRange(start: string, end: string): Promise<ContratoRecord[]> {
    if (!db) return [];
    try {
      const q = query(
        collection(db, COLLECTION_NAME),
        where('fecha', '>=', start),
        where('fecha', '<=', end)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ContratoRecord));
    } catch (error) {
      console.error('Error fetching contratos by date range:', error);
      return [];
    }
  },

  async addContrato(contrato: ContratoRecord): Promise<boolean> {
    if (!db) throw new Error("Sin conexión a la base de datos (db nulo).");
    try {
      const docId = contrato.id || doc(collection(db, COLLECTION_NAME)).id;
      const docRef = doc(db, COLLECTION_NAME, docId);
      await setDoc(docRef, {
        ...contrato,
        id: docId,
        createdAt: contrato.createdAt || new Date().toISOString()
      });
      return true;
    } catch (error) {
      console.error('Error adding Contrato:', error);
      throw error;
    }
  },

  async updateContrato(id: string, contrato: Partial<ContratoRecord>): Promise<boolean> {
    if (!db) return false;
    try {
      const docRef = doc(db, COLLECTION_NAME, id);
      await updateDoc(docRef, contrato);
      return true;
    } catch (error) {
      console.error('Error updating Contrato:', error);
      return false;
    }
  },

  async deleteContrato(id: string): Promise<boolean> {
    if (!db) return false;
    try {
      const docRef = doc(db, COLLECTION_NAME, id);
      await deleteDoc(docRef);
      return true;
    } catch (error) {
      console.error('Error deleting Contrato:', error);
      return false;
    }
  }
};
