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
  writeBatch
} from 'firebase/firestore';
import { ShippingModel } from '../types/shipping';

const SHIPPING_COLLECTION = 'shipping_schedules';

export const shippingService = {
  async addSchedule(data: ShippingModel): Promise<void> {
    try {
      // Invoice No. is the absolute primary key. Use it as the deterministic Document ID to enable true upserts
      let baseId = data.id || data.invoiceNo || Date.now().toString();
      let docId = baseId.replace(/[\/ ]/g, '-');
      
      const docRef = doc(db, SHIPPING_COLLECTION, docId);
      const targetData = { ...data, id: docId };
      const timestamp = new Date().toISOString();
      
      await setDoc(docRef, {
        ...targetData,
        createdAt: timestamp,
        updatedAt: timestamp
      });
    } catch (error) {
      console.error('Error adding Shipping Schedule:', error);
      throw error;
    }
  },

  async bulkUpsert(records: ShippingModel[]): Promise<number> {
    let successCount = 0;
    const chunkSize = 450; // Firestore limit is 500 writes per batch
    for (let i = 0; i < records.length; i += chunkSize) {
       const chunk = records.slice(i, i + chunkSize);
       const batch = writeBatch(db);
       chunk.forEach(data => {
          let baseId = data.id || data.invoiceNo || Date.now().toString();
          let docId = baseId.replace(/[\/ ]/g, '-');
          const docRef = doc(db, SHIPPING_COLLECTION, docId);
          const timestamp = new Date().toISOString();
          batch.set(docRef, { ...data, id: docId, updatedAt: timestamp }, { merge: true });
          successCount++;
       });
       await batch.commit();
    }
    return successCount;
  },

  async getAllSchedules(): Promise<ShippingModel[]> {
    try {
      const q = query(collection(db, SHIPPING_COLLECTION));
      const querySnapshot = await getDocs(q);
      const list: ShippingModel[] = [];
      querySnapshot.forEach((docSnap) => {
        list.push(docSnap.data() as ShippingModel);
      });
      return list;
    } catch (error) {
      console.error('Error getting Schedules:', error);
      throw error;
    }
  },

  async updateSchedule(id: string, data: Partial<ShippingModel>): Promise<void> {
    try {
       const docRef = doc(db, SHIPPING_COLLECTION, id);
       await updateDoc(docRef, {
           ...data,
           updatedAt: new Date().toISOString()
       });
    } catch(error) {
        console.error('Error updating Schedule:', error);
        throw error;
    }
  },

  async deleteSchedule(id: string): Promise<void> {
    try {
        const docRef = doc(db, SHIPPING_COLLECTION, id);
        await deleteDoc(docRef);
    } catch(error) {
        console.error('Error deleting Schedule:', error);
        throw error;
    }
  }
};
