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
  where
} from 'firebase/firestore';
import { CajaModel } from '../types/caja';

const CAJAS_COLLECTION = 'cajas';

export const cajaService = {
  async addCaja(data: CajaModel): Promise<void> {
    try {
      const docRef = doc(db, CAJAS_COLLECTION, data.NumeroCaja);
      const timestamp = new Date().toISOString();
      await setDoc(docRef, {
        ...data,
        createdAt: timestamp,
        updatedAt: timestamp
      });
    } catch (error) {
      console.error('Error adding Caja:', error);
      throw error;
    }
  },

  async getCaja(numeroCaja: string): Promise<CajaModel | null> {
    try {
      const docRef = doc(db, CAJAS_COLLECTION, numeroCaja);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return docSnap.data() as CajaModel;
      }
      return null;
    } catch (error) {
      console.error('Error getting Caja:', error);
      throw error;
    }
  },

  async getCajasByCarrier(carrierCodigo: string): Promise<CajaModel[]> {
    try {
      const q = query(
        collection(db, CAJAS_COLLECTION),
        where("carrierCodigo", "==", carrierCodigo)
      );
      const querySnapshot = await getDocs(q);
      const cajas: CajaModel[] = [];
      querySnapshot.forEach((docSnap) => {
        cajas.push(docSnap.data() as CajaModel);
      });
      return cajas;
    } catch (error) {
      console.error('Error getting cajas by carrier:', error);
      throw error;
    }
  },

  async getAllCajas(): Promise<CajaModel[]> {
    try {
      const q = query(collection(db, CAJAS_COLLECTION));
      const querySnapshot = await getDocs(q);
      const cajas: CajaModel[] = [];
      querySnapshot.forEach((docSnap) => {
        cajas.push(docSnap.data() as CajaModel);
      });
      return cajas;
    } catch (error) {
      console.error('Error getting all Cajas:', error);
      throw error;
    }
  },
  
  async updateCaja(numeroCaja: string, data: Partial<CajaModel>): Promise<void> {
    try {
       const docRef = doc(db, CAJAS_COLLECTION, numeroCaja);
       await updateDoc(docRef, {
           ...data,
           updatedAt: new Date().toISOString()
       });
    } catch(error) {
        console.error('Error updating Caja:', error);
        throw error;
    }
  },

  async deleteCaja(numeroCaja: string): Promise<void> {
    try {
        const docRef = doc(db, CAJAS_COLLECTION, numeroCaja);
        await deleteDoc(docRef);
    } catch(error) {
        console.error('Error deleting Caja:', error);
        throw error;
    }
  }
};
