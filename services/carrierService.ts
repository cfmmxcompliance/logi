import { db } from './firebaseConfig';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  updateDoc,
  deleteDoc,
  query
} from 'firebase/firestore';
import { CarrierModel } from '../types/carrier';

const CARRIERS_COLLECTION = 'carriers';

export const carrierService = {
  async addCarrier(data: CarrierModel): Promise<void> {
    try {
      const docRef = doc(db, CARRIERS_COLLECTION, data.codigo);
      const timestamp = new Date().toISOString();
      await setDoc(docRef, {
        ...data,
        createdAt: timestamp,
        updatedAt: timestamp
      });
    } catch (error) {
      console.error('Error adding Carrier:', error);
      throw error;
    }
  },

  async getCarrier(codigoId: string): Promise<CarrierModel | null> {
    try {
      const docRef = doc(db, CARRIERS_COLLECTION, codigoId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return docSnap.data() as CarrierModel;
      }
      return null;
    } catch (error) {
      console.error('Error getting Carrier:', error);
      throw error;
    }
  },

  async getAllCarriers(): Promise<CarrierModel[]> {
    try {
      const q = query(collection(db, CARRIERS_COLLECTION));
      const querySnapshot = await getDocs(q);
      const carriers: CarrierModel[] = [];
      querySnapshot.forEach((docSnap) => {
        carriers.push(docSnap.data() as CarrierModel);
      });
      return carriers;
    } catch (error) {
      console.error('Error getting all Carriers:', error);
      throw error;
    }
  },
  
  async updateCarrier(codigoId: string, data: Partial<CarrierModel>): Promise<void> {
    try {
       const docRef = doc(db, CARRIERS_COLLECTION, codigoId);
       await updateDoc(docRef, {
           ...data,
           updatedAt: new Date().toISOString()
       });
    } catch(error) {
        console.error('Error updating Carrier:', error);
        throw error;
    }
  },

  async deleteCarrier(codigoId: string): Promise<void> {
    try {
        const docRef = doc(db, CARRIERS_COLLECTION, codigoId);
        await deleteDoc(docRef);
    } catch(error) {
        console.error('Error deleting Carrier:', error);
        throw error;
    }
  }
};
