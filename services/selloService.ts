import { collection, doc, setDoc, getDocs, getDocsFromCache, deleteDoc, updateDoc, query, where } from 'firebase/firestore';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebaseConfig';
import { SelloRecord } from '../types.ts';

const COLLECTION_NAME = 'sellos';

export const selloService = {
  async getAllSellos(): Promise<SelloRecord[]> {
    if (!db) return [];
    try {
      const snapshot = await getDocs(collection(db, COLLECTION_NAME));
      return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as SelloRecord));
    } catch (error) {
      console.error('Error fetching all sellos:', error);
      return [];
    }
  },

  async getSellosByDate(fecha: string): Promise<SelloRecord[]> {
    if (!db) return [];
    try {
      const q = query(
        collection(db, COLLECTION_NAME),
        where('fechaAsignacion', '==', fecha)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SelloRecord));
    } catch (error) {
      console.error('Error fetching sellos by date:', error);
      return [];
    }
  },

  // ⚡ Cache-first
  async getSellosByDateCached(fecha: string): Promise<SelloRecord[]> {
    if (!db) return [];
    const q = query(collection(db, COLLECTION_NAME), where('fechaAsignacion', '==', fecha));
    try {
      const cached = await getDocsFromCache(q);
      if (!cached.empty) return cached.docs.map(d => ({ id: d.id, ...d.data() } as SelloRecord));
    } catch { /* cache miss */ }
    try {
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as SelloRecord));
    } catch (error) {
      console.error('Error fetching sellos by date:', error);
      return [];
    }
  },

  async addSello(sello: SelloRecord): Promise<boolean> {
    if (!db) throw new Error("Sin conexión a la base de datos (db nulo).");
    try {
      const docId = sello.id || doc(collection(db, COLLECTION_NAME)).id;
      const docRef = doc(db, COLLECTION_NAME, docId);
      await setDoc(docRef, {
        ...sello,
        id: docId,
        createdAt: sello.createdAt || new Date().toISOString()
      });
      return true;
    } catch (error) {
      console.error('Error adding Sello:', error);
      throw error;
    }
  },

  async updateSello(id: string, sello: Partial<SelloRecord>): Promise<boolean> {
    if (!db) return false;
    try {
      const docRef = doc(db, COLLECTION_NAME, id);
      await updateDoc(docRef, sello);
      return true;
    } catch (error) {
      console.error('Error updating Sello:', error);
      return false;
    }
  },

  async deleteSello(id: string): Promise<boolean> {
    if (!db) return false;
    try {
      const docRef = doc(db, COLLECTION_NAME, id);
      await deleteDoc(docRef);
      return true;
    } catch (error) {
      console.error('Error deleting Sello:', error);
      return false;
    }
  },

  async uploadFotoSello(id: string, base64Image: string): Promise<string | null> {
    if (!storage) {
      console.warn("Storage no inicializado.");
      return null;
    }
    try {
      // Usamos el id de la caja y un timestamp
      const imageRef = ref(storage, `sellos_photos/caja_${id}_${Date.now()}.jpg`);
      const dataUrl = `data:image/jpeg;base64,${base64Image}`;
      await uploadString(imageRef, dataUrl, 'data_url');
      return await getDownloadURL(imageRef);
    } catch (error) {
      console.error('Error uploading foto de sello a Firebase:', error);
      return null;
    }
  }
};
