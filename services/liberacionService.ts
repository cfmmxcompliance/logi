import { collection, doc, setDoc, getDocs, getDocsFromCache, updateDoc, query, where, limit } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { LiberacionRecord } from '../types.ts';
import { storageService } from './storageService';

const COLLECTION_NAME = 'liberacionesCaja';

export const liberacionService = {
  async getLiberacionesByDate(fecha: string): Promise<LiberacionRecord[]> {
    if (!db) return [];
    try {
      const q = query(
        collection(db, COLLECTION_NAME),
        where('fechaLiberacion', '==', fecha)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LiberacionRecord));
    } catch (error) {
      console.error('Error fetching liberaciones by date:', error);
      return [];
    }
  },

  // ⚡ Cache-first
  async getLiberacionesByDateCached(fecha: string): Promise<LiberacionRecord[]> {
    if (!db) return [];
    const q = query(collection(db, COLLECTION_NAME), where('fechaLiberacion', '==', fecha));
    try {
      const cached = await getDocsFromCache(q);
      if (!cached.empty) return cached.docs.map(d => ({ id: d.id, ...d.data() } as LiberacionRecord));
    } catch { /* cache miss */ }
    try {
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as LiberacionRecord));
    } catch (error) {
      console.error('Error fetching liberaciones by date:', error);
      return [];
    }
  },

  async getLiberacionesByDateRange(start: string, end: string): Promise<LiberacionRecord[]> {
    if (!db) return [];
    try {
      const q = query(
        collection(db, COLLECTION_NAME),
        where('fechaLiberacion', '>=', start),
        where('fechaLiberacion', '<=', end)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as LiberacionRecord));
    } catch (error) {
      console.error('Error fetching liberaciones by date range:', error);
      return [];
    }
  },

  async getAllLiberaciones(): Promise<LiberacionRecord[]> {
    if (!db) return [];
    try {
      const snapshot = await getDocs(collection(db, COLLECTION_NAME));
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LiberacionRecord));
    } catch (error) {
      console.error('Error fetching all liberaciones:', error);
      return [];
    }
  },

  async addLiberacion(liberacion: LiberacionRecord): Promise<string> {
    if (!db) throw new Error("Sin conexión a la base de datos (db nulo).");
    try {
      const docId = liberacion.id || doc(collection(db, COLLECTION_NAME)).id;
      const docRef = doc(db, COLLECTION_NAME, docId);
      await setDoc(docRef, {
        ...liberacion,
        id: docId,
        createdAt: liberacion.createdAt || new Date().toISOString()
      });

      // --- HISTORICO EXPO AUTOMATION ---
      try {
        const selloQ = query(
          collection(db, 'sellosCaja'), 
          where('asignacionCajaId', '==', liberacion.asignacionCajaId),
          limit(1)
        );
        const selloSnap = await getDocs(selloQ);
        let pickupDay = liberacion.fechaHoraRegistro || liberacion.fechaLiberacion; 
        
        if (!selloSnap.empty) {
          const selloData = selloSnap.docs[0].data();
          pickupDay = selloData.fechaHoraRegistro || selloData.fechaAsignacion || pickupDay;
        }

        const expId = `exp_${liberacion.asignacionCajaId}`;
        const historicoRecord = {
          id: expId,
          trailer: liberacion.numeroCaja || '',
          pickupDayCFM: pickupDay,
          dodaUrl: '',
          entryUrl: '',
          dateRequested: '',
          crossingDate: '',
          dateReceived: '',
          daysToReceive: '',
          cfmRef: '',
          expDoda: '',
          comments: '',
          scacAndCaat: '',
          createdAt: Date.now()
        };

        await storageService.upsertHistoricoExpos([historicoRecord]);
      } catch (automationError) {
        console.error("Error automating HistoricoExpo generation:", automationError);
      }
      // --- END HISTORICO EXPO AUTOMATION ---

      return docId;
    } catch (error) {
      console.error('Error adding Liberacion:', error);
      throw error;
    }
  },

  /**
   * updateLiberacion — actualiza campos parciales de un registro existente.
   * Usado por el background upload para parchear las URLs de fotos reales.
   */
  async updateLiberacion(id: string, data: Partial<LiberacionRecord>): Promise<void> {
    if (!db) return;
    try {
      const docRef = doc(db, COLLECTION_NAME, id);
      await updateDoc(docRef, data as Record<string, unknown>);
    } catch (error) {
      console.error('Error updating Liberacion:', error);
      throw error;
    }
  }
};
