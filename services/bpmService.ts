import { 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  writeBatch,
  runTransaction
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from './firebaseConfig';
import { BPMRecord } from '../types.ts';

const COLLECTION_NAME = 'BPM';
const COUNTERS_COLLECTION = 'counters';

export const bpmService = {
  
  /**
   * Genera el siguiente folio consecutivo para el día.
   * Formato: LMHTS + YYYYMMDD + #### (ej: LMHTS202604040001)
   */
  async generateNextFolio(): Promise<string> {
    if (!db) throw new Error("Sin conexión a la base de datos.");
    
    const today = new Date();
    const tzOffset = today.getTimezoneOffset() * 60000;
    const localDate = new Date(today.getTime() - tzOffset);
    
    // Get YYYYMMDD
    const yyyy = localDate.getFullYear();
    const mm = String(localDate.getMonth() + 1).padStart(2, '0');
    const dd = String(localDate.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}${mm}${dd}`;
    
    const counterDocId = `BPM_${dateStr}`;
    const counterRef = doc(db, COUNTERS_COLLECTION, counterDocId);
    
    try {
      const nextId = await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        let nextSeq = 1;
        if (counterDoc.exists()) {
          nextSeq = (counterDoc.data().seq || 0) + 1;
        }
        transaction.set(counterRef, { seq: nextSeq }, { merge: true });
        return nextSeq;
      });
      
      const seqStr = String(nextId).padStart(4, '0');
      return `LMHTS${dateStr}${seqStr}`;
    } catch (e) {
      console.error("Transaction failed: ", e);
      // Fallback in case of extreme failure
      const seqStr = String(Math.floor(Math.random() * 9999)).padStart(4, '0');
      return `LMHTS${dateStr}${seqStr}`;
    }
  },

  async getAllBPMs(): Promise<BPMRecord[]> {
    if (!db) return [];
    try {
      const snapshot = await getDocs(collection(db, COLLECTION_NAME));
      return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as BPMRecord));
    } catch (error) {
      console.error('Error fetching BPMs:', error);
      return [];
    }
  },
  
  async batchUploadBPMs(records: Omit<BPMRecord, 'folio_seguimiento' | 'secuencia_lote'>[], userEmail: string): Promise<{ folio: string, count: number }> {
     if (!db) throw new Error("Sin conexión a la base de datos.");
     if (records.length === 0) return { folio: '', count: 0 };
     
     const folio = await this.generateNextFolio();
     const batch = writeBatch(db);
     const now = new Date().toISOString();
     
     let count = 0;
     const total = records.length;
     
     for (const record of records) {
         count++;
         const docRef = doc(collection(db, COLLECTION_NAME));
         batch.set(docRef, {
             ...record,
             ref_no: folio,
             folio_seguimiento: folio,
             secuencia_lote: `${count}/${total}`,
             subidoPor: userEmail,
             fechaSubida: now
         });
     }
     
     await batch.commit();
     return { folio, count };
  },

  async updateBPM(id: string, updates: Partial<BPMRecord>): Promise<boolean> {
    if (!db) return false;
    try {
      const docRef = doc(db, COLLECTION_NAME, id);
      await updateDoc(docRef, updates);
      return true;
    } catch (error) {
      console.error('Error updating BPM:', error);
      return false;
    }
  },

  async approveAndPushToMasterData(bpmRecord: BPMRecord, userEmail: string): Promise<boolean> {
     if (!db || !bpmRecord.id) return false;
     try {
       const now = new Date().toISOString();
       const batch = writeBatch(db);

       // 1. Update the BPM record to mark it as approved
       const bpmRef = doc(db, COLLECTION_NAME, bpmRecord.id);
       batch.update(bpmRef, {
           aprobadoPor: userEmail,
           fechaAprobacion: now
       });

       // 2. Map fields to Master Data (RawMaterialPart structure)
       const newPartId = bpmRecord.part_no || `BPM_PART_${Date.now()}`;
       const partRef = doc(db, 'parts', newPartId);
       
       const newPart = {
           REGIMEN: bpmRecord.regimen || '',
           PART_NUMBER: bpmRecord.part_no || '',
           TypeMaterial: bpmRecord.type_material || '',
           DESCRIPTION_EN: bpmRecord.description_en || '',
           DESCRIPCION_ES: bpmRecord.spanish_description || '',
           UMC: bpmRecord.um || '',
           UMT: bpmRecord.um || '',
           HTSMX: bpmRecord.hts || '',
           HTSMXBASE: bpmRecord.hts_base || bpmRecord.hts || '',
           HTSMXNICO: bpmRecord.hts_nico || '',
           IGI_DUTY: bpmRecord.igi || '',
           PROSEC: bpmRecord.prosec || '',
           R8: bpmRecord.r8 || '',
           DESCRIPCION_R8: bpmRecord.descripcion_r8 || '',
           RRYNA_NON_DUTY_REQUIREMENTS: bpmRecord.rrynas || '',
           REMARKS: bpmRecord.remarks || '',
           NETWEIGHT: typeof bpmRecord.net_weight === 'number' ? bpmRecord.net_weight : parseFloat(bpmRecord.net_weight as string) || 0,
           IMPORTED_OR_NOT: bpmRecord.imported_or_not || '',
           SENSIBLE: bpmRecord.sensible || '',
           HTS_SerialNo: bpmRecord.ref_no || '',
           CLAVESAT: bpmRecord.clavesat || '',
           DESCRIPCION_CN: bpmRecord.description_cn || '',
           MATERIAL_CN: bpmRecord.material_cn || '',
           MATERIAL_EN: bpmRecord.material_en || '',
           FUNCTION_CN: bpmRecord.function_cn || '',
           FUNCTION_EN: bpmRecord.function_en || '',
           COMPANY: bpmRecord.company || 'CFMOTO',
           ESTIMATED: 0,
           UPDATE_TIME: now
       };

       batch.set(partRef, newPart, { merge: true });
       await batch.commit();
       return true;
     } catch (e) {
       console.error("Error approving BPM and pushing to masterdata: ", e);
       return false;
     }
  },

  async approveAndPushToMasterDataBatch(bpmRecords: BPMRecord[], userEmail: string): Promise<boolean> {
      if (!db || bpmRecords.length === 0) return false;
      try {
          const now = new Date().toISOString();
          
          // Firestore batch max operations is 500. We do 2 writes per record (1 update, 1 set). Max length = 250 records per batch.
          const chunkSize = 250;
          for (let i = 0; i < bpmRecords.length; i += chunkSize) {
              const chunk = bpmRecords.slice(i, i + chunkSize);
              const batch = writeBatch(db);

              for (const record of chunk) {
                  if (!record.id) continue;
                  
                  const bpmRef = doc(db, COLLECTION_NAME, record.id);
                  batch.update(bpmRef, {
                      aprobadoPor: userEmail,
                      fechaAprobacion: now
                  });

                  const newPartId = record.part_no || `BPM_PART_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                  const partRef = doc(db, 'parts', newPartId);
                  
                  const newPart = {
                      REGIMEN: record.regimen || '',
                      PART_NUMBER: record.part_no || '',
                      TypeMaterial: record.type_material || '',
                      DESCRIPTION_EN: record.description_en || '',
                      DESCRIPCION_ES: record.spanish_description || '',
                      UMC: record.um || '',
                      UMT: record.um || '',
                      HTSMX: record.hts || '',
                      HTSMXBASE: record.hts_base || record.hts || '',
                      HTSMXNICO: record.hts_nico || '',
                      IGI_DUTY: record.igi || '',
                      PROSEC: record.prosec || '',
                      R8: record.r8 || '',
                      DESCRIPCION_R8: record.descripcion_r8 || '',
                      RRYNA_NON_DUTY_REQUIREMENTS: record.rrynas || '',
                      REMARKS: record.remarks || '',
                      NETWEIGHT: typeof record.net_weight === 'number' ? record.net_weight : parseFloat(record.net_weight as string) || 0,
                      IMPORTED_OR_NOT: record.imported_or_not || '',
                      SENSIBLE: record.sensible || '',
                      HTS_SerialNo: record.ref_no || '',
                      CLAVESAT: record.clavesat || '',
                      DESCRIPCION_CN: record.description_cn || '',
                      MATERIAL_CN: record.material_cn || '',
                      MATERIAL_EN: record.material_en || '',
                      FUNCTION_CN: record.function_cn || '',
                      FUNCTION_EN: record.function_en || '',
                      COMPANY: record.company || 'CFMOTO',
                      ESTIMATED: 0,
                      UPDATE_TIME: now
                  };

                  batch.set(partRef, newPart, { merge: true });
              }
              await batch.commit();
          }
          return true;
      } catch (e) {
          console.error("Error batch approving BPMs: ", e);
          return false;
      }
  },

  async deleteBPM(id: string): Promise<boolean> {
    if (!db) return false;
    try {
      const docRef = doc(db, COLLECTION_NAME, id);
      await deleteDoc(docRef);
      return true;
    } catch (error) {
      console.error('Error deleting BPM:', error);
      return false;
    }
  },

  async batchDeleteBPMs(ids: string[]): Promise<boolean> {
      if (!db || ids.length === 0) return false;
      try {
          const batch = writeBatch(db);
          for (const id of ids) {
              const docRef = doc(db, COLLECTION_NAME, id);
              batch.delete(docRef);
          }
          await batch.commit();
          return true;
      } catch (error) {
          console.error("Error batch deleting BPMs:", error);
          return false;
      }
  },

  async uploadPhotoToDrive(fileBase64: string, fileName: string, mimeType: string = 'image/jpeg'): Promise<string | null> {
    try {
      const functions = getFunctions(undefined, 'us-central1');
      const saveBpmPhoto = httpsCallable(functions, 'saveBpmPhotoToDrive');
      const result = await saveBpmPhoto({
         fileName,
         fileBase64,
         mimeType
      });
      const data = result.data as any;
      if (data.success && data.url) {
         return data.url;
      }
      return null;
    } catch (e: any) {
      console.error('Error uploading BPM Photo to Drive via Cloud function', e);
      throw e;
    }
  }
};
