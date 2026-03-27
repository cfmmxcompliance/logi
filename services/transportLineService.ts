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
import { TransportLineModel } from '../types/transportLine';

const TRANSPORT_LINES_COLLECTION = 'transport_lines';

export const transportLineService = {
  async addTransportLine(data: TransportLineModel): Promise<void> {
    try {
      const docRef = doc(db, TRANSPORT_LINES_COLLECTION, data.transportLineId);
      const timestamp = new Date().toISOString();
      await setDoc(docRef, {
        ...data,
        createdAt: timestamp,
        updatedAt: timestamp
      });
    } catch (error) {
      console.error('Error adding TransportLine:', error);
      throw error;
    }
  },

  async getTransportLine(transportLineId: string): Promise<TransportLineModel | null> {
    try {
      const docRef = doc(db, TRANSPORT_LINES_COLLECTION, transportLineId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return docSnap.data() as TransportLineModel;
      }
      return null;
    } catch (error) {
      console.error('Error getting TransportLine:', error);
      throw error;
    }
  },

  async getTransportLinesByCarrier(carrierCodigo: string): Promise<TransportLineModel[]> {
    try {
      const q = query(
        collection(db, TRANSPORT_LINES_COLLECTION),
        where("carrierCodigo", "==", carrierCodigo)
      );
      const querySnapshot = await getDocs(q);
      const lines: TransportLineModel[] = [];
      querySnapshot.forEach((docSnap) => {
        lines.push(docSnap.data() as TransportLineModel);
      });
      return lines;
    } catch (error) {
      console.error('Error getting transport lines by carrier:', error);
      throw error;
    }
  },

  async getAllTransportLines(): Promise<TransportLineModel[]> {
    try {
      const q = query(collection(db, TRANSPORT_LINES_COLLECTION));
      const querySnapshot = await getDocs(q);
      const lines: TransportLineModel[] = [];
      querySnapshot.forEach((docSnap) => {
        lines.push(docSnap.data() as TransportLineModel);
      });
      return lines;
    } catch (error) {
      console.error('Error getting all TransportLines:', error);
      throw error;
    }
  },
  
  async updateTransportLine(transportLineId: string, data: Partial<TransportLineModel>): Promise<void> {
    try {
       const docRef = doc(db, TRANSPORT_LINES_COLLECTION, transportLineId);
       await updateDoc(docRef, {
           ...data,
           updatedAt: new Date().toISOString()
       });
    } catch(error) {
        console.error('Error updating TransportLine:', error);
        throw error;
    }
  },

  async deleteTransportLine(transportLineId: string): Promise<void> {
    try {
        const docRef = doc(db, TRANSPORT_LINES_COLLECTION, transportLineId);
        await deleteDoc(docRef);
    } catch(error) {
        console.error('Error deleting TransportLine:', error);
        throw error;
    }
  }
};
