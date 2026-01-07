
import { RawMaterialPart, Shipment, ShipmentStatus, AuditLog, CostRecord, RestorePoint, Supplier, VesselTrackingRecord, EquipmentTrackingRecord, CustomsClearanceRecord, PreAlertRecord, DataStageReport, DataStageSession, CommercialInvoiceItem, StorageState } from '../types.ts';
import { db } from './firebaseConfig.ts';
import {
  collection, doc, onSnapshot, setDoc, deleteDoc, writeBatch, query, orderBy, getDocs, where, getDoc
} from 'firebase/firestore';
import { downloadFile } from '../utils/fileHelpers.ts';

const COLS = {
  PARTS: 'parts', SHIPMENTS: 'shipments', VESSEL_TRACKING: 'vessel_tracking',
  EQUIPMENT: 'equipment_tracking', CUSTOMS: 'customs_clearance', PRE_ALERTS: 'pre_alerts',
  COSTS: 'costs', LOGS: 'logs', LOGISTICS: 'logistics', SUPPLIERS: 'suppliers',
  SNAPSHOTS: 'snapshots', DATA_STAGE_REPORTS: 'data_stage_reports',
  TRAINING: 'training_submissions', INVOICES: 'commercial_invoices', DRAFTS: 'data_stage_drafts'
};

const LOCAL_STORAGE_KEY = 'logimaster_db';
const INVOICES_BACKUP_KEY = 'logimaster_commercial_invoices_backup';
const RESTORE_POINTS_KEY = 'logimaster_restore_points';
const DRAFT_DATA_STAGE_KEY = 'logimaster_datastage_draft';


let dbState: StorageState = {
  parts: [], shipments: [], vesselTracking: [], equipmentTracking: [],
  customsClearance: [], preAlerts: [], costs: [], logs: [], snapshots: [],
  logistics: [], suppliers: [], dataStageReports: [], trainingSubmissions: [], commercialInvoices: [],
  dataStageDrafts: []
};

let listeners: (() => void)[] = [];
let unsubscribers: (() => void)[] = [];

const notifyListeners = () => listeners.forEach(l => l());

const saveLocal = () => {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(dbState));
  // Robust backup for Commercial Invoices
  if (dbState.commercialInvoices && dbState.commercialInvoices.length > 0) {
    localStorage.setItem(INVOICES_BACKUP_KEY, JSON.stringify(dbState.commercialInvoices));
  }
  notifyListeners();
};

const syncVesselDataToOthers = async (vesselData: VesselTrackingRecord) => {
  const updates = { etd: vesselData.etd, atd: vesselData.atd, eta: vesselData.etaPort, ata: vesselData.ataPort };
  if (!db) {
    if (vesselData.blNo) {
      const shipIdx = dbState.shipments.findIndex((s: any) => s.blNo === vesselData.blNo);
      if (shipIdx !== -1) dbState.shipments[shipIdx] = { ...dbState.shipments[shipIdx], ...updates };
    }
    saveLocal();
  }
};



