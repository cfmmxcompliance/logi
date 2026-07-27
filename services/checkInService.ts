import { collection, doc, setDoc, getDocs, updateDoc, query, where, orderBy, deleteDoc } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { CheckInModel } from '../types/checkIn';
import { v4 as uuidv4 } from 'uuid';

const COLLECTION_NAME = 'driver_check_ins';

export const checkInService = {
  async getUnprocessedCheckIns(): Promise<CheckInModel[]> {
    const q = query(
      collection(db, COLLECTION_NAME),
      where('processed', '==', false)
    );
    const snapshot = await getDocs(q);
    const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CheckInModel));
    // Sort in memory instead of relying on composite index just in case
    docs.sort((a, b) => b.checkInAt.localeCompare(a.checkInAt));
    return docs;
  },

  async createCheckIn(data: Omit<CheckInModel, 'id'>): Promise<string> {
    const id = uuidv4();
    const payload = { ...data, id };
    await setDoc(doc(db, COLLECTION_NAME, id), payload);
    return id;
  },

  async markAsProcessed(id: string, dockAsignado?: string): Promise<void> {
    const payload: Partial<CheckInModel> = { processed: true };
    if (dockAsignado) {
      payload.dockAsignado = dockAsignado;
    }
    await updateDoc(doc(db, COLLECTION_NAME, id), payload as any);
  },
  
  async deleteCheckIn(id: string): Promise<void> {
    await deleteDoc(doc(db, COLLECTION_NAME, id));
  }
};
