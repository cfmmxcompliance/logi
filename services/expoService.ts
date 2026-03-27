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
import { ExpoModel } from '../types/expo';

const BOMS_COLLECTION = 'models';

export const expoService = {
  async addExpo(data: ExpoModel): Promise<void> {
    try {
      const docRef = doc(db, BOMS_COLLECTION, data.expo);
      const timestamp = new Date().toISOString();
      await setDoc(docRef, {
        ...data,
        createdAt: timestamp,
        updatedAt: timestamp
      });
    } catch (error) {
      console.error('Error adding Expo:', error);
      throw error;
    }
  },

  async getExpo(expoId: string): Promise<ExpoModel | null> {
    try {
      const docRef = doc(db, BOMS_COLLECTION, expoId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return docSnap.data() as ExpoModel;
      }
      return null;
    } catch (error) {
      console.error('Error getting Expo:', error);
      throw error;
    }
  },

  async getAllExpos(): Promise<ExpoModel[]> {
    try {
      const q = query(collection(db, BOMS_COLLECTION));
      const querySnapshot = await getDocs(q);
      const expos: ExpoModel[] = [];
      querySnapshot.forEach((docSnap) => {
        expos.push(docSnap.data() as ExpoModel);
      });
      return expos;
    } catch (error) {
      console.error('Error getting all Expos:', error);
      throw error;
    }
  },
  
  async updateExpo(expoId: string, data: Partial<ExpoModel>): Promise<void> {
    try {
       const docRef = doc(db, BOMS_COLLECTION, expoId);
       await updateDoc(docRef, {
           ...data,
           updatedAt: new Date().toISOString()
       });
    } catch(error) {
        console.error('Error updating Expo:', error);
        throw error;
    }
  },

  async deleteExpo(expoId: string): Promise<void> {
    try {
        const docRef = doc(db, BOMS_COLLECTION, expoId);
        await deleteDoc(docRef);
    } catch(error) {
        console.error('Error deleting Expo:', error);
        throw error;
    }
  }
};