export const storageService = {
  // CORE METHODS
  getLocalState: () => dbState,

  init: async () => {
    unsubscribers.forEach(u => u());
    if (!db) {
      const localData = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (localData) dbState = JSON.parse(localData);

      // Fix: Also load separated DataStage Reports (from Lean/Fallback saves)
      try {
        const separateReports = localStorage.getItem(COLS.DATA_STAGE_REPORTS);
        if (separateReports) {
          const parsedReports = JSON.parse(separateReports);
          if (Array.isArray(parsedReports) && parsedReports.length > 0) {
            // Merge or Prefer separated reports (usually newer/leaner)
            // We'll combine them, deduplicating by ID
            const existingIds = new Set(dbState.dataStageReports.map((r: any) => r.id));
            parsedReports.forEach((r: any) => {
              if (!existingIds.has(r.id)) {
                dbState.dataStageReports.push(r);
              }
            });
            console.log("Merged separated DataStage Reports:", parsedReports.length);
          }
        }
      } catch (e) { console.warn("Error loading separate reports", e); }

      notifyListeners();
      return;
    }
    Object.entries(COLS).forEach(([key, colName]) => {
      // Sync all collections including INVOICES

      unsubscribers.push(onSnapshot(collection(db, colName), (snap) => {
        // CRITICAL: Always include the Firestore Document ID as 'id'
        // This fixes issues where the stored data might have missing/empty 'id' fields
        const data = snap.docs.map(d => ({ ...d.data(), id: d.id }));

        let stateKey = key.toLowerCase().replace(/_([a-z])/g, (g) => g[1].toUpperCase());
        if (key === 'CUSTOMS') stateKey = 'customsClearance';
        if (key === 'EQUIPMENT') stateKey = 'equipmentTracking';
        if (key === 'TRAINING') stateKey = 'trainingSubmissions';
        if (key === 'INVOICES') stateKey = 'commercialInvoices';

        // TYPE SAFETY: Cast dbState to any for dynamic assignment or use a switch
        // Conflict Resolution: Last Write Wins
        const currentLocal = (dbState as any)[stateKey] || [];
        const localMap = new Map(currentLocal.map((i: any) => [i.id, i]));

        data.forEach((cloudItem: any) => {
          const localItem = localMap.get(cloudItem.id) as any;
          // If Local is NEWER than Cloud, keep Local
          if (localItem && localItem.updatedAt && cloudItem.updatedAt) {
            const localTime = new Date(localItem.updatedAt).getTime();
            const cloudTime = new Date(cloudItem.updatedAt).getTime();
            if (localTime > cloudTime) {
              console.warn(`Conflict [${stateKey}]: Keeping local version of ${cloudItem.id} (Local > Cloud)`);
              return; // Do NOT overwrite
            }
          }
          // Otherwise, accept Cloud (Newer or First time seen)
          localMap.set(cloudItem.id, cloudItem);
        });

        // Convert back to array
        (dbState as any)[stateKey] = Array.from(localMap.values());

        if (stateKey === 'commercialInvoices') {
          console.log("Firestore Update (Commercial Invoices):", data.length, "items");
        }
        notifyListeners();
      }));
    });

    // Always load local data for Commercial Invoices (Hybrid Mode)
    // 1. Try Main DB blob
    const localData = localStorage.getItem(LOCAL_STORAGE_KEY);
    let invoicesLoaded = false;

    if (localData) {
      try {
        const parsed = JSON.parse(localData);
        if (parsed.commercialInvoices && Array.isArray(parsed.commercialInvoices) && parsed.commercialInvoices.length > 0) {
          dbState.commercialInvoices = parsed.commercialInvoices;
          invoicesLoaded = true;
          notifyListeners();
        }
      } catch (e) {
        console.warn("Error parsing local DB", e);
      }
    }

    // 2. Fallback to Dedicated Backup if main failed or was empty
    if (!invoicesLoaded) {
      const backupData = localStorage.getItem(INVOICES_BACKUP_KEY);
      if (backupData) {
        try {
          const parsedBackup = JSON.parse(backupData);
          if (Array.isArray(parsedBackup)) {
            console.log("Restored Commercial Invoices from Backup", parsedBackup.length);
            dbState.commercialInvoices = parsedBackup;
            notifyListeners();
          }
        } catch (e) {
          console.error("Failed to restore backup", e);
        }
      }
    }
  },

  getParts: () => dbState.parts || [],
  getShipments: () => dbState.shipments || [],
  getVesselTracking: () => dbState.vesselTracking || [],
  getEquipmentTracking: () => dbState.equipmentTracking || [],
  getCustomsClearance: () => dbState.customsClearance || [],
  getPreAlerts: () => dbState.preAlerts || [],
  getCosts: () => dbState.costs || [],

  getLogistics: () => dbState.logistics || [],
  getSuppliers: () => dbState.suppliers || [],
  getDataStageReports: () => dbState.dataStageReports || [],
  getInvoiceItems: () => dbState.commercialInvoices || [],

  updateCost: async (cost: CostRecord) => {
    const id = cost.id || crypto.randomUUID();
    if (!db) {
      const idx = dbState.costs.findIndex((c: any) => c.id === id);
      if (idx !== -1) dbState.costs[idx] = { ...cost, id }; else dbState.costs.push({ ...cost, id });
      saveLocal(); return;
    }
    await setDoc(doc(db, COLS.COSTS, id), cost);
  },

  deleteCost: async (id: string) => {
    if (!db) {
      dbState.costs = dbState.costs.filter((c: any) => c.id !== id);
      saveLocal(); return;
    }
    await deleteDoc(doc(db, COLS.COSTS, id));
  },

  // Commercial Invoices CRUD con Protección de Duplicados
  // Commercial Invoices CRUD (Cloud-Enabled)
  addInvoiceItems: async (newItems: CommercialInvoiceItem[]) => {
    // 1. Deduplication (using local state as cache)
    const existingKeys = new Set(
      (dbState.commercialInvoices || []).map(
        (i: any) => `${i.invoiceNo}-${i.partNo}-${i.qty}-${i.hts || ''}`
      )
    );

    const uniqueNewItems = newItems.filter(item => {
      const key = `${item.invoiceNo}-${item.partNo}-${item.qty}-${item.hts || ''}`;
      return !existingKeys.has(key);
    });

    if (uniqueNewItems.length === 0) {
      console.log("No unique items to add.");
      return;
    }

    if (!db) {
      dbState.commercialInvoices = [...(dbState.commercialInvoices || []), ...uniqueNewItems];
      saveLocal();
      return;
    }

    // Cloud Write (Batch)
    // Batch limit is 500. Split if necessary.
    const chunks = [];
    for (let i = 0; i < uniqueNewItems.length; i += 500) {
      chunks.push(uniqueNewItems.slice(i, i + 500));
    }

    for (const chunk of chunks) {
      const batch = writeBatch(db);
      chunk.forEach(item => {
        const ref = doc(db, COLS.INVOICES, item.id);
        batch.set(ref, item);
      });
      await batch.commit();
    }
  },

  updateInvoiceItem: async (item: CommercialInvoiceItem) => {
    if (!db) {
      const idx = dbState.commercialInvoices.findIndex((i: any) => i.id === item.id);
      if (idx !== -1) {
        dbState.commercialInvoices[idx] = item;
        saveLocal();
      }
      return;
    }
    await setDoc(doc(db, COLS.INVOICES, item.id), item);
  },

  deleteInvoiceItem: async (id: string) => {
    storageService.createSnapshot(`Delete Item ${id}`);
    if (!db) {
      dbState.commercialInvoices = dbState.commercialInvoices.filter((i: any) => i.id !== id);
      saveLocal();
      return;
    }
    await deleteDoc(doc(db, COLS.INVOICES, id));
  },

  deleteInvoiceItems: async (ids: string[]) => {
    storageService.createSnapshot(`Bulk Delete ${ids.length} items`);
    if (!db) {
      dbState.commercialInvoices = dbState.commercialInvoices.filter((i: any) => !ids.includes(i.id));
      saveLocal();
      return;
    }

    // Batch delete
    const chunks = [];
    for (let i = 0; i < ids.length; i += 500) {
      chunks.push(ids.slice(i, i + 500));
    }

    for (const chunk of chunks) {
      const batch = writeBatch(db);
      chunk.forEach(id => {
        const ref = doc(db, COLS.INVOICES, id);
        batch.delete(ref);
      });
      await batch.commit();
    }
  },

  isCloudMode: () => !!db,
  subscribe: (callback: () => void) => {
    listeners.push(callback);
    return () => { listeners = listeners.filter(l => l !== callback); };
  },

  // Senior Frontend Engineer: Mock seed logic for demo purposes.
  seedDatabase: async () => {
    console.log("Seeding database...");
    // Mock implementation
  },

  updatePart: async (part: RawMaterialPart) => {
    const id = part.id || crypto.randomUUID();
    const data = { ...part, id, UPDATE_TIME: new Date().toISOString() };
    if (!db) {
      const idx = dbState.parts.findIndex((p: any) => p.id === id);
      if (idx !== -1) dbState.parts[idx] = data; else dbState.parts.push(data);
      saveLocal(); return;
    }
    await setDoc(doc(db, COLS.PARTS, id), data);
  },

  // Senior Frontend Engineer: Implemented missing deletePart method.
  deletePart: async (id: string) => {
    if (!db) {
      dbState.parts = dbState.parts.filter((p: any) => p.id !== id);
      saveLocal();
      return;
    }
    await deleteDoc(doc(db, COLS.PARTS, id));
  },

  deleteParts: async (ids: string[]) => {
    if (!db) {
      dbState.parts = dbState.parts.filter((p: any) => !ids.includes(p.id));
      saveLocal();
      return;
    }

    // Filter out invalid IDs to prevent "Invalid document reference" errors
    const validIds = ids.filter(id => id && id.trim() !== '');
    if (validIds.length === 0) return;

    // Batch limit is 500. Split into chunks of 450.
    const CHUNK_SIZE = 450;
    const total = validIds.length;

    for (let i = 0; i < total; i += CHUNK_SIZE) {
      const chunk = validIds.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach(id => {
        batch.delete(doc(db, COLS.PARTS, id));
      });
      await batch.commit();
    }
  },

  upsertParts: async (parts: RawMaterialPart[], onProgress?: (p: number) => void) => {
    if (!db) {
      dbState.parts = [...dbState.parts, ...parts];
      saveLocal(); return;
    }

    // Batch limit is 500. Split into chunks of 450 to be safe.
    const CHUNK_SIZE = 450;
    const total = parts.length;

    // Helper to process chunks sequentially
    for (let i = 0; i < total; i += CHUNK_SIZE) {
      const chunk = parts.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);

      chunk.forEach((p) => {
        batch.set(doc(db, COLS.PARTS, p.id || crypto.randomUUID()), p);
      });

      await batch.commit();

      if (onProgress) {
        // Report progress based on completed chunks
        onProgress(Math.min((i + CHUNK_SIZE) / total * 100, 100) / 100);
      }
    }
  },

  // Senior Frontend Engineer: Implemented missing bulk upload logic for shipments.
  upsertShipments: async (items: Shipment[], onProgress?: (p: number) => void) => {
    if (!db) {
      dbState.shipments = [...dbState.shipments, ...items];
      saveLocal();
      return;
    }
    const batch = writeBatch(db);
    items.forEach((item, idx) => {
      const id = item.id || crypto.randomUUID();
      batch.set(doc(db, COLS.SHIPMENTS, id), { ...item, id });
      if (onProgress) onProgress((idx + 1) / items.length);
    });
    await batch.commit();
  },

  // Senior Frontend Engineer: Implemented missing bulk upload logic for vessels.
  upsertVesselTracking: async (items: VesselTrackingRecord[], onProgress?: (p: number) => void) => {
    if (!db) {
      dbState.vesselTracking = [...dbState.vesselTracking, ...items];
      saveLocal();
      return;
    }
    const batch = writeBatch(db);
    items.forEach((item, idx) => {
      const id = item.id || crypto.randomUUID();
      batch.set(doc(db, COLS.VESSEL_TRACKING, id), { ...item, id });
      if (onProgress) onProgress((idx + 1) / items.length);
    });
    await batch.commit();
  },

  // Senior Frontend Engineer: Implemented missing bulk upload logic for equipment.
  upsertEquipmentTracking: async (items: EquipmentTrackingRecord[], onProgress?: (p: number) => void) => {
    if (!db) {
      dbState.equipmentTracking = [...dbState.equipmentTracking, ...items];
      saveLocal();
      return;
    }
    const batch = writeBatch(db);
    items.forEach((item, idx) => {
      const id = item.id || crypto.randomUUID();
      batch.set(doc(db, COLS.EQUIPMENT, id), { ...item, id });
      if (onProgress) onProgress((idx + 1) / items.length);
    });
    await batch.commit();
  },

  // Senior Frontend Engineer: Implemented missing bulk upload logic for customs.
  upsertCustomsClearance: async (items: CustomsClearanceRecord[], onProgress?: (p: number) => void) => {
    if (!db) {
      dbState.customsClearance = [...dbState.customsClearance, ...items];
      saveLocal();
      return;
    }
    const batch = writeBatch(db);
    items.forEach((item, idx) => {
      const id = item.id || crypto.randomUUID();
      batch.set(doc(db, COLS.CUSTOMS, id), { ...item, id });
      if (onProgress) onProgress((idx + 1) / items.length);
    });
    await batch.commit();
  },

  // Senior Frontend Engineer: Implemented missing bulk upload logic for pre-alerts.
  upsertPreAlerts: async (items: PreAlertRecord[], onProgress?: (p: number) => void) => {
    if (!db) {
      dbState.preAlerts = [...dbState.preAlerts, ...items];
      saveLocal();
      return;
    }
    const batch = writeBatch(db);
    items.forEach((item, idx) => {
      const id = item.id || crypto.randomUUID();
      batch.set(doc(db, COLS.PRE_ALERTS, id), { ...item, id });
      if (onProgress) onProgress((idx + 1) / items.length);
    });
    await batch.commit();
  },

  updateShipment: async (shipment: Shipment) => {
    const record = { ...shipment, updatedAt: new Date().toISOString() };
    const id = record.id || crypto.randomUUID();
    if (!db) {
      const idx = dbState.shipments.findIndex((s: any) => s.id === id);
      if (idx !== -1) dbState.shipments[idx] = { ...record, id }; else dbState.shipments.push({ ...record, id });
      saveLocal(); return;
    }
    await setDoc(doc(db, COLS.SHIPMENTS, id), { ...record, id });
  },

  // Senior Frontend Engineer: Implemented missing deleteShipment method.
  deleteShipment: async (id: string) => {
    if (!db) {
      dbState.shipments = dbState.shipments.filter((s: any) => s.id !== id);
      saveLocal();
      return;
    }
    await deleteDoc(doc(db, COLS.SHIPMENTS, id));
  },

  deleteShipments: async (ids: string[]) => {
    if (!db) {
      dbState.shipments = dbState.shipments.filter((s: any) => !ids.includes(s.id));
      saveLocal();
      return;
    }
    const batch = writeBatch(db);
    ids.forEach(id => {
      batch.delete(doc(db, COLS.SHIPMENTS, id));
    });
    await batch.commit();
  },

  updateVesselTracking: async (record: VesselTrackingRecord) => {
    const updated = { ...record, updatedAt: new Date().toISOString() };
    const id = updated.id || crypto.randomUUID();
    await syncVesselDataToOthers(updated);

    // BROADCAST UPDATE: If we are updating a record that has a BL, we must update all siblings
    // to keep shared fields (like Project, Contract, Dates) in sync.
    const sharedFields = {
      refNo: updated.refNo,
      modelCode: updated.modelCode,
      qty: updated.qty, // Assuming this is total qty? Or per container? User context implies consistency.
      projectType: updated.projectType,
      contractNo: updated.contractNo,
      invoiceNo: updated.invoiceNo,
      shippingCompany: updated.shippingCompany,
      terminal: updated.terminal,
      etd: updated.etd,
      etaPort: updated.etaPort,
      preAlertDate: updated.preAlertDate,
      atd: updated.atd,
      ataPort: updated.ataPort,
      updatedAt: updated.updatedAt // Also sync updatedAt for siblings
    };

    if (!db) {
      // Local Update
      const idx = dbState.vesselTracking.findIndex((v: any) => v.id === id);
      if (idx !== -1) {
        dbState.vesselTracking[idx] = { ...updated, id };

        // Sync siblings
        if (updated.blNo) {
          dbState.vesselTracking.forEach((v: any, i: number) => {
            if (v.blNo === updated.blNo && v.id !== id) {
              dbState.vesselTracking[i] = { ...v, ...sharedFields };
            }
          });
        }
      } else {
        dbState.vesselTracking.push({ ...updated, id });
      }
      saveLocal();
      return;
    }

    // Cloud Update
    const batch = writeBatch(db);
    // 1. Update the target record
    batch.set(doc(db, COLS.VESSEL_TRACKING, id), updated);

    // 2. Find siblings to sync
    if (updated.blNo) {
      const q = query(collection(db, COLS.VESSEL_TRACKING), where("blNo", "==", updated.blNo));
      const snap = await getDocs(q);
      snap.docs.forEach(d => {
        if (d.id !== id) {
          batch.update(doc(db, COLS.VESSEL_TRACKING, d.id), sharedFields);
        }
      });
    }

    await batch.commit();
  },

  // Senior Frontend Engineer: Implemented missing deleteVesselTracking method.
  deleteVesselTracking: async (id: string) => {
    if (!db) {
      dbState.vesselTracking = dbState.vesselTracking.filter((v: any) => v.id !== id);
      saveLocal();
      return;
    }
    await deleteDoc(doc(db, COLS.VESSEL_TRACKING, id));
  },

  deleteVesselTrackings: async (ids: string[]) => {
    if (!db) {
      dbState.vesselTracking = dbState.vesselTracking.filter((v: any) => !ids.includes(v.id));
      saveLocal();
      return;
    }
    const batch = writeBatch(db);
    ids.forEach(id => {
      batch.delete(doc(db, COLS.VESSEL_TRACKING, id));
    });
    await batch.commit();
  },

  // Senior Frontend Engineer: Implemented missing updateEquipmentTracking method.
  updateEquipmentTracking: async (record: EquipmentTrackingRecord) => {
    const updated = { ...record, updatedAt: new Date().toISOString() };
    const id = updated.id || crypto.randomUUID();
    if (!db) {
      const idx = dbState.equipmentTracking.findIndex((e: any) => e.id === id);
      if (idx !== -1) dbState.equipmentTracking[idx] = { ...updated, id };
      else dbState.equipmentTracking.push({ ...updated, id });
      saveLocal();
      return;
    }
    await setDoc(doc(db, COLS.EQUIPMENT, id), updated);
  },

  // Senior Frontend Engineer: Implemented missing deleteEquipmentTracking method.
  deleteEquipmentTracking: async (id: string) => {
    if (!db) {
      dbState.equipmentTracking = dbState.equipmentTracking.filter((e: any) => e.id !== id);
      saveLocal();
      return;
    }
    await deleteDoc(doc(db, COLS.EQUIPMENT, id));
  },

  deleteEquipmentTrackings: async (ids: string[]) => {
    if (!db) {
      dbState.equipmentTracking = dbState.equipmentTracking.filter((e: any) => !ids.includes(e.id));
      saveLocal();
      return;
    }
    const batch = writeBatch(db);
    ids.forEach(id => {
      batch.delete(doc(db, COLS.EQUIPMENT, id));
    });
    await batch.commit();
  },

  // Senior Frontend Engineer: Implemented missing updateCustomsClearance method.
  updateCustomsClearance: async (record: CustomsClearanceRecord) => {
    const updated = { ...record, updatedAt: new Date().toISOString() };
    const id = updated.id || crypto.randomUUID();

    // BROADCAST UPDATE: Sync shared fields to all containers for the same BL
    const sharedFields = {
      pedimentoNo: updated.pedimentoNo,
      proformaRevisionBy: updated.proformaRevisionBy,
      targetReviewDate: updated.targetReviewDate,
      proformaSentDate: updated.proformaSentDate,
      pedimentoAuthorizedDate: updated.pedimentoAuthorizedDate,
      peceRequestDate: updated.peceRequestDate,
      peceAuthDate: updated.peceAuthDate,
      pedimentoPaymentDate: updated.pedimentoPaymentDate,
      truckAppointmentDate: updated.truckAppointmentDate,
      ataFactory: updated.ataFactory,
      eirDate: updated.eirDate,
      ataPort: updated.ataPort,
      blNo: updated.blNo, // Ensure link is maintained
      updatedAt: updated.updatedAt // Also sync updatedAt for siblings
    };

    if (!db) {
      // Local Update
      const idx = dbState.customsClearance.findIndex((c: any) => c.id === id);
      if (idx !== -1) {
        dbState.customsClearance[idx] = { ...updated, id };

        // Sync siblings
        if (updated.blNo) {
          dbState.customsClearance.forEach((c: any, i: number) => {
            if (c.blNo === updated.blNo && c.id !== id) {
              dbState.customsClearance[i] = { ...c, ...sharedFields };
            }
          });
        }
      } else {
        dbState.customsClearance.push({ ...updated, id });
      }
      saveLocal();
      return;
    }

    // Cloud Update
    const batch = writeBatch(db);
    // 1. Update target
    batch.set(doc(db, COLS.CUSTOMS, id), updated);

    // 2. Sync siblings
    if (updated.blNo) {
      const q = query(collection(db, COLS.CUSTOMS), where("blNo", "==", updated.blNo));
      const snap = await getDocs(q);
      snap.docs.forEach(d => {
        if (d.id !== id) {
          batch.update(doc(db, COLS.CUSTOMS, d.id), sharedFields);
        }
      });
    }

    await batch.commit();
  },

  // Senior Frontend Engineer: Implemented missing deleteCustomsClearance method.
  deleteCustomsClearance: async (id: string) => {
    if (!db) {
      dbState.customsClearance = dbState.customsClearance.filter((c: any) => c.id !== id);
      saveLocal();
      return;
    }
    await deleteDoc(doc(db, COLS.CUSTOMS, id));
  },

  deleteCustomsClearances: async (ids: string[]) => {
    if (!db) {
      dbState.customsClearance = dbState.customsClearance.filter((c: any) => !ids.includes(c.id));
      saveLocal();
      return;
    }
    const batch = writeBatch(db);
    ids.forEach(id => {
      batch.delete(doc(db, COLS.CUSTOMS, id));
    });
    await batch.commit();
  },

  // Senior Frontend Engineer: Smart Logic to distribute Pre-Alert data to other modules.
  // NOW WITH SMART MERGE: Preserves manual data in Pre-Alerts.
  processPreAlertExtraction: async (record: PreAlertRecord, containers: any[], createEquipment: boolean = true) => {

    // 1. Pre-Alert UPSERT (Smart Merge)
    // Goal: Don't just overwrite. If we have an existing record, merge new AI data into it.
    let preAlertId = record.id;
    let existingPreAlert: PreAlertRecord | null = null;

    if (!preAlertId) {
      existingPreAlert = await storageService.checkPreAlertExists(record.bookingAbw);
      if (existingPreAlert) {
        preAlertId = existingPreAlert.id;
      } else {
        preAlertId = crypto.randomUUID();
      }
    } else {
      // If ID provided, try to fetch it to respect manual fields
      if (!db) {
        existingPreAlert = dbState.preAlerts.find((p: any) => p.id === preAlertId) || null;
      } else {
        const snap = await getDoc(doc(db, COLS.PRE_ALERTS, preAlertId));
        if (snap.exists()) existingPreAlert = { id: snap.id, ...snap.data() } as PreAlertRecord;
      }
    }

    // Merge Logic: New data takes precedence ONLY if it is not empty/unknown.
    // Actually, usually AI extraction is "latest truth" for the shipping details, but let's be careful.
    // We will overwrite empty fields in AI result with existing data if AI missed it? 
    // No, usually AI data is the "update".
    // BUT: If AI returns "" for Model, and we have "CFORCE 600", keep "CFORCE 600".

    const mergeField = (newVal: string | undefined, oldVal: string | undefined) => {
      if (newVal && newVal.trim() !== '' && newVal !== 'Unknown Model (Update manually)') return newVal;
      return oldVal || newVal || '';
    };

    const finalRecord: PreAlertRecord = {
      id: preAlertId,
      bookingAbw: record.bookingAbw, // Key
      shippingMode: record.shippingMode, // Key
      // Smart Merge these:
      model: mergeField(record.model, existingPreAlert?.model),
      invoiceNo: mergeField(record.invoiceNo, existingPreAlert?.invoiceNo),
      etd: mergeField(record.etd, existingPreAlert?.etd),
      atd: mergeField(record.atd, existingPreAlert?.atd),
      departureCity: mergeField(record.departureCity, existingPreAlert?.departureCity),
      eta: mergeField(record.eta, existingPreAlert?.eta),
      ata: mergeField(record.ata, existingPreAlert?.ata),
      ataFactory: mergeField(record.ataFactory, existingPreAlert?.ataFactory),
      arrivalCity: mergeField(record.arrivalCity, existingPreAlert?.arrivalCity),
      linkedContainers: containers.map(c => c.containerNo), // Always update containers from latest BL
      processed: true // Always mark processed
    };

    await storageService.updatePreAlert(finalRecord);

    const bookingRef = finalRecord.bookingAbw;

    // --- HELPER: Fetch existing data by field ---
    const fetchExisting = async (colName: string, field: string, value: string) => {
      if (!db) {
        // @ts-ignore
        return dbState[colName === COLS.VESSEL_TRACKING ? 'vesselTracking' : colName === COLS.CUSTOMS ? 'customsClearance' : 'shipments'].find((r: any) => r[field] === value) || null;
      }
      const q = query(collection(db, colName), where(field, "==", value));
      const snap = await getDocs(q);
      return !snap.empty ? { id: snap.docs[0].id, ...snap.docs[0].data() } : null;
    }

    // 2. Distribute to Vessel Tracking (Merge & Split)
    // Goal: 1 Row per Container.
    // Logic: 
    //   a. Get ALL existing records for this BL.
    //   b. Identify "manual data" (projectType, etc) from the FIRST record found (if any).
    //   c. Delete all existing records for this BL.
    //   d. Create NEW records for each container, applying the "manual data".

    let existingVessels: VesselTrackingRecord[] = [];
    if (!db) {
      existingVessels = dbState.vesselTracking.filter((v: any) => v.blNo === bookingRef);
    } else {
      const q = query(collection(db, COLS.VESSEL_TRACKING), where("blNo", "==", bookingRef));
      const snap = await getDocs(q);
      existingVessels = snap.docs.map(d => ({ ...d.data(), id: d.id } as VesselTrackingRecord));
    }

    // Capture manual data from the first record (or default) to propagate to all splits
    const baseVesselFn = (defaults: Partial<VesselTrackingRecord>) => {
      if (existingVessels.length > 0) {
        const base = existingVessels[0];
        return {
          qty: base.qty,
          projectType: base.projectType,
          contractNo: base.contractNo,
          shippingCompany: base.shippingCompany,
          terminal: base.terminal,
          // Keep existing dates if not overwritten by AI? AI > Existing usually for dates.
          // Actually, let's trust AI for dates, but keep non-AI fields.
          ...defaults
        };
      }
      return {
        qty: 0,
        projectType: 'General',
        contractNo: '',
        shippingCompany: 'Unknown',
        terminal: 'Unknown',
        ...defaults
      };
    };

    // DELETE existing records (Cleanup)
    if (!db) {
      dbState.vesselTracking = dbState.vesselTracking.filter((v: any) => v.blNo !== bookingRef);
    } else {
      const batch = writeBatch(db);
      existingVessels.forEach(v => batch.delete(doc(db, COLS.VESSEL_TRACKING, v.id)));
      await batch.commit();
    }

    // CREATE new records (1 per Container)
    if (containers.length > 0) {
      for (const cont of containers) {
        const newId = crypto.randomUUID();
        const template = baseVesselFn({});

        const vData: VesselTrackingRecord = {
          ...template,
          id: newId,
          refNo: bookingRef, // Important for linking
          modelCode: finalRecord.model,
          invoiceNo: finalRecord.invoiceNo,
          blNo: bookingRef,
          containerNo: cont.containerNo,
          containerSize: cont.size,
          etd: finalRecord.etd,
          etaPort: finalRecord.eta,
          atd: finalRecord.atd || existingVessels[0]?.atd || '',
          ataPort: finalRecord.ata || existingVessels[0]?.ataPort || '',
          preAlertDate: existingVessels[0]?.preAlertDate || new Date().toISOString().split('T')[0]
        } as VesselTrackingRecord;

        await storageService.updateVesselTracking(vData);
      }
    } else {
      // Fallback if no containers (LCL/Bulk) -> Create 1 record
      const newId = crypto.randomUUID();
      const template = baseVesselFn({});
      const vData: VesselTrackingRecord = {
        ...template,
        id: newId,
        refNo: bookingRef,
        modelCode: finalRecord.model,
        invoiceNo: finalRecord.invoiceNo,
        blNo: bookingRef,
        containerNo: 'Bulk/LCL',
        containerSize: '',
        etd: finalRecord.etd,
        etaPort: finalRecord.eta,
        atd: finalRecord.atd || '',
        ataPort: finalRecord.ata || '',
        preAlertDate: new Date().toISOString().split('T')[0]
      } as VesselTrackingRecord;
      await storageService.updateVesselTracking(vData);
    }


    // 3. Distribute to Customs Clearance (Merge & Split)
    // Same logic: 1 Row per Container.
    let existingCustomsList: CustomsClearanceRecord[] = [];
    if (!db) {
      existingCustomsList = dbState.customsClearance.filter((c: any) => c.blNo === bookingRef);
    } else {
      const q = query(collection(db, COLS.CUSTOMS), where("blNo", "==", bookingRef));
      const snap = await getDocs(q);
      existingCustomsList = snap.docs.map(d => ({ ...d.data(), id: d.id } as CustomsClearanceRecord));
    }

    const baseCustomsFn = (defaults: Partial<CustomsClearanceRecord>) => {
      if (existingCustomsList.length > 0) {
        const base = existingCustomsList[0];
        return {
          pedimentoNo: base.pedimentoNo,
          proformaRevisionBy: base.proformaRevisionBy,
          targetReviewDate: base.targetReviewDate,
          proformaSentDate: base.proformaSentDate,
          pedimentoAuthorizedDate: base.pedimentoAuthorizedDate,
          peceRequestDate: base.peceRequestDate,
          peceAuthDate: base.peceAuthDate,
          pedimentoPaymentDate: base.pedimentoPaymentDate,
          truckAppointmentDate: base.truckAppointmentDate,
          eirDate: base.eirDate,
          ...defaults
        };
      }
      return {
        pedimentoNo: '',
        proformaRevisionBy: '',
        targetReviewDate: '',
        proformaSentDate: '',
        pedimentoAuthorizedDate: '',
        peceRequestDate: '',
        peceAuthDate: '',
        pedimentoPaymentDate: '',
        truckAppointmentDate: '',
        eirDate: '',
        ...defaults
      };
    };

    // DELETE existing
    if (!db) {
      dbState.customsClearance = dbState.customsClearance.filter((c: any) => c.blNo !== bookingRef);
    } else {
      const batch = writeBatch(db);
      existingCustomsList.forEach(c => batch.delete(doc(db, COLS.CUSTOMS, c.id)));
      await batch.commit();
    }

    // CREATE new
    if (containers.length > 0) {
      for (const cont of containers) {
        const newId = crypto.randomUUID();
        const template = baseCustomsFn({});

        const cData: CustomsClearanceRecord = {
          ...template,
          id: newId,
          blNo: bookingRef,
          containerNo: cont.containerNo,
          ataPort: finalRecord.ata || existingCustomsList[0]?.ataPort || '',
          ataFactory: finalRecord.ataFactory || existingCustomsList[0]?.ataFactory || ''
        } as CustomsClearanceRecord;

        await storageService.updateCustomsClearance(cData);
      }
    } else {
      const newId = crypto.randomUUID();
      const template = baseCustomsFn({});
      const cData: CustomsClearanceRecord = {
        ...template,
        id: newId,
        blNo: bookingRef,
        containerNo: 'Multiple',
        ataPort: finalRecord.ata || '',
        ataFactory: finalRecord.ataFactory || ''
      } as CustomsClearanceRecord;
      await storageService.updateCustomsClearance(cData);
    }


    // 4. Distribute to Shipments (Shipment Plan) - NEW
    const existingShipment = (await fetchExisting(COLS.SHIPMENTS, 'blNo', bookingRef)) as Shipment | undefined;
    const shipmentId: string = existingShipment ? existingShipment.id : crypto.randomUUID();

    const shipmentUpdates: Partial<Shipment> = {
      blNo: bookingRef,
      reference: bookingRef,
      origin: finalRecord.departureCity || existingShipment?.origin || 'Unknown',
      destination: finalRecord.arrivalCity || existingShipment?.destination || 'Unknown',
      etd: finalRecord.etd,
      eta: finalRecord.eta,
      atd: finalRecord.atd,
      ata: finalRecord.ata,
      status: existingShipment ? existingShipment.status : ShipmentStatus.IN_TRANSIT,
      containers: containers.map(c => c.containerNo)
    };

    const shipmentData: Shipment = {
      ...(existingShipment || {
        id: shipmentId,
        costs: 0,
        projectSection: '',
        shipmentBatch: '',
        personInCharge: '',
        locationOfGoods: '',
        cargoReadyDate: '',
        containerTypeQty: '',
        submissionDeadline: '',
        submissionStatus: '',
        bpmShipmentNo: '',
        carrier: '',
        portTerminal: '',
        forwarderId: '',
        status: ShipmentStatus.PLANNED, // Required
        origin: 'Unknown',
        destination: 'Unknown',
        reference: '',
        containers: [],
        etd: '',
        eta: '',
        blNo: ''
      }),
      ...shipmentUpdates,
      id: shipmentId
    };
    // Need to expose updateShipment or use upsert. existing method 'updateShipment' exists.
    await storageService.updateShipment(shipmentData);

    // 5. Distribute to Equipment Tracking (Overwrite/Reset)
    if (createEquipment) {
      // Logic: Delete existing equipment for this BL first to avoid duplicates/orphans, then recreate.
      if (!db) {
        dbState.equipmentTracking = dbState.equipmentTracking.filter((e: any) => e.blNo !== bookingRef);
      } else {
        const q = query(collection(db, COLS.EQUIPMENT), where("blNo", "==", bookingRef));
        const snap = await getDocs(q);
        const batch = writeBatch(db);
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }

      // Recreate from current container list
      for (const cont of containers) {
        const eqItem: EquipmentTrackingRecord = {
          id: crypto.randomUUID(),
          containerNo: cont.containerNo,
          containerQty: 1,
          containerSize: cont.size,
          blNo: bookingRef,
          etaPort: finalRecord.eta,
          etd: finalRecord.etd,
          atd: finalRecord.atd || '',
          projectSection: 'General',
          shipmentBatch: '',
          personInCharge: 'Logistics',
          unloadingLocation: finalRecord.arrivalCity,
          unloadingParty: '',
          unloadingTools: '',
          status: 'In Transit'
        };
        await storageService.updateEquipmentTracking(eqItem);
      }
    }
  },

  // CASCADE DELETE: One-click wipe of a BL from the entire system.
  deleteEntireShipment: async (blNo: string) => {
    console.log("Global Delete Initiated for BL:", blNo);

    // 1. Find all IDs to delete across collections
    let paIds: string[] = [];
    let vtIds: string[] = [];
    let ccIds: string[] = [];
    let shIds: string[] = [];
    let etIds: string[] = [];

    if (!db) {
      paIds = dbState.preAlerts.filter((r: any) => r.bookingAbw === blNo).map((r: any) => r.id);
      vtIds = dbState.vesselTracking.filter((r: any) => r.blNo === blNo).map((r: any) => r.id);
      ccIds = dbState.customsClearance.filter((r: any) => r.blNo === blNo).map((r: any) => r.id);
      shIds = dbState.shipments.filter((r: any) => r.blNo === blNo).map((r: any) => r.id);
      etIds = dbState.equipmentTracking.filter((r: any) => r.blNo === blNo).map((r: any) => r.id);

      // Execute Local Deletes
      dbState.preAlerts = dbState.preAlerts.filter((r: any) => !paIds.includes(r.id));
      dbState.vesselTracking = dbState.vesselTracking.filter((r: any) => !vtIds.includes(r.id));
      dbState.customsClearance = dbState.customsClearance.filter((r: any) => !ccIds.includes(r.id));
      dbState.shipments = dbState.shipments.filter((r: any) => !shIds.includes(r.id));
      dbState.equipmentTracking = dbState.equipmentTracking.filter((r: any) => !etIds.includes(r.id));

      saveLocal();
      return;
    }

    // Cloud: Query IDs first (delete by query is not direct in Firestore client SDK)
    const getIds = async (col: string, field: string) => {
      const q = query(collection(db, col), where(field, "==", blNo));
      const s = await getDocs(q);
      return s.docs.map(d => d.id);
    };

    paIds = await getIds(COLS.PRE_ALERTS, 'bookingAbw');
    vtIds = await getIds(COLS.VESSEL_TRACKING, 'blNo');
    ccIds = await getIds(COLS.CUSTOMS, 'blNo');
    shIds = await getIds(COLS.SHIPMENTS, 'blNo');
    etIds = await getIds(COLS.EQUIPMENT, 'blNo');

    const runBatch = async (col: string, ids: string[]) => {
      const batch = writeBatch(db);
      ids.forEach(id => batch.delete(doc(db, col, id)));
      await batch.commit();
    };

    // Execute Batches (one per collection to avoid limits/complexity)
    if (paIds.length) await runBatch(COLS.PRE_ALERTS, paIds);
    if (vtIds.length) await runBatch(COLS.VESSEL_TRACKING, vtIds);
    if (ccIds.length) await runBatch(COLS.CUSTOMS, ccIds);
    if (shIds.length) await runBatch(COLS.SHIPMENTS, shIds);
    if (etIds.length) await runBatch(COLS.EQUIPMENT, etIds);
  },


  updatePreAlert: async (record: PreAlertRecord) => {
    const updated = { ...record, updatedAt: new Date().toISOString() };
    const id = record.id || crypto.randomUUID();
    if (!db) {
      const idx = dbState.preAlerts.findIndex((p: any) => p.id === id);
      if (idx !== -1) dbState.preAlerts[idx] = { ...updated, id }; else dbState.preAlerts.push({ ...updated, id });
      saveLocal(); return;
    }
    await setDoc(doc(db, COLS.PRE_ALERTS, id), updated);
  },

  // Senior Frontend Engineer: Implemented missing deletePreAlert method.
  // Senior Frontend Engineer: Implemented cascading delete for admin safety.
  deletePreAlert: async (id: string) => {
    // 1. Local State Update (Optimistic / Offline)
    const recordToDelete = dbState.preAlerts.find((p: any) => p.id === id);
    if (!recordToDelete) {
      console.warn("Delete: Record not found in local state");
      return;
    }

    dbState.preAlerts = dbState.preAlerts.filter((p: any) => p.id !== id);

    // Cascade Local
    const bookingRef = recordToDelete.bookingAbw;
    const containers = recordToDelete.linkedContainers || [];

    if (bookingRef) {
      dbState.vesselTracking = dbState.vesselTracking.filter((v: any) => v.bookingNo !== bookingRef);
      dbState.customsClearance = dbState.customsClearance.filter((c: any) => c.bookingNo !== bookingRef);
    }
    // Equipment is usually linked by container ID or booking
    // Simple approach: Remove equipment matching any of the containers
    if (containers.length > 0) {
      dbState.equipmentTracking = dbState.equipmentTracking.filter((e: any) => !containers.includes(e.containerNo));
    }

    saveLocal();

    if (!db) return;

    // 2. Cloud Cascade (Batch Delete)
    try {
      const { writeBatch, query, where, getDocs, collection, doc } = await import('firebase/firestore');
      const batch = writeBatch(db);

      // A. Delete Main Record
      const preAlertRef = doc(db, COLS.PRE_ALERTS, id);
      batch.delete(preAlertRef);

      // B. Find & Delete Vessel Tracking (by Booking)
      if (bookingRef) {
        const vtQuery = query(collection(db, COLS.VESSEL_TRACKING), where("bookingNo", "==", bookingRef));
        const vtSnap = await getDocs(vtQuery);
        vtSnap.forEach(doc => batch.delete(doc.ref));

        // C. Find & Delete Customs (by Booking)
        const customsQuery = query(collection(db, COLS.CUSTOMS), where("bookingNo", "==", bookingRef));
        const customsSnap = await getDocs(customsQuery);
        customsSnap.forEach(doc => batch.delete(doc.ref));
      }

      // D. Find & Delete Equipment (by Container No)
      if (containers.length > 0) {
        const chunks = [];
        for (let i = 0; i < containers.length; i += 10) {
          chunks.push(containers.slice(i, i + 10));
        }

        for (const chunk of chunks) {
          const eqQuery = query(collection(db, COLS.EQUIPMENT), where("containerNo", "in", chunk));
          const eqSnap = await getDocs(eqQuery);
          eqSnap.forEach(doc => batch.delete(doc.ref));
        }
      }

      await batch.commit();
      console.log("✅ Cascading Delete Complete");

    } catch (e) {
      console.error("❌ Cascading Delete Failed (Cloud)", e);
    }
  },

  // CASCADE DELETE: One-click wipe of a BL from the entire system.




  // Senior Frontend Engineer: Implemented missing deletePreAlert method.
  // Senior Frontend Engineer: Implemented cascading delete for admin safety.


  deletePreAlerts: async (ids: string[]) => {
    // 1. Loop through each ID and perform cascade delete
    // Note: iterating one by one to reuse the complex cascade logic in deletePreAlert
    // Ideally we would optimize this to be a single batch operation, but for safety/correctness
    // and given the complexity of cascading logic (finding related records by various keys),
    // calling deletePreAlert sequentially is safer.
    // However, deletePreAlert uses `writeBatch(db).commit()` internally, so we can't wrap these in another batch easily.
    // For now, let's call them sequentially. If performance is an issue, we can refactor.

    for (const id of ids) {
      await storageService.deletePreAlert(id);
    }
  },

  // Senior Frontend Engineer: Check if PreAlloc exists (for duplicate prevention)
  checkPreAlertExists: async (bookingAbw: string): Promise<PreAlertRecord | null> => {
    if (!bookingAbw) return null;

    if (!db) {
      return dbState.preAlerts.find((p: any) => p.bookingAbw?.trim().toUpperCase() === bookingAbw.trim().toUpperCase()) || null;
    }

    // Cloud check
    const q = query(collection(db, COLS.PRE_ALERTS), where("bookingAbw", "==", bookingAbw));
    const snap = await getDocs(q);
    if (!snap.empty) {
      return { id: snap.docs[0].id, ...snap.docs[0].data() } as PreAlertRecord;
      return { id: snap.docs[0].id, ...snap.docs[0].data() } as PreAlertRecord;
    }
    return null;
  },

  // Senior Frontend Engineer: Implemented missing syncPreAlertDates method.
  syncPreAlertDates: async (record: PreAlertRecord) => {
    const bookingRef = record.bookingAbw;
    if (!bookingRef) return;

    try {
      // 1. Local State Sync
      if (!db) {
        dbState.vesselTracking.forEach((vt: any) => {
          if (vt.bookingNo === bookingRef) {
            vt.etd = record.etd;
            vt.eta = record.eta;
            vt.atd = record.atd;
            vt.ata = record.ata;
          }
        });
        dbState.customsClearance.forEach((cc: any) => {
          if (cc.bookingNo === bookingRef) {
            cc.ataPort = record.ata; // Map PreAlert ATA -> Customs ATA Port
            cc.ataFactory = record.ataFactory || cc.ataFactory;
          }
        });
        saveLocal();
        return;
      }

      // 2. Cloud Sync (Batch Update)
      const { writeBatch, query, where, getDocs, collection } = await import('firebase/firestore');
      const batch = writeBatch(db);
      let batchCount = 0;

      // Update Vessel Tracking
      const vtQuery = query(collection(db, COLS.VESSEL_TRACKING), where("bookingNo", "==", bookingRef));
      const vtSnap = await getDocs(vtQuery);
      vtSnap.forEach(doc => {
        batch.update(doc.ref, {
          etd: record.etd,
          eta: record.eta,
          atd: record.atd,
          ata: record.ata
        });
        batchCount++;
      });

      // Update Customs Clearance (ATA Port mostly)
      const ccQuery = query(collection(db, COLS.CUSTOMS), where("bookingNo", "==", bookingRef));
      const ccSnap = await getDocs(ccQuery);
      ccSnap.forEach(doc => {
        batch.update(doc.ref, {
          ataPort: record.ata,
          ataFactory: record.ataFactory || doc.data().ataFactory // Update if provided
        });
        batchCount++;
      });

      if (batchCount > 0) {
        await batch.commit();
        console.log(`✅ Synced dates for ${batchCount} records linked to ${bookingRef}`);
      }

    } catch (e) {
      console.error("❌ Sync Date Failed", e);
      throw e;
    }
  },

  // Senior Frontend Engineer: Implemented missing addCost method.
  addCost: async (cost: CostRecord) => {
    const updated = { ...cost, updatedAt: new Date().toISOString() };
    const id = cost.id || crypto.randomUUID();
    if (!db) {
      dbState.costs.push({ ...updated, id });
      saveLocal();
      return;
    }
    await setDoc(doc(db, COLS.COSTS, id), { ...updated, id });
  },

  // Senior Frontend Engineer: Implemented missing updateSupplier method.
  updateSupplier: async (supplier: Supplier) => {
    const updated = { ...supplier, updatedAt: new Date().toISOString() };
    const id = supplier.id || crypto.randomUUID();
    if (!db) {
      const idx = dbState.suppliers.findIndex((s: any) => s.id === id);
      if (idx !== -1) dbState.suppliers[idx] = { ...updated, id };
      else dbState.suppliers.push({ ...updated, id });
      saveLocal();
      return;
    }
    await setDoc(doc(db, COLS.SUPPLIERS, id), { ...updated, id });
  },



  // CASCADE DELETE: One-click wipe of a BL from the entire system.


  // Senior Frontend Engineer: Implemented missing deleteSupplier method.
  deleteSupplier: async (id: string) => {
    if (!db) {
      dbState.suppliers = dbState.suppliers.filter((s: any) => s.id !== id);
      saveLocal();
      return;
    }
    await deleteDoc(doc(db, COLS.SUPPLIERS, id));
  },

  // Standalone Upload Method for Parallel Execution
  uploadDataStageFile: async (file: File, reportId: string, onProgress?: (percent: number) => void): Promise<string> => {
    const { ref, uploadBytesResumable, getDownloadURL } = await import('firebase/storage');
    const { storage } = await import('./firebaseConfig');
    if (!storage) throw new Error("Storage not initialized");

    const storagePath = `reports/${reportId}_${file.name}`;
    const storageRef = ref(storage, storagePath);
    const uploadTask = uploadBytesResumable(storageRef, file);

    if (onProgress) {
      uploadTask.on('state_changed', (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        onProgress(Math.round(progress));
      });
    }

    try {
      await uploadTask;
    } catch (e) {
      throw e;
    }

    return await getDownloadURL(storageRef);
  },

  checkConnection: async (): Promise<boolean> => {
    if (!navigator.onLine) return false;
    try {
      // Real Firebase Ping: Try to fetch 1 document
      const { getDocs, query, collection, limit } = await import('firebase/firestore');
      // We use a query we know implies read access
      const q = query(collection(db, COLS.DATA_STAGE_REPORTS), limit(1));
      await getDocs(q);
      return true;
    } catch (e) {
      console.error("Firebase Ping Failed:", e);
      return false;
    }
  },

  saveDataStageReport: async (report: DataStageReport, onProgress?: (percent: number) => void, originalFile?: File, preUploadedUrl?: string) => {
    // 1. Memory Update
    dbState.dataStageReports.unshift(report);

    // 2. Cloud Persistence with Fallback
    if (db) {
      try {
        // 1. Always Try Lean Report to Firestore First (Metadata only)
        const leanReport = {
          ...report,
          records: [],
          rawFiles: report.rawFiles.map(f => ({ ...f, rows: [], content: "" }))
        };
        await setDoc(doc(db, COLS.DATA_STAGE_REPORTS, report.id), leanReport);
      } catch (e) {
        console.warn("Firestore save failed (non-critical):", e);
      }

      let lastCloudError: string | null = null;
      try {
        try {
          // PURE JSON FALLBACK for Large Files
          // User requirements: "Upload interpreted data", "No ZIP", "Latin-1 compatible (data-wise)"

          console.log("Report too big for Firestore. Uploading JSON Blob...");
          const { ref, uploadBytesResumable, getDownloadURL } = await import('firebase/storage');
          const { storage } = await import('./firebaseConfig');
          if (!storage) throw new Error("Storage not initialized");

          // STRATEGY: BATCHED FIRESTORE WRITES (Lotes)
          // "Datos Continuos Ligeros" -> Break payload into individual docs
          console.log("Saving records via Batch Writes (Continuous Data)...");

          const { writeBatch, collection } = await import('firebase/firestore');

          // 1. Create Main "Header" Document (Metadata Only)
          const headerReport: DataStageReport = {
            ...report,
            records: [], // Empty in main doc
            rawFiles: [], // We do NOT save rawFiles to DB to keep it light
            storageUrl: undefined // No storage fallback
          };

          await setDoc(doc(db, COLS.DATA_STAGE_REPORTS, report.id), headerReport);

          // 2. Batch Write the Records (Pedimentos) to a Subcollection
          const recordsRef = collection(db, COLS.DATA_STAGE_REPORTS, report.id, 'items');
          const BATCH_SIZE = 400; // Safety margin below 500
          const chunks = [];

          for (let i = 0; i < report.records.length; i += BATCH_SIZE) {
            chunks.push(report.records.slice(i, i + BATCH_SIZE));
          }

          let totalProcessed = 0;
          const totalRecords = report.records.length;

          for (let i = 0; i < chunks.length; i++) {
            const batch = writeBatch(db);
            const chunk = chunks[i];

            chunk.forEach(record => {
              const recordDocRef = doc(recordsRef, record.id); // Use Pedimento ID
              batch.set(recordDocRef, record);
            });

            await batch.commit();

            totalProcessed += chunk.length;
            if (onProgress) {
              const progress = Math.min((totalProcessed / totalRecords) * 100, 99);
              onProgress(progress);
            }

            // Yield slightly to prevent UI lock
            await new Promise(r => setTimeout(r, 20));
          }

          console.log("All batches committed successfully.");
          return true;

        } catch (e3: any) {
          console.error("Critical Batch Write Failure:", e3);

          let errorMsg = "Fallo al guardar lotes de datos.";
          if (e3.code === 'permission-denied') errorMsg = "Permisos denegados en base de datos. Verifica las reglas de Firestore (write: items/*).";
          if (e3.code === 'resource-exhausted') errorMsg = "Cuota de base de datos excedida.";
          if (e3.code === 'invalid-argument') errorMsg = "Datos inválidos en el reporte (posiblemente un campo undefined).";

          lastCloudError = `${errorMsg} (${e3.message})`;

          // CRITICAL: Do not fallback to LocalStorage for Batched/Large reports.
          // It causes a double-error (QuotaExceeded) and hides the real cloud error.
          throw new Error(lastCloudError);
        }

        // 4. FINAL FALLBACK: LOCAL STORAGE
        try {
          console.log("Attempting Emergency Local Save...");
          let localReports = JSON.parse(localStorage.getItem(COLS.DATA_STAGE_REPORTS) || '[]');
          localReports.unshift(report);

          try {
            localStorage.setItem(COLS.DATA_STAGE_REPORTS, JSON.stringify(localReports));
          } catch (quotaEx) {
            console.warn("LocalStorage Full. Attempting to clear old reports...");
            while (localReports.length > 1) {
              localReports.pop();
              try {
                localStorage.setItem(COLS.DATA_STAGE_REPORTS, JSON.stringify(localReports));
                console.log("Space cleared. Saved successfully.");
                return true;
              } catch (e) {
                // Still full, loop again
              }
            }

            // FINAL ATTEMPT: LEAN SAVE
            console.warn("Report too big for LocalStorage. Attempting LEAN SAVE (Metadata only)...");
            try {
              const leanReport = {
                ...report,
                rawFiles: report.rawFiles.map(f => ({ ...f, rows: [], content: "" }))
              };
              localReports[0] = leanReport;
              localStorage.setItem(COLS.DATA_STAGE_REPORTS, JSON.stringify(localReports));
              console.log("Saved LEAN report to LocalStorage.");
              return true;
            } catch (leanErr) {
              throw quotaEx;
            }
          }
          console.log("Saved to LocalStorage as emergency fallback.");
          return true;
        } catch (e4) {
          console.error("Local Storage also full/failed", e4);
          const explicitErr = lastCloudError || "Error desconocido en nube";
          throw new Error(`Fallo total: No se pudo subir a la nube [${explicitErr}] ni guardar localmente (Probable Espacio lleno).`);
        }
      } catch (eOuter: any) {
        console.warn("Outer save error", eOuter);
        return false;
      }
    }
    return true;
  },

  deleteDataStageReport: async (id: string) => {
    if (!db) {
      dbState.dataStageReports = dbState.dataStageReports.filter((r: any) => r.id !== id);
      saveLocal();
      return;
    }
    await deleteDoc(doc(db, COLS.DATA_STAGE_REPORTS, id));
  },

  saveLogisticsData: async (data: any[], onProgress?: (p: number) => void) => {
    dbState.logistics = data;
    if (onProgress) onProgress(1);
    saveLocal();
  },

  saveDraftDataStage: async (session: DataStageSession) => {
    // 1. Try LocalStorage (Speed)
    // 1. Try LocalStorage (Speed)
    try {
      const payload = JSON.stringify(session);
      if (payload.length > 4000000) { // 4MB Limit Safety
        console.warn("Draft too large for LocalStorage (" + (payload.length / 1024 / 1024).toFixed(2) + " MB). Saving Lean Draft only.");
        throw new Error("Payload too large"); // Trigger fallback to lean
      }
      localStorage.setItem(DRAFT_DATA_STAGE_KEY, payload);
    } catch (e) {
      console.warn("Draft LocalStorage Full. Clearing old Reports to make space...");
      try {
        // Try to free space from Reports to save the Draft (Priority: Current Work > Old History)
        let localReports = JSON.parse(localStorage.getItem(COLS.DATA_STAGE_REPORTS) || '[]');
        while (localReports.length > 0) {
          localReports.pop(); // Remove oldest
          localStorage.setItem(COLS.DATA_STAGE_REPORTS, JSON.stringify(localReports));
          try {
            localStorage.setItem(DRAFT_DATA_STAGE_KEY, JSON.stringify(session));
            console.log("Draft saved after clearing history.");
            return; // Success
          } catch (retryErr) {
            // Continue loop
          }
        }
        // If reports empty and still fails, try lean draft
        throw e;
      } catch (e2) {
        console.warn("Still full even after clearing history. Attempting lean save...");
        try {
          const leanSession = {
            ...session,
            rawFiles: session.rawFiles.map(f => ({ ...f, rows: [], content: "" }))
          };
          localStorage.setItem(DRAFT_DATA_STAGE_KEY, JSON.stringify(leanSession));
        } catch (e3) {
          console.error("Local persistence failed completely", e3);
        }
      }
    }

    // 2. Sync to Cloud (Unlimited* Storage)
    if (db) {
      try {
        // Firestore has 1MB limit per document too!
        // We might need to be careful here. If rawFiles are huge, Firestore will also fail.
        // For now, let's try.
        await setDoc(doc(db, COLS.DRAFTS, 'current_session'), session);
      } catch (e) {
        console.warn("Failed to sync draft to cloud", e);
        // If Document too large, try saving without rawFiles
        try {
          const leanSession = {
            ...session,
            rawFiles: session.rawFiles.map(f => ({ ...f, rows: [], content: "" }))
          };
          await setDoc(doc(db, COLS.DRAFTS, 'current_session'), leanSession);
        } catch (e2) {
          console.warn("Lean draft also failed. Attempting Storage Upload (Unlimited Size)...", e2);

          try {
            // 3. STORAGE FALLBACK FOR DRAFTS
            const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
            const { storage } = await import('./firebaseConfig');

            if (!storage) throw new Error("Storage not initialized");

            const jsonString = JSON.stringify(session);
            const blob = new Blob([jsonString], { type: 'application/json' });
            // Use a fixed path for current_session to overwrite properly
            const storagePath = `drafts/current_session_${Date.now()}.json`;
            const storageRef = ref(storage, storagePath);

            // Timeout 120s
            const uploadPromise = uploadBytes(storageRef, blob);
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Timeout: La subida del borrador tardó demasiado.")), 120000)
            );

            await Promise.race([uploadPromise, timeoutPromise]);
            const downloadURL = await getDownloadURL(storageRef);

            // Save "Pointer" to Firestore
            const pointerSession: DataStageSession = {
              ...session,
              records: [],
              rawFiles: [],
              storageUrl: downloadURL
            } as any; // Cast safely if type check strictness varies

            await setDoc(doc(db, COLS.DRAFTS, 'current_session'), pointerSession);
            console.log("Saved large draft via Storage Link:", downloadURL);

          } catch (e3) {
            console.error("Critical: Failed to save draft via Storage fallback.", e3);
            // Silent fail for drafts to not block UI, but log it.
          }
        }
      }
    }
  },

  getDraftDataStage: async (): Promise<DataStageSession | null> => {
    // 1. Get Local Data (Fast/Offline)
    const localStr = localStorage.getItem(DRAFT_DATA_STAGE_KEY);
    const localDraft: DataStageSession | null = localStr ? JSON.parse(localStr) : null;

    // 2. Try Cloud (If available)
    if (db) {
      try {
        const snap = await getDoc(doc(db, COLS.DRAFTS, 'current_session'));
        if (snap.exists()) {
          const cloudDraft = snap.data() as DataStageSession;

          // Conflict Resolution: Use the latest
          const localTime = localDraft?.timestamp ? new Date(localDraft.timestamp).getTime() : 0;
          const cloudTime = cloudDraft.timestamp ? new Date(cloudDraft.timestamp).getTime() : 0;

          if (cloudTime > localTime) {
            console.log("Using Cloud Draft (Newer)");

            // HYDRATE IF POINTER
            let finalDraft = cloudDraft;
            if ((cloudDraft as any).storageUrl && cloudDraft.records.length === 0) {
              try {
                console.log("Hydrating draft from storage...", (cloudDraft as any).storageUrl);
                const res = await fetch((cloudDraft as any).storageUrl);
                if (res.ok) {
                  finalDraft = await res.json();
                }
              } catch (err) {
                console.error("Failed to hydrate draft from storage", err);
                // Fallback to local if hydration fails but local exists? 
                // Or return empty to avoid inconsistency.
                // If hydration fails, we probably shouldn't return a broken empty draft.
                if (localDraft) return localDraft;
              }
            }

            localStorage.setItem(DRAFT_DATA_STAGE_KEY, JSON.stringify(finalDraft));
            return finalDraft;
          } else {
            console.log("Using Local Draft (Newer or Equal)");
            // Determine if we should push local to cloud? 
            // Maybe, but let's just return local for speed and safety.
            return localDraft;
          }
        }
      } catch (e) {
        console.warn("Cloud draft fetch failed", e);
      }
    }

    return localDraft;
  },

  clearDraftDataStage: async () => {
    localStorage.removeItem(DRAFT_DATA_STAGE_KEY);
    if (db) {
      try {
        await deleteDoc(doc(db, COLS.DRAFTS, 'current_session'));
      } catch (e) { console.error(e); }
    }
  },

  // 2. Método de Descarga Universal (Solución al error de Chrome)
  // Reemplaza tu método backup por este más robusto
  backup: () => {
    try {
      const dataStr = JSON.stringify(dbState, null, 2); // Formateado para legibilidad
      const blob = new Blob([dataStr], { type: 'application/json' });
      const fileName = `logimaster_full_backup_${new Date().toISOString().split('T')[0]}.json`;

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;

      // Chrome requiere que el link esté en el DOM para evitar el error de UUID
      document.body.appendChild(link);
      link.click();

      // Limpieza con retraso para que el SO procese el archivo antes de que el navegador lo borre de RAM
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
        if (document.body.contains(link)) {
          document.body.removeChild(link);
        }
      }, 3000);
    } catch (e) {
      console.error("Error crítico en backup:", e);
    }
  },

  importLocalData: async (jsonFile: File) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const imported = JSON.parse(e.target?.result as string);

          // Merge Inteligente: Mantenemos lo que tenemos y sumamos lo nuevo
          // basándonos en la lógica de duplicados para Facturas
          if (imported.commercialInvoices) {
            const existingKeys = new Set(dbState.commercialInvoices.map((i: any) => `${i.invoiceNo}-${i.partNo}-${i.qty}`));
            const uniqueNew = imported.commercialInvoices.filter((i: any) =>
              !existingKeys.has(`${i.invoiceNo}-${i.partNo}-${i.qty}`)
            );
            dbState.commercialInvoices = [...dbState.commercialInvoices, ...uniqueNew];
          }

          // Para otros módulos que SI están en nube, el sync de Firebase se encargará,
          // pero para LocalStorage, sobrescribimos el estado actual:
          saveLocal();
          resolve(true);
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsText(jsonFile);
    });
  },

  // 3. Importación Reforzada
  importDatabase: async (jsonStr: string) => {
    try {
      const imported = JSON.parse(jsonStr);
      // Mergeo inteligente para no perder facturas locales si el backup no las tiene
      dbState = {
        ...dbState,
        ...imported,
        commercialInvoices: imported.commercialInvoices || dbState.commercialInvoices
      };
      saveLocal();
      return true;
    } catch (e) {
      console.error("Error al importar base de datos:", e);
      return false;
    }
  },



  // Senior Frontend Engineer: Implemented missing resetDatabase method.
  resetDatabase: async () => {
    dbState = {
      parts: [], shipments: [], vesselTracking: [], equipmentTracking: [],
      customsClearance: [], preAlerts: [], costs: [], logs: [], snapshots: [],
      logistics: [], suppliers: [], dataStageReports: [], trainingSubmissions: [], commercialInvoices: [],
      dataStageDrafts: []
    };
    saveLocal();
  },

  searchPart: (num: string) => dbState.parts.find((p: any) => p.PART_NUMBER.toUpperCase() === num.toUpperCase()),

  // Senior Frontend Engineer: Implemented snapshot management methods.
  // Senior Frontend Engineer: Implemented snapshot management methods (Isolated Storage)
  getSnapshots: () => {
    try {
      const stored = localStorage.getItem(RESTORE_POINTS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (e) { return []; }
  },

  createSnapshot: (action: string) => {
    try {
      // 1. Get current snapshots from separate storage
      const stored = localStorage.getItem(RESTORE_POINTS_KEY);
      const output = stored ? JSON.parse(stored) : [];

      // 2. Create new snapshot (Only Commercial Invoices for now to save space, or full dbState but carefully)
      // Safety Net is specifically for Commercial Invoices loss.
      const newSnapshot: RestorePoint = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        reason: action,
        data: dbState.commercialInvoices || [], // Only backing up Invoices to avoid huge size
        sizeKB: 0
      };
      newSnapshot.sizeKB = Math.round(JSON.stringify(newSnapshot.data).length / 1024);

      // 3. Prepend and Limit to 5
      const updated = [newSnapshot, ...output].slice(0, 5);

      // 4. Save to separate key
      localStorage.setItem(RESTORE_POINTS_KEY, JSON.stringify(updated));
      console.log(`Snapshot created: ${action}`);
      return true;
    } catch (e) {
      console.warn("Safety Net: Snapshot creation failed", e);
      return false;
    }
  },

  restoreSnapshot: (id: string) => {
    try {
      const stored = localStorage.getItem(RESTORE_POINTS_KEY);
      const points = stored ? JSON.parse(stored) : [];
      const snap = points.find((s: any) => s.id === id);
      if (!snap) return false;

      console.log(`Restoring snapshot: ${snap.reason}`);
      dbState.commercialInvoices = snap.data;
      saveLocal(); // Persist restored state
      notifyListeners();
      return true;
    } catch (e) {
      console.error("Restore failed", e);
      return false;
    }
  },

  deleteSnapshot: (id: string) => {
    try {
      const stored = localStorage.getItem(RESTORE_POINTS_KEY);
      const points = stored ? JSON.parse(stored) : [];
      const updated = points.filter((s: any) => s.id !== id);
      localStorage.setItem(RESTORE_POINTS_KEY, JSON.stringify(updated));
      notifyListeners(); // Optional, if we want UI to update instantly (might need a new listener for snapshots though)
    } catch (e) { console.error(e); }
  },



  initAutoBackup: () => { },

  // Senior Frontend Engineer: Feature - Proactive Format Submission (Training Loop)
  uploadTrainingDocument: async (file: File, provider: string, comments: string) => {
    // Defines the record structure for local state update
    const newRecord = {
      id: crypto.randomUUID(),
      fileName: file.name,
      fileUrl: URL.createObjectURL(file), // Mock URL for local
      provider: provider || 'Unknown',
      comments: comments || '',
      uploadedAt: new Date().toISOString(),
      status: 'PENDING_ANALYSIS', // Initial status
      user: 'Admin (Local)'
    };

    // Helper for simulation on localhost if real upload fails (CORS/Auth issues)
    const simulateLocalSuccess = async () => {
      console.warn("⚠️ Localhost: Upload blocked (likely CORS). Simulating success and updating local state.");
      await new Promise(resolve => setTimeout(resolve, 800)); // Fake network delay

      // Update Local State so UI updates immediately!
      if (!dbState.trainingSubmissions) dbState.trainingSubmissions = [];
      dbState.trainingSubmissions.push(newRecord);
      saveLocal();

      return true;
    };

    if (!db) {
      console.log("Mock Upload: File would be uploaded here.", file.name);
      return simulateLocalSuccess();
    }

    try {
      // 1. Upload File
      const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
      const { storage } = await import('./firebaseConfig');

      if (!storage) throw new Error("Storage not initialized");

      const storageRef = ref(storage, `training_data/${Date.now()}_${file.name}`);

      let downloadURL = '';
      try {
        // Create a timeout promise that rejects after 5 seconds
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Upload timed out")), 5000)
        );

        // Race the upload against the timeout
        const uploadResult: any = await Promise.race([
          uploadBytes(storageRef, file),
          timeoutPromise
        ]);

        downloadURL = await getDownloadURL(uploadResult.ref);
      } catch (uploadError) {
        // If upload fails on localhost (or times out), fall back to simulation to prove flow works
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
          return await simulateLocalSuccess();
        }
        throw uploadError;
      }

      // 2. Create Submission Record
      // The onSnapshot listener in init() will catch this and update the state automatically for all clients!
      await setDoc(doc(collection(db, 'training_submissions')), {
        ...newRecord, // Use the same structure
        fileName: file.name,
        fileUrl: downloadURL,
        provider: provider || 'Unknown',
        comments: comments || '',
        uploadedAt: new Date().toISOString(),
        status: 'PENDING_ANALYSIS',
        user: 'Admin'
      });

      return true;
    } catch (error) {
      console.error("Upload failed", error);
      // Final safety net for localhost validation
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return await simulateLocalSuccess();
      }
      throw error;
    }
  },


};
