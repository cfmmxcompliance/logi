import { collection, doc, setDoc, getDocs, getDocsFromCache, deleteDoc, updateDoc, query, where } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { AsignacionCajaModel } from '../types/asignacionCaja';

const COLLECTION_NAME = 'asignacion_cajas';

export const asignacionCajaService = {
  async getAllAsignaciones(): Promise<AsignacionCajaModel[]> {
    const snapshot = await getDocs(collection(db, COLLECTION_NAME));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AsignacionCajaModel));
  },

  async getAsignacionesByDate(fecha: string): Promise<AsignacionCajaModel[]> {
    const q = query(collection(db, COLLECTION_NAME), where('fecha', '==', fecha));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AsignacionCajaModel));
  },

  // ⚡ Cache-first: returns cached data in < 50ms, then caller can refresh from network
  async getAsignacionesByDateCached(fecha: string): Promise<AsignacionCajaModel[]> {
    const q = query(collection(db, COLLECTION_NAME), where('fecha', '==', fecha));
    try {
      const cached = await getDocsFromCache(q);
      if (!cached.empty) {
        return cached.docs.map(d => ({ id: d.id, ...d.data() } as AsignacionCajaModel));
      }
    } catch { /* cache miss — fall through to network */ }
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as AsignacionCajaModel));
  },

  async getAsignacionesByDateRange(start: string, end: string): Promise<AsignacionCajaModel[]> {
    if (!db) return [];
    try {
      const q = query(
        collection(db, COLLECTION_NAME),
        where('fecha', '>=', start),
        where('fecha', '<=', end)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as AsignacionCajaModel));
    } catch (error) {
      console.error('Error fetching by date range:', error);
      return [];
    }
  },

  async addAsignacion(asignacion: AsignacionCajaModel): Promise<void> {
    // Auto-generate custom ID: {numeroOperacion}{YYYYMMDD}{carrierCodigo}{scac}
    const datePart = (asignacion.fecha || '').replace(/-/g, '');
    const customId = `${asignacion.numeroOperacion || ''}${datePart}${asignacion.carrierCodigo || ''}${asignacion.scac || ''}`;
    const docId = asignacion.id || customId || doc(collection(db, COLLECTION_NAME)).id;
    const docRef = doc(db, COLLECTION_NAME, docId);
    await setDoc(docRef, {
      id: docId,
      customId: customId || docId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...asignacion
    });
  },

  async getNextOperationNumber(fecha: string): Promise<string> {
    try {
      const asigs = await this.getAsignacionesByDate(fecha);
      let maxNum = 0;
      asigs.forEach(a => {
        const match = (a.numeroOperacion || '').match(/^TL(\d+)$/);
        if (match) {
          const n = parseInt(match[1], 10);
          if (n > maxNum) maxNum = n;
        }
      });
      const next = maxNum + 1;
      return `TL${String(next).padStart(3, '0')}`;
    } catch {
      return 'TL001';
    }
  },

  async updateAsignacion(id: string, asignacion: Partial<AsignacionCajaModel>): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, id);
    await updateDoc(docRef, {
      ...asignacion,
      updatedAt: new Date().toISOString()
    });
  },

  async deleteAsignacion(id: string): Promise<void> {
    try {
      const { writeBatch } = await import('firebase/firestore');
      const batch = writeBatch(db);

      // 1. Mark associated seals for deletion
      const sellosQ = query(collection(db, 'sellos'), where('asignacionCajaId', '==', id));
      const sellosSnap = await getDocs(sellosQ);
      sellosSnap.forEach(d => batch.delete(doc(db, 'sellos', d.id)));

      // 2. Mark associated liberacion for deletion
      const libQ = query(collection(db, 'liberaciones'), where('asignacionCajaId', '==', id));
      const libSnap = await getDocs(libQ);
      libSnap.forEach(d => batch.delete(doc(db, 'liberaciones', d.id)));

      // 3. Mark associated liberacion_dock for deletion
      const dockQ = query(collection(db, 'liberaciones_dock'), where('asignacionCajaId', '==', id));
      const dockSnap = await getDocs(dockQ);
      dockSnap.forEach(d => batch.delete(doc(db, 'liberaciones_dock', d.id)));

      // 4. Mark the main asignacion for deletion
      batch.delete(doc(db, COLLECTION_NAME, id));

      // 5. Commit atomic batch
      await batch.commit();
    } catch (err) {
      console.error('Error in batch delete for asignacion:', err);
      throw err;
    }
  }
};
