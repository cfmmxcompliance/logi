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
import { DriverModel } from '../types/driver';

const DRIVERS_COLLECTION = 'drivers';

export const driverService = {
  async addDriver(data: DriverModel): Promise<void> {
    try {
      const docRef = doc(db, DRIVERS_COLLECTION, data.driverId);
      const timestamp = new Date().toISOString();
      await setDoc(docRef, {
        ...data,
        createdAt: timestamp,
        updatedAt: timestamp
      });
    } catch (error) {
      console.error('Error adding Driver:', error);
      throw error;
    }
  },

  async getDriver(driverId: string): Promise<DriverModel | null> {
    try {
      const docRef = doc(db, DRIVERS_COLLECTION, driverId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return docSnap.data() as DriverModel;
      }
      return null;
    } catch (error) {
      console.error('Error getting Driver:', error);
      throw error;
    }
  },

  async getDriversByCarrier(carrierCodigo: string): Promise<DriverModel[]> {
    try {
      const q = query(
        collection(db, DRIVERS_COLLECTION),
        where("carrierCodigo", "==", carrierCodigo)
      );
      const querySnapshot = await getDocs(q);
      const drivers: DriverModel[] = [];
      querySnapshot.forEach((docSnap) => {
        drivers.push(docSnap.data() as DriverModel);
      });
      return drivers;
    } catch (error) {
      console.error('Error getting drivers by carrier:', error);
      throw error;
    }
  },

  async getAllDrivers(): Promise<DriverModel[]> {
    try {
      const q = query(collection(db, DRIVERS_COLLECTION));
      const querySnapshot = await getDocs(q);
      const drivers: DriverModel[] = [];
      querySnapshot.forEach((docSnap) => {
        drivers.push(docSnap.data() as DriverModel);
      });
      return drivers;
    } catch (error) {
      console.error('Error getting all Drivers:', error);
      throw error;
    }
  },
  
  async updateDriver(driverId: string, data: Partial<DriverModel>): Promise<void> {
    try {
       const docRef = doc(db, DRIVERS_COLLECTION, driverId);
       await updateDoc(docRef, {
           ...data,
           updatedAt: new Date().toISOString()
       });
    } catch(error) {
        console.error('Error updating Driver:', error);
        throw error;
    }
  },

  async deleteDriver(driverId: string): Promise<void> {
    try {
        const docRef = doc(db, DRIVERS_COLLECTION, driverId);
        await deleteDoc(docRef);
    } catch(error) {
        console.error('Error deleting Driver:', error);
        throw error;
    }
  }
};
