import { db } from './firebaseConfig';
import { 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  updateDoc,
  deleteDoc,
  query
} from 'firebase/firestore';
import { PricingModel } from '../types/pricing';

const PRICING_COLLECTION = 'pricing_matrix';

export const pricingService = {
  async addPricing(data: PricingModel): Promise<void> {
    try {
      // Create a composite ID or use timestamp if model+contract is too messy
      const docId = data.id || `PRC-${Date.now()}-${Math.floor(Math.random()*1000)}`;
      const docRef = doc(db, PRICING_COLLECTION, docId);
      const targetData = { ...data, id: docId };
      const timestamp = new Date().toISOString();
      
      await setDoc(docRef, {
        ...targetData,
        createdAt: timestamp,
        updatedAt: timestamp
      });
    } catch (error) {
      console.error('Error adding Pricing Record:', error);
      throw error;
    }
  },

  async getAllPricing(): Promise<PricingModel[]> {
    try {
      const q = query(collection(db, PRICING_COLLECTION));
      const querySnapshot = await getDocs(q);
      const list: PricingModel[] = [];
      querySnapshot.forEach((docSnap) => {
        list.push(docSnap.data() as PricingModel);
      });
      return list;
    } catch (error) {
      console.error('Error getting Pricing Matrix:', error);
      throw error;
    }
  },

  async updatePricing(id: string, data: Partial<PricingModel>): Promise<void> {
    try {
       const docRef = doc(db, PRICING_COLLECTION, id);
       await updateDoc(docRef, {
           ...data,
           updatedAt: new Date().toISOString()
       });
    } catch(error) {
        console.error('Error updating Pricing:', error);
        throw error;
    }
  },

  async deletePricing(id: string): Promise<void> {
    try {
        const docRef = doc(db, PRICING_COLLECTION, id);
        await deleteDoc(docRef);
    } catch(error) {
        console.error('Error deleting Pricing:', error);
        throw error;
    }
  }
};
