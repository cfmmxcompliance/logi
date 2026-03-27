import { db } from './firebaseConfig';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  updateDoc,
  deleteDoc,
  query,
  orderBy
} from 'firebase/firestore';
import { Apendice10Model } from '../types/apendice10';

const APENDICE10_COLLECTION = 'apendice10';

export const apendice10Service = {
  async addRegistro(data: Apendice10Model): Promise<void> {
    try {
      const docRef = doc(db, APENDICE10_COLLECTION, data.clave);
      const timestamp = new Date().toISOString();
      await setDoc(docRef, {
        ...data,
        createdAt: timestamp,
        updatedAt: timestamp
      });
    } catch (error) {
      console.error('Error adding Apendice10:', error);
      throw error;
    }
  },

  async getRegistro(clave: string): Promise<Apendice10Model | null> {
    try {
      const docRef = doc(db, APENDICE10_COLLECTION, clave);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return docSnap.data() as Apendice10Model;
      }
      return null;
    } catch (error) {
      console.error('Error getting Apendice10:', error);
      throw error;
    }
  },

  async getAllRegistros(): Promise<Apendice10Model[]> {
    try {
      const q = query(collection(db, APENDICE10_COLLECTION), orderBy('clave', 'asc'));
      const querySnapshot = await getDocs(q);
      const registros: Apendice10Model[] = [];
      querySnapshot.forEach((docSnap) => {
        registros.push(docSnap.data() as Apendice10Model);
      });
      return registros;
    } catch (error) {
      console.error('Error getting all Apendice10:', error);
      throw error;
    }
  },

  async updateRegistro(clave: string, data: Partial<Apendice10Model>): Promise<void> {
    try {
       const docRef = doc(db, APENDICE10_COLLECTION, clave);
       await updateDoc(docRef, {
           ...data,
           updatedAt: new Date().toISOString()
       });
    } catch(error) {
        console.error('Error updating Apendice10:', error);
        throw error;
    }
  },

  async deleteRegistro(clave: string): Promise<void> {
    try {
        const docRef = doc(db, APENDICE10_COLLECTION, clave);
        await deleteDoc(docRef);
    } catch(error) {
        console.error('Error deleting Apendice10:', error);
        throw error;
    }
  }
};
