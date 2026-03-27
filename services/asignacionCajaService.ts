import { collection, doc, setDoc, getDocs, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { AsignacionCajaModel } from '../types/asignacionCaja';

const COLLECTION_NAME = 'asignacion_cajas';

export const asignacionCajaService = {
  async getAllAsignaciones(): Promise<AsignacionCajaModel[]> {
    const snapshot = await getDocs(collection(db, COLLECTION_NAME));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AsignacionCajaModel));
  },

  async addAsignacion(asignacion: AsignacionCajaModel): Promise<void> {
    const docId = asignacion.id || doc(collection(db, COLLECTION_NAME)).id;
    const docRef = doc(db, COLLECTION_NAME, docId);
    await setDoc(docRef, {
      ...asignacion,
      id: docId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  },

  async updateAsignacion(id: string, asignacion: Partial<AsignacionCajaModel>): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, id);
    await updateDoc(docRef, {
      ...asignacion,
      updatedAt: new Date().toISOString()
    });
  },

  async deleteAsignacion(id: string): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, id);
    await deleteDoc(docRef);
  }
};
