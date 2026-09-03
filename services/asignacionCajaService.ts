import { collection, doc, setDoc, getDocs, getDocsFromCache, deleteDoc, updateDoc, query, where, onSnapshot, runTransaction, getDocsFromServer } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { AsignacionCajaModel } from '../types/asignacionCaja';
import { nowMX } from '../utils/mexTime';

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

  async getAsignacionByNumeroOperacion(numeroOperacion: string, fecha?: string): Promise<AsignacionCajaModel | null> {
    let q = query(
      collection(db, COLLECTION_NAME),
      where('numeroOperacion', '==', numeroOperacion)
    );
    if (fecha) {
      q = query(
        collection(db, COLLECTION_NAME),
        where('numeroOperacion', '==', numeroOperacion),
        where('fecha', '==', fecha)
      );
    }
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    
    const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AsignacionCajaModel));
    
    if (docs.length === 0) return null;

    // Sort in memory to get the most recent one (to avoid needing a composite index)
    docs.sort((a, b) => {
      const dateA = a.fecha + (a.createdAt || '');
      const dateB = b.fecha + (b.createdAt || '');
      return dateB.localeCompare(dateA); // Descending
    });
    
    return docs[0];
  },

  async getAsignacionByCarrierRef(carrierRef: string, fecha?: string): Promise<AsignacionCajaModel | null> {
    const q = query(
      collection(db, COLLECTION_NAME),
      where('carrierRef', '==', carrierRef)
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    
    let docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AsignacionCajaModel));
    
    // Ignore canceled assignments that might still share the same carrierRef
    docs = docs.filter(d => d.dockArribo !== 'CANCELED' && d.dockArribo !== 'CANCELADO');
    
    // Si pasamos fecha, filtramos en memoria para evitar requerir index compuesto
    if (fecha) {
      docs = docs.filter(d => d.fecha === fecha);
    }
    if (docs.length === 0) return null;

    // Sort in memory to get the most recent one
    docs.sort((a, b) => {
      const dateA = a.fecha + (a.createdAt || '');
      const dateB = b.fecha + (b.createdAt || '');
      return dateB.localeCompare(dateA);
    });
    
    return docs[0];
  },



  async getAsignacionByNumeroCaja(numeroCaja: string, fecha?: string): Promise<AsignacionCajaModel | null> {
    let q = query(
      collection(db, COLLECTION_NAME),
      where('numeroCaja', '==', numeroCaja)
    );
    if (fecha) {
      q = query(
        collection(db, COLLECTION_NAME),
        where('numeroCaja', '==', numeroCaja),
        where('fecha', '==', fecha)
      );
    }
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;

    // Sort in memory to get the most recent one (avoiding composite index requirement)
    const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AsignacionCajaModel));
    docs.sort((a, b) => {
      const dateA = a.fecha + (a.createdAt || '');
      const dateB = b.fecha + (b.createdAt || '');
      return dateB.localeCompare(dateA); // Descending
    });

    return docs[0];
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

  subscribeAsignacionesByDateRange(
    start: string,
    end: string,
    callback: (data: AsignacionCajaModel[]) => void
  ): () => void {
    if (!db) return () => {};
    const q = query(
      collection(db, COLLECTION_NAME),
      where('fecha', '>=', start),
      where('fecha', '<=', end)
    );
    return onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as AsignacionCajaModel));
      callback(docs);
    });
  },

  async addAsignacion(asignacion: AsignacionCajaModel): Promise<void> {
    if (asignacion.numeroCaja) asignacion.numeroCaja = asignacion.numeroCaja.trim().toUpperCase();
    if (asignacion.numeroOperacion) asignacion.numeroOperacion = asignacion.numeroOperacion.trim().toUpperCase();
    if (asignacion.scac) asignacion.scac = asignacion.scac.trim().toUpperCase();
    
    // ── DUPLICATE TL GUARD & GUARDAR (ATÓMICO) ──────────────────────────────
    // Auto-generate custom ID: {numeroOperacion}{YYYYMMDD}
    const datePart = (asignacion.fecha || '').replace(/-/g, '');
    const customId = `${asignacion.numeroOperacion || ''}${datePart}`;
    const docId = asignacion.id || customId || doc(collection(db, COLLECTION_NAME)).id;
    const docRef = doc(db, COLLECTION_NAME, docId);

    await runTransaction(db, async (transaction) => {
      // 1. Verificar si el documento ya existe
      const existingDoc = await transaction.get(docRef);
      // Si estamos creando uno nuevo y ya existe en la base de datos, abortar.
      // (Si es una edición que pasa por addAsignacion en el futuro, esto lo bloquea,
      // pero actualmente AsignacionesDiarias usa updateAsignacion para editar).
      if (existingDoc.exists()) {
        const err = new Error('DUPLICATE_TL');
        (err as any).code = 'DUPLICATE_TL';
        throw err;
      }
      
      // Opcional: Podríamos también verificar la query de duplicados por fecha+operacion 
      // si el customId no garantizara unicidad, pero como docId = TLXXX20260903, es suficiente.

      // 2. Escribir el nuevo documento
      transaction.set(docRef, {
        id: docId,
        customId: customId || docId,
        ...asignacion,
        createdAt: asignacion.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    });

    // --- ALERTA EXPO ---
    if (asignacion.numeroOperacion) {
      const { expoNotificationService } = await import('./expoNotificationService');
      await expoNotificationService.addNotification(asignacion.numeroOperacion, asignacion.numeroCaja || 'Por asignar');
    }
  },

  async getNextOperationNumber(fecha: string): Promise<string> {
    // IMPORTANTE: siempre ir a la red — nunca al caché — para evitar
    // que dos sesiones simultáneas calculen el mismo folio TL.
    const q = query(
      collection(db, COLLECTION_NAME),
      where('fecha', '==', fecha)
    );
    const snapshot = await getDocsFromServer(q); // nunca usa caché
    let maxNum = 0;
    snapshot.docs.forEach(d => {
      const match = (d.data().numeroOperacion || '').match(/^TL(\d+)$/);
      if (match) {
        const n = parseInt(match[1], 10);
        if (n > maxNum) maxNum = n;
      }
    });
    const next = maxNum + 1;
    return `TL${String(next).padStart(3, '0')}`;
  },

  async updateAsignacion(id: string, asignacion: Partial<AsignacionCajaModel>): Promise<void> {
    if (asignacion.numeroCaja) asignacion.numeroCaja = asignacion.numeroCaja.trim().toUpperCase();
    if (asignacion.numeroOperacion) asignacion.numeroOperacion = asignacion.numeroOperacion.trim().toUpperCase();
    if (asignacion.scac) asignacion.scac = asignacion.scac.trim().toUpperCase();

    const docRef = doc(db, COLLECTION_NAME, id);
    await updateDoc(docRef, {
      ...asignacion,
      updatedAt: nowMX()
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
      const libQ = query(collection(db, 'liberacionesCaja'), where('asignacionCajaId', '==', id));
      const libSnap = await getDocs(libQ);
      libSnap.forEach(d => batch.delete(doc(db, 'liberacionesCaja', d.id)));

      // 3. Mark associated liberacion_dock for deletion
      const dockQ = query(collection(db, 'liberacionesDock'), where('asignacionCajaId', '==', id));
      const dockSnap = await getDocs(dockQ);
      dockSnap.forEach(d => batch.delete(doc(db, 'liberacionesDock', d.id)));

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
