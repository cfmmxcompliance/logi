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

  async getLiberacionesByAsignacionIds(ids: string[]): Promise<LiberacionRecord[]> {
    if (!db || !ids || ids.length === 0) return [];
    try {
      const chunks = [];
      for (let i = 0; i < ids.length; i += 30) {
        chunks.push(ids.slice(i, i + 30));
      }
      const results: LiberacionRecord[] = [];
      for (const chunk of chunks) {
        const q = query(
          collection(db, COLLECTION_NAME),
          where('asignacionCajaId', 'in', chunk)
        );
        const snapshot = await getDocs(q);
        snapshot.docs.forEach(d => results.push({ id: d.id, ...d.data() } as LiberacionRecord));
      }
      return results;
    } catch (error) {
      console.error('Error fetching liberaciones by ids:', error);
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
        // Usa la FECHA de la asignacion (YYYY-MM-DD hora Mexico) como pickupDayCFM
        // Esto evita el problema de zona horaria UTC vs Mexico despues de las 6 PM
        let pickupDay = '';
        let transportLine = '';
        let team = '';
        let seal = '';

        if (liberacion.asignacionCajaId) {
           // Obtener el sello para sellado y equipo
           try {
             const sellosQ = query(collection(db, 'sellos'), where('asignacionCajaId', '==', liberacion.asignacionCajaId), limit(1));
             const sellosSnap = await getDocs(sellosQ);
             if (!sellosSnap.empty) {
               const selloData = sellosSnap.docs[0].data();
               seal = selloData.selloAsignado || '';
             }
           } catch (e) {
             console.warn('[HistoricoExpo] Error fetching sello:', e);
           }

           const asigDoc = await getDoc(doc(db, 'asignacion_cajas', liberacion.asignacionCajaId));
            if (asigDoc.exists()) {
                const asigData = asigDoc.data();
                // ✅ Usar asignacion_cajas.fecha como pickupDayCFM (YYYY-MM-DD, ya en hora México)
                pickupDay = asigData.fecha || liberacion.fechaLiberacion || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
                team = asigData.scac || '';
                const tId = asigData.transportLineId || asigData.transportLine || '';
                if (tId) {
                    const tlQ = query(collection(db, 'transport_lines'), where('transportLineId', '==', tId), limit(1));
                    const tlSnap = await getDocs(tlQ);
                    if (!tlSnap.empty) {
                        const tlData = tlSnap.docs[0].data();
                        if (!team) team = tlData.TransportLine || tId;
                        transportLine = tlData.nombreSubLinea || tlData.TransportLine || tId;
                    } else {
                        if (!team) team = tId;
                        transportLine = tId;
                    }
                }
            } else {
               // Fallback: fecha de la liberación en hora México
               pickupDay = liberacion.fechaLiberacion || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
            }
        } else {
           pickupDay = liberacion.fechaLiberacion || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
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
          createdAt: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' })
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
