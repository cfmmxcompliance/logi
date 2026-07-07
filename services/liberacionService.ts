import { collection, doc, setDoc, getDocs, getDoc, getDocsFromCache, updateDoc, query, where, limit } from 'firebase/firestore';
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
       // --- AUTOMATE HISTORICO EXPO RECORD ---
        // Usa la FECHA/HORA SELLADO (del sello asignado) como pickupDayCFM
        let pickupDay = '';
        let transportLine = '';
        let team = '';
        let seal = '';

        if (liberacion.asignacionCajaId) {
           // Buscar el sello para obtener su fechaHoraRegistro (= FECHA/HORA SELLADO)
           try {
             const sellosQ = query(collection(db, 'sellos'), where('asignacionCajaId', '==', liberacion.asignacionCajaId), limit(1));
             const sellosSnap = await getDocs(sellosQ);
             if (!sellosSnap.empty) {
               const selloData = sellosSnap.docs[0].data();
               pickupDay = selloData.fechaHoraRegistro || '';
               seal = selloData.selloAsignado || '';
             }
           } catch (e) {
             console.warn('[HistoricoExpo] Error fetching sello for pickupDay:', e);
           }

           // Fallback: si no hay sello, usar la fecha de la liberación
           if (!pickupDay) {
             pickupDay = liberacion.fechaHoraRegistro || liberacion.fechaLiberacion || new Date().toLocaleString('es-MX', { timeZone: 'America/Monterrey', hour12: false });
           }

           const asigDoc = await getDoc(doc(db, 'asignacion_cajas', liberacion.asignacionCajaId));
            if (asigDoc.exists()) {
                const asigData = asigDoc.data();
                // Use the persisted scac field (e.g. "MXTL") if available
                team = asigData.scac || '';
                const tId = asigData.transportLineId || asigData.transportLine || '';
                if (tId) {
                    const tlQ = query(collection(db, 'transport_lines'), where('transportLineId', '==', tId), limit(1));
                    const tlSnap = await getDocs(tlQ);
                    if (!tlSnap.empty) {
                        const tlData = tlSnap.docs[0].data();
                        // Fallback: if scac was not persisted yet, use TransportLine from catalog
                        if (!team) team = tlData.TransportLine || tId;
                        transportLine = tlData.nombreSubLinea || tlData.TransportLine || tId;
                    } else {
                        if (!team) team = tId;
                        transportLine = tId;
                    }
                }
            }
        } else {
           pickupDay = liberacion.fechaHoraRegistro || liberacion.fechaLiberacion || new Date().toLocaleString('es-MX', { timeZone: 'America/Monterrey', hour12: false });
        }

        const expId = `exp_${liberacion.asignacionCajaId}`;

        // Preservar dodaUrl/entryUrl si el registro ya existe
        let existingDodaUrl = '';
        let existingEntryUrl = '';
        let existingDodaUploadedAt = '';
        let existingEntryUploadedAt = '';
        try {
          const existingDoc = await getDoc(doc(db, 'historico_expo', expId));
          if (existingDoc.exists()) {
            const d = existingDoc.data();
            existingDodaUrl = d.dodaUrl || '';
            existingEntryUrl = d.entryUrl || '';
            existingDodaUploadedAt = d.dodaUploadedAt || '';
            existingEntryUploadedAt = d.entryUploadedAt || '';
          }
        } catch (_) {}

        const historicoRecord = {
          id: expId,
          trailer: liberacion.numeroCaja || '',
          idNumber: liberacion.asignacionCajaId || '',
          seal,
          team,
          transportLine,
          pickupDayCFM: pickupDay,
          dodaUrl: existingDodaUrl,
          entryUrl: existingEntryUrl,
          ...(existingDodaUploadedAt ? { dodaUploadedAt: existingDodaUploadedAt } : {}),
          ...(existingEntryUploadedAt ? { entryUploadedAt: existingEntryUploadedAt } : {}),
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
