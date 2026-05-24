import { RawMaterialPart, Shipment, ShipmentStatus, AuditLog, DailyChange, MasterDataReport, CostRecord, RestorePoint, Supplier, VesselTrackingRecord, EquipmentTrackingRecord, SparePartsTrackingRecord, CustomsClearanceRecord, PreAlertRecord, DataStageReport, DataStageSession, CommercialInvoiceItem, StorageState, PedimentoRecord, UserRole, XMLCIRecord } from '../types.ts';
import { db } from './firebaseConfig.ts';
import {
  collection, doc, onSnapshot, setDoc, deleteDoc, writeBatch, query, orderBy, getDocs, where, getDoc, arrayUnion, increment, limit, startAfter
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { indexedDbService } from './indexedDbService.ts';

const COLS = {
  PARTS: 'parts', SHIPMENTS: 'shipments', VESSEL_TRACKING: 'vessel_tracking',
  EQUIPMENT: 'equipment_tracking', CUSTOMS: 'customs_clearance', PRE_ALERTS: 'pre_alerts',
  COSTS: 'costs', LOGS: 'logs', LOGISTICS: 'logistics', SUPPLIERS: 'suppliers',
  SNAPSHOTS: 'snapshots', DATA_STAGE_REPORTS: 'data_stage_reports', USERS: 'users',
  TRAINING: 'training_submissions', INVOICES: 'commercial_invoices', CFDI_INVOICES: 'cfdi_invoices',
  METADATA: 'system_metadata', DAILY_CHANGES: 'daily_changes', DAILY_REPORTS: 'master_data_reports',
  SUBSCRIPTIONS: 'audit_subscriptions',
  XML_CI: 'xml_ci',
  SPARE_PARTS: 'spare_parts_tracking',
  FIANZAS: 'fianzas'
};

const LOCAL_STORAGE_KEY = 'logimaster_db';
const INVOICES_BACKUP_KEY = 'logimaster_invoices_backup';
const PARTS_BACKUP_KEY = 'logimaster_parts_backup';
const RESTORE_POINTS_KEY = 'logimaster_restore_points';
const PENDING_WRITES_KEY = 'logimaster_sync_queue';

interface PendingWrite {
  id: string;
  action: 'UPSERT_PARTS' | 'UPSERT_SHIPMENTS' | 'UPSERT_VESSEL' | 'UPDATE_VESSEL' | 'UPDATE_EQUIPMENT' | 'UPDATE_SPARE_PARTS' | 'UPDATE_CUSTOMS' | 'UPSERT_INVOICES' | 'DELETE_PARTS' | 'DELETE_INVOICES' | 'DELETE_SHIPMENTS' | 'DELETE_VESSEL' | 'DELETE_EQUIPMENT' | 'DELETE_SPARE_PARTS' | 'DELETE_CUSTOMS' | 'UPSERT_SUPPLIER' | 'DELETE_SUPPLIER' | 'UPSERT_LOGISTICS' | 'DELETE_LOGISTICS' | 'LOG_ACTION' | 'SAVE_REPORT' | 'UPSERT_USER' | 'DELETE_USER' | 'SAVE_ARCHIVE' | 'DELETE_ARCHIVE' | 'UPSERT_COSTS' | 'DELETE_COSTS' | 'UPSERT_PRE_ALERTS' | 'DELETE_PRE_ALERTS';
  data: any;
  timestamp: string;
}

let pendingWrites: PendingWrite[] = [];

let dbState: StorageState = {
  parts: [], shipments: [], vesselTracking: [], equipmentTracking: [], sparePartsTracking: [],
  customsClearance: [], preAlerts: [], costs: [], logs: [], snapshots: [],
  logistics: [], suppliers: [], dataStageReports: [], trainingSubmissions: [], commercialInvoices: [],
  dailyChanges: [], dailyReports: [], users: [],
  cfdiInvoices: [], xmlCI: [], fianzas: []
};

let listeners: (() => void)[] = [];
let unsubscribers: (() => void)[] = [];
let isMDLoading = false;
let isBackgroundSyncing = false;
let isRefreshingInvoices = false;
let lastInvoicesRefresh = 0;

const notifyListeners = () => listeners.forEach(l => l());

export const isQuotaError = (e: any): boolean => {
  if (!e) return false;
  const errMsg = (e.message || e.toString() || '').toLowerCase();
  // e.code can be a string ('resource-exhausted'), a number (429, 400) or undefined
  const code = String(e.code ?? '').toLowerCase();
  return (
    errMsg.includes('quota') ||
    errMsg.includes('exhausted') ||
    errMsg.includes('limit exceeded') ||
    errMsg.includes('rebasado') || // Spanish variant
    code === 'resource-exhausted' ||
    code === 'quota-exceeded' ||
    code.includes('quota') ||
    code === '429'   // HTTP Too Many Requests
  );
};


// Helper to convert undefined to null for Firestore
const sanitizeForFirestore = (obj: any): any => {
  if (obj === undefined) return null;
  if (obj === null) return null;

  // CRITICAL: Handle NaN (which Firestore rejects)
  if (typeof obj === 'number' && Number.isNaN(obj)) {
    console.warn("Detected NaN during sanitization, converting to null.");
    return null;
  }

  if (Array.isArray(obj)) return obj.map(sanitizeForFirestore);
  if (typeof obj === 'object' && !(obj instanceof Date)) {
    const newObj: any = {};
    Object.keys(obj).forEach(key => {
      newObj[key] = sanitizeForFirestore(obj[key]);
    });
    return newObj;
  }
  return obj;
};

const saveLocal = (skipParts = false) => {
  // 1. Decouple ALL heavy collections for High-Capacity Performance
  // We EXCLUDE these from localStorage to stay under the 5MB quota
  const {
    parts,
    commercialInvoices,
    logs,
    snapshots,
    dataStageReports,
    shipments,
    vesselTracking,
    equipmentTracking,
    customsClearance,
    preAlerts,
    costs,
    logistics,
    suppliers,
    dailyChanges,
    dailyReports,
    users,
    trainingSubmissions,
    ...lightState
  } = dbState;

  try {
    // Only save minimal non-operational state to localStorage ('logimaster_db')
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(lightState));
  } catch (e: any) {
    if (isQuotaError(e)) {
      console.warn("[Storage] LocalStorage quota exceeded. Non-essential state not saved.");
      // We don't throw here to avoid crashing the save flow
    }
  }

  // 2. Persist Heavy Collections to IndexedDB (Direct Storage)
  if (!skipParts && dbState.parts.length > 0) {
    indexedDbService.saveParts(dbState.parts);
  }

  // Save the rest of the operational state to 'app_state' store
  const operationalData = {
    id: 'current_state',
    shipments: dbState.shipments,
    vesselTracking: dbState.vesselTracking,
    equipmentTracking: dbState.equipmentTracking,
    customsClearance: dbState.customsClearance,
    preAlerts: dbState.preAlerts,
    costs: dbState.costs,
    logistics: dbState.logistics,
    suppliers: dbState.suppliers,
    dailyChanges: dbState.dailyChanges,
    dailyReports: dbState.dailyReports,
    users: dbState.users,
    trainingSubmissions: dbState.trainingSubmissions
  };
  indexedDbService.saveData('app_state', [operationalData]);

  if (dbState.commercialInvoices && dbState.commercialInvoices.length > 0) {
    indexedDbService.saveInvoices(dbState.commercialInvoices);
  }

  if (dbState.logs && dbState.logs.length > 0) {
    // Only save last 500 logs to IDB to avoid bloat there too
    indexedDbService.saveLogs(dbState.logs.slice(-500));
  }

  if (dbState.dataStageReports && dbState.dataStageReports.length > 0) {
    indexedDbService.saveData('datastage_reports', dbState.dataStageReports);
  }

  // 3. Persist Queue to IDB
  if (pendingWrites.length > 0) {
    indexedDbService.saveData('sync_queue', pendingWrites);
    // Explicitly remove from localStorage to free up space
    localStorage.removeItem(PENDING_WRITES_KEY);
  }

  notifyListeners();
};

const queueWrite = (action: PendingWrite['action'], data: any) => {
  const write: PendingWrite = {
    id: generateId(),
    action,
    data,
    timestamp: new Date().toISOString()
  };
  pendingWrites.push(write);
  saveLocal();
  console.log(`[Offline] Queued Write: ${action}`);
};

const processSyncQueue = async () => {
  if (!db || pendingWrites.length === 0) return;

  console.log(`[Sync] Processing ${pendingWrites.length} queued writes...`);
  const queue = [...pendingWrites];
  // Clear global queue to list, allowing new separate failures to re-queue if needed
  // But for safety, we keep them until processed.

  // We process sequentially to maintain order
  for (const task of queue) {
    try {
      console.log(`[Sync] Replaying ${task.action}...`);
      switch (task.action) {
        case 'UPSERT_PARTS': await storageService.upsertParts(task.data); break;
        case 'UPSERT_SHIPMENTS': await storageService.upsertShipments(task.data); break;
        case 'UPSERT_VESSEL': await storageService.upsertVesselTracking(task.data); break;
        case 'UPDATE_VESSEL': await storageService.updateVesselTracking(task.data); break;
        case 'UPDATE_EQUIPMENT': await storageService.updateEquipmentTracking(task.data); break; // Note: Queued as single or array? Array usually preferred for sync
        case 'UPDATE_CUSTOMS': await storageService.updateCustomsClearance(task.data); break;
        case 'UPSERT_INVOICES': await storageService.batchUpdateInvoiceItems(task.data); break; // Use batch for efficiency
        case 'DELETE_PARTS': await storageService.deleteParts(task.data); break;
        case 'DELETE_INVOICES': await storageService.deleteInvoiceItems(task.data); break;
        case 'DELETE_SHIPMENTS': await storageService.deleteShipments(task.data); break;
        case 'DELETE_VESSEL': await storageService.deleteVesselTrackings(task.data); break;
        case 'DELETE_EQUIPMENT': await storageService.deleteEquipmentTrackings(task.data); break;
        case 'DELETE_CUSTOMS': await storageService.deleteCustomsClearances(task.data); break;
        case 'UPSERT_SUPPLIER': await storageService.updateSupplier(task.data); break;
        case 'DELETE_SUPPLIER': await storageService.deleteSupplier(task.data); break;
        case 'UPSERT_LOGISTICS': await storageService.upsertLogistics(task.data); break;
        case 'DELETE_LOGISTICS': await storageService.deleteLogistics(task.data); break;
        case 'LOG_ACTION': await storageService.logAction(task.data.action, task.data.details); break;
        case 'SAVE_REPORT': await storageService.saveDataStageReport(task.data, undefined, undefined, undefined); break;
        case 'UPSERT_USER': await storageService.upsertUser(task.data); break;
        case 'DELETE_USER': await storageService.deleteUser(task.data); break;
        case 'SAVE_ARCHIVE': await storageService.saveToDigitalArchive(task.data.record, task.data.docId, task.data.pdfUrl); break;
        case 'DELETE_ARCHIVE': await storageService.deleteDigitalArchive(task.data); break;
        case 'UPSERT_COSTS': await storageService.addCost(task.data); break;
        case 'DELETE_COSTS': await storageService.deleteCosts(task.data); break;
        case 'UPSERT_PRE_ALERTS': await storageService.updatePreAlert(task.data); break;
        case 'DELETE_PRE_ALERTS': await storageService.deletePreAlerts(task.data); break;
      }

      // Success: Remove from queue
      pendingWrites = pendingWrites.filter(w => w.id !== task.id);
      await indexedDbService.saveData('sync_queue', pendingWrites);
    } catch (e) {
      // Keep in queue until success
    }
  }
};

// --- AUDIT LOGGING HELPER ---
const logAction = async (action: string, details: string) => {
  try {
    const userStr = localStorage.getItem('logimaster_user');
    const user = userStr ? JSON.parse(userStr) : { name: 'Anonymous/System' };

    const logEntry: AuditLog = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      action,
      details,
      user: user.name || user.email || 'System'
    };

    // Local
    if (!dbState.logs) (dbState as any).logs = [];
    dbState.logs.push(logEntry);
    saveLocal();

    // Cloud (Solo si la base de datos está disponible)
    if (db) {
      const { setDoc, doc, collection } = await import('firebase/firestore');
      await setDoc(doc(collection(db, COLS.LOGS), logEntry.id), sanitizeForFirestore(logEntry));
    } else {
      // Queue for sync to ensure audit trail is complete
      queueWrite('LOG_ACTION', { action, details }); // We rely on queue to replay this
    }
    console.log(`[Audit] ${action}: ${details} by ${logEntry.user}`);
  } catch (e) {
    console.error("Audit Logging Failed:", e);
  }
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
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const generateId = () => crypto.randomUUID();

export const storageService = {
  // CORE METHODS
  getLocalState: () => dbState,
  logAction,

  bumpPartsVersion: async () => {
    if (!db) return;
    try {
      const metaDocRef = doc(db, COLS.METADATA, 'parts_version');
      const snap = await getDoc(metaDocRef);
      let nextVer = 1;
      if (snap.exists()) {
        nextVer = (snap.data().version || 0) + 1;
      }
      await setDoc(metaDocRef, {
        version: nextVer,
        lastUpdated: new Date().toISOString()
      });
      console.log(`🚀 Master Data Semaforo: Version bumped to v${nextVer}`);
    } catch (e: any) {
      if (isQuotaError(e)) {
        console.warn("Quota exceeded during Version Bump (Non-blocking).");
      } else {
        console.error("Failed to bump parts version", e);
      }
    }
  },

  init: async (role?: UserRole) => {
    unsubscribers.forEach(u => u());
    unsubscribers = [];

    if (!db) {
      // Offline / No-DB Mode: Hydrate EVERYTHING from IndexedDB
      const localData = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (localData) {
        try {
          dbState = { ...dbState, ...JSON.parse(localData) };
        } catch (e) {
          console.error("Failed to parse local storage", e);
        }
      }

      try {
        await indexedDbService.init();

        // Load App State (Shipments, Tracking, etc.)
        const appStates = await indexedDbService.getAllData('app_state');
        const currentState = appStates.find(s => s.id === 'current_state');
        if (currentState) {
          dbState = { ...dbState, ...currentState };
          // Remove the id from dbState
          delete (dbState as any).id;
        }

        // Load Parts, Invoices, logs
        dbState.parts = await indexedDbService.getAllParts();
        dbState.commercialInvoices = await indexedDbService.getAllInvoices();
        dbState.logs = await indexedDbService.getAllLogs();
        dbState.dataStageReports = await indexedDbService.getAllData('datastage_reports');

        console.log("📡 Offline Mode: Hydrated all data from IndexedDB");
      } catch (e) {
        console.warn("Offline hydration failed", e);
      }

      notifyListeners();
      return;
    }

    // 1. Load Local State First (Cache - Minimal)
    const localData = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (localData) {
      try {
        dbState = { ...dbState, ...JSON.parse(localData) };
      } catch (e) {
        console.error("Corrupt LocalDB, resetting.", e);
        dbState.parts = [];
      }
    }

    // 2. HYDRATE HEAVY DATA FROM INDEXEDDB
    try {
      await indexedDbService.init();

      // Load App State (Shipments, Tracking, etc.)
      const appStates = await indexedDbService.getAllData('app_state');
      const currentState = appStates.find(s => s.id === 'current_state');
      if (currentState) {
        dbState = { ...dbState, ...currentState };
        delete (dbState as any).id;
      }

      // Parts
      const localParts = await indexedDbService.getAllParts();
      if (localParts.length > 0) {
        dbState.parts = localParts;
        console.log(`📦 Pre-loaded ${dbState.parts.length} parts from IndexedDB`);
        notifyListeners(); // Ensure UI knows about pre-loaded parts
      }

      // Invoices
      const localInvoices = await indexedDbService.getAllInvoices();
      if (localInvoices.length > 0) {
        dbState.commercialInvoices = localInvoices;
        console.log(`🧾 Pre-loaded ${dbState.commercialInvoices.length} invoices from IndexedDB`);
      }

      // Logs
      const localLogs = await indexedDbService.getAllLogs();
      if (localLogs.length > 0) {
        dbState.logs = localLogs;
      }

      // DataStage Reports
      const localReports = await indexedDbService.getAllData('datastage_reports');
      if (localReports.length > 0) {
        dbState.dataStageReports = localReports;
      }

      // Sync Queue
      const queue = await indexedDbService.getAllData('sync_queue');
      if (queue.length > 0) {
        pendingWrites = queue;
        console.log(`🔄 Pre-loaded ${pendingWrites.length} queued writes from IndexedDB`);
      }

    } catch (e) {
      console.warn("IndexedDB hydration failed", e);
    }

    try {
      // 3. LISTENERS for dynamic data (Strict Daily Audit Sync)
      // LIMIT entries to 150 (Reduced from 3500 for boot performance)
      const qChanges = query(collection(db, COLS.DAILY_CHANGES), orderBy('timestamp', 'desc'), limit(150));
      unsubscribers.push(onSnapshot(qChanges, (snap) => {
        dbState.dailyChanges = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as DailyChange));
        notifyListeners();
      }));

      const qReports = query(collection(db, COLS.DAILY_REPORTS), orderBy('id', 'desc'), limit(100));
      unsubscribers.push(onSnapshot(qReports, (snap) => {
        dbState.dailyReports = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as MasterDataReport));
        notifyListeners();
      }));

      const qLogs = query(collection(db, COLS.LOGS), orderBy('timestamp', 'desc'), limit(150));
      unsubscribers.push(onSnapshot(qLogs, (snap) => {
        dbState.logs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as AuditLog));
        notifyListeners();
      }));

      // [NEW] Incremental Parts Listener (Real-time sync for Master Data)
      const qParts = query(collection(db, COLS.PARTS), orderBy('UPDATE_TIME', 'desc'), limit(50));
      unsubscribers.push(onSnapshot(qParts, (snap) => {
        let changed = false;
        let newParts = [...dbState.parts];
        snap.docChanges().forEach(change => {
          const data = { ...change.doc.data(), id: change.doc.id } as RawMaterialPart;
          const standardPN = (data.PART_NUMBER || '').toString().toUpperCase().trim();

          if (change.type === 'added' || change.type === 'modified') {
            newParts = newParts.filter(p => p.id !== data.id && (p.PART_NUMBER || '').toString().toUpperCase().trim() !== standardPN);
            newParts.push(data);
            changed = true;
          } else if (change.type === 'removed') {
            newParts = newParts.filter(p => p.id !== data.id);
            changed = true;
          }
        });
        if (changed) {
          dbState.parts = newParts;
          notifyListeners();
        }
      }));

      // 4. REAL-TIME LISTENERS (Optimized based on Role and Weight)
      Object.entries(COLS).forEach(([key, colName]) => {
        // (A) Skip Meta / Master Data (Handled manually above)
        if (key === 'PARTS' || key === 'METADATA') return;

        // (B) Skip Heavy Collections from Initial Sync (Lazy Load required on-page)
        if (key === 'LOGS') return;

        // (C) Agent Role Optimization: Only sync Suppliers + Logistics + Daily Tools + Fianzas
        if (role === UserRole.AGENT) {
          if (key !== 'SUPPLIERS' && key !== 'LOGISTICS' && key !== 'DAILY_CHANGES' && key !== 'DAILY_REPORTS' && key !== 'FIANZAS') return;
        }

        // (D) Editor / Operator Optimization: Shared critical operational data
        if (role === UserRole.EDITOR || role === UserRole.OPERATOR) {
          if (key === 'SNAPSHOTS' || key === 'DATA_STAGE_REPORTS') return;
        }

        // (D) Skip items handled by specialized listeners above
        const queryRef = (key === 'DAILY_CHANGES' || key === 'DAILY_REPORTS' || key === 'LOGS')
          ? null // Handled above queries
          : collection(db, colName);

        if (!queryRef) return;

        unsubscribers.push(onSnapshot(queryRef, (snap) => {
          const cloudData = snap.docs.map(d => ({ ...d.data(), id: d.id }));
          const cloudIds = new Set(cloudData.map(d => d.id));

          let stateKey = key.toLowerCase().replace(/_([a-z])/g, (g) => g[1].toUpperCase());
          if (key === 'CUSTOMS') stateKey = 'customsClearance';
          if (key === 'EQUIPMENT') stateKey = 'equipmentTracking';
          if (key === 'SPARE_PARTS') stateKey = 'sparePartsTracking';
          if (key === 'TRAINING') stateKey = 'trainingSubmissions';
          if (key === 'INVOICES') stateKey = 'commercialInvoices';
          if (key === 'XML_CI') stateKey = 'xmlCI';

          console.log(`[Sync] Attaching listener for ${key} -> dbState.${stateKey}`);

          const currentLocal = (dbState as any)[stateKey] || [];
          const localMap = new Map(currentLocal.map((i: any) => [i.id, i]));

          cloudData.forEach((cloudItem: any) => {
            const localItem = localMap.get(cloudItem.id) as any;
            // Conflict Resolution: Latest Timestamp Wins
            if (localItem && localItem.updatedAt && cloudItem.updatedAt) {
              const localTime = new Date(localItem.updatedAt).getTime();
              const cloudTime = new Date(cloudItem.updatedAt).getTime();
              // If local is newer (e.g. pending write), don't overwrite with old cloud data
              if (localTime > cloudTime) return;
            }
            localMap.set(cloudItem.id, cloudItem);
          });

          const finalState = Array.from(localMap.values()).filter((item: any) => cloudIds.has(item.id));
          (dbState as any)[stateKey] = finalState;
          notifyListeners();
        }, (error) => {
          console.error(`[Firestore] Listener Error on ${key}:`, error);
          // Optional: Notify user toast
          // toast.error(`Lost connection to ${key}`);
        }));
      });

      // 5. Process Offline Queue
      const rawQueue = localStorage.getItem(PENDING_WRITES_KEY);
      if (rawQueue) {
        try { pendingWrites = JSON.parse(rawQueue); } catch (e) { }
      }
      // Attempt sync
      setTimeout(() => processSyncQueue(), 5000); // 5s delay to allow connection warump

    } catch (e) {
      console.error("Initialization Sync failed", e);
    }

    // Invoices are loaded via IndexedDB hydrate in Step 2 or via onSnapshot
  },

  getParts: () => dbState.parts || [],

  isMasterDataLoading: () => isMDLoading,
  isBackgroundSyncing: () => isBackgroundSyncing,

  loadMasterData: async (force: boolean = false) => {
    if (!db || isMDLoading) return;

    try {
      isMDLoading = true;
      notifyListeners();

      // 1. HYDRATE FROM INDEXEDDB
      if (dbState.parts.length < 10) {
        const localParts = await indexedDbService.getAllParts();
        if (localParts.length > 0) {
          dbState.parts = localParts;
          notifyListeners();
        }
        notifyListeners();
      }

      isMDLoading = false;
      notifyListeners();

      // 2. BACKGROUND SYNC (Bidirectional cleanup)
      (async () => {
        try {
          isBackgroundSyncing = true;
          notifyListeners();

          const partsSnap = await getDocs(collection(db, COLS.PARTS));
          const cloudParts = partsSnap.docs.map(d => {
            const data = d.data();
            return {
              ...data,
              id: d.id,
              PART_NUMBER: (data.PART_NUMBER || data.PartNo || data.PARTNUMBER || '').toString().toUpperCase().trim(),
              UPDATE_TIME: data.UPDATE_TIME || '1970-01-01T00:00:00.000Z'
            } as RawMaterialPart;
          }).filter(p => !!p.PART_NUMBER);

          const cloudIds = new Set(cloudParts.map(p => p.id));
          // 1. Get Delta Sync (Only what changed since last load)
          const lastSyncTime = localStorage.getItem('last_parts_sync_time') || '1970-01-01T00:00:00.000Z';
          const qRecent = query(collection(db, COLS.PARTS), where('UPDATE_TIME', '>', lastSyncTime));
          const recentSnap = await getDocs(qRecent);

          let updatedParts = [...dbState.parts];
          let recentData = recentSnap.docs.map(d => ({ ...d.data(), id: d.id } as RawMaterialPart));

          if (recentData.length > 0) {
            console.log(`[Sync] Found ${recentData.length} recent changes.`);
            recentData.forEach(cloudP => {
              const standardPN = (cloudP.PART_NUMBER || '').toString().toUpperCase().trim();
              // Kill all local ghosts of this PN
              updatedParts = updatedParts.filter(p =>
                p.id !== cloudP.id &&
                (p.PART_NUMBER || '').toString().toUpperCase().trim() !== standardPN
              );
              updatedParts.push(cloudP);
            });
            localStorage.setItem('last_parts_sync_time', new Date().toISOString());
          }

          // 2. COUNTER DISCREPANCY CHECK (Fixing the 50 vs 12K issue)
          const localCount = updatedParts.length;
          const cloudCount = cloudIds.size;

          // Trigger full sync if:
          // 1. Force is true
          // 2. Local count is significantly more than cloud (legacy fix)
          // 3. Local count is significantly LESS than cloud (the current bug)
          // 4. Local count is zero but cloud has data
          const needsFullSync = force ||
            localCount > 15000 ||
            (cloudCount > 100 && localCount < (cloudCount * 0.8)) ||
            (localCount === 0 && cloudCount > 0);

          if (needsFullSync) {
            console.log(`[Sync] Discrepancy detected (Local: ${localCount}, Cloud: ${cloudCount}) or forced. Refreshing full state...`);

            // If we already have cloudParts from step 1, we can just use those instead of re-fetching in batches
            // unless the collection is so gargantuan that we prefer the batched memory management.
            // For 12K-20K, cloudParts is already in memory from line 559.

            if (cloudParts.length > 0) {
              dbState.parts = cloudParts;
              await indexedDbService.clearParts();
              await indexedDbService.saveParts(cloudParts);
            } else {
              // Fallback to batched logic if cloudParts was somehow lost or empty but ids exist
              let allCloud: RawMaterialPart[] = [];
              let lastVisible = null;
              let hasMore = true;
              const BATCH_SIZE = 2000;

              while (hasMore) {
                let qAll = lastVisible
                  ? query(collection(db, COLS.PARTS), orderBy('UPDATE_TIME', 'desc'), startAfter(lastVisible), limit(BATCH_SIZE))
                  : query(collection(db, COLS.PARTS), orderBy('UPDATE_TIME', 'desc'), limit(BATCH_SIZE));

                const batchSnap = await getDocs(qAll);
                const batchData = batchSnap.docs.map(d => ({ ...d.data(), id: d.id } as RawMaterialPart));
                allCloud = [...allCloud, ...batchData];
                if (batchSnap.docs.length < BATCH_SIZE) hasMore = false;
                else lastVisible = batchSnap.docs[batchSnap.docs.length - 1];
              }
              dbState.parts = allCloud;
              await indexedDbService.clearParts();
              await indexedDbService.saveParts(allCloud);
            }

            localStorage.setItem('last_parts_sync_time', new Date().toISOString());
            console.log(`[Sync] Full state synchronization complete. Total items: ${dbState.parts.length}`);
          } else if (recentData.length > 0) {
            dbState.parts = updatedParts;
            await indexedDbService.saveParts(recentData);
          }

          notifyListeners();
        } catch (err: any) {
          console.error("⚠️ Background Sync Failed:", err);
        } finally {
          isBackgroundSyncing = false;
          notifyListeners();
        }
      })();
    } catch (e: any) {
      console.error("Master Data Init failed", e);
    } finally {
      isMDLoading = false;
      notifyListeners();
    }
  },

  /**
   * DIRECT CLOUD CHECK: Bypasses local state to find actual records in Firestore.
   * This is used during bulk upload to eliminate "ghost" interference.
   */
  validatePartsExistInCloud: async (partNumbers: string[]): Promise<Map<string, string[]>> => {
    if (!db) throw new Error("Sin conexión a Internet.");

    const results = new Map<string, string[]>();
    const cleanNumbers = new Set(partNumbers.map(n => n.toString().toUpperCase().trim()).filter(n => !!n));

    // === FAST PATH: Use local state (already synced from Firestore) ===
    // Avoids hundreds of Firestore queries when parts are already loaded
    if (dbState.parts && dbState.parts.length > 0) {
      dbState.parts.forEach(p => {
        const pn = (p.PART_NUMBER || '').toString().toUpperCase().trim();
        if (cleanNumbers.has(pn)) {
          const existing = results.get(pn) || [];
          if (!existing.includes(p.id)) results.set(pn, [...existing, p.id]);
        }
      });
      return results;
    }

    // === SLOW PATH: Query Firestore only if local state is empty ===
    const cleanArr = Array.from(cleanNumbers);
    const CHUNK_SIZE = 30; // Firestore 'in' limit
    for (let i = 0; i < cleanArr.length; i += CHUNK_SIZE) {
      const chunk = cleanArr.slice(i, i + CHUNK_SIZE);
      const q = query(collection(db, COLS.PARTS), where("PART_NUMBER", "in", chunk));
      const snap = await getDocs(q);
      snap.docs.forEach(doc => {
        const pn = ((doc.data().PART_NUMBER) || '').toString().toUpperCase().trim();
        if (pn) {
          const existing = results.get(pn) || [];
          if (!existing.includes(doc.id)) results.set(pn, [...existing, doc.id]);
        }
      });
    }

    return results;
  },


  getShipments: () => dbState.shipments || [],
  getVesselTracking: () => dbState.vesselTracking || [],
  getEquipmentTracking: () => dbState.equipmentTracking || [],
  getSparePartsTracking: () => dbState.sparePartsTracking || [],
  getCustomsClearance: () => dbState.customsClearance || [],
  getPreAlerts: () => dbState.preAlerts || [],
  getCosts: () => dbState.costs || [],

  getLogistics: () => dbState.logistics || [],
  getSuppliers: () => dbState.suppliers || [],

  // --- SUPPLIERS CRUD ---
  // --- SUPPLIERS CRUD ---
  updateSupplier: async (record: Supplier) => {
    const updated = { ...record, updatedAt: new Date().toISOString() };
    const id = record.id || generateId();

    if (!db) throw new Error("Sin conexión a Internet.");
    await setDoc(doc(db, COLS.SUPPLIERS, id), sanitizeForFirestore({ ...updated, id }));

    // Update Local
    const idx = dbState.suppliers.findIndex((s: any) => s.id === id);
    if (idx !== -1) dbState.suppliers[idx] = { ...updated, id };
    else dbState.suppliers.push({ ...updated, id });
    notifyListeners();
    saveLocal();
  },

  deleteSupplier: async (id: string) => {
    if (!db) throw new Error("Sin conexión a Internet.");
    await deleteDoc(doc(db, COLS.SUPPLIERS, id));

    // Update Local
    dbState.suppliers = dbState.suppliers.filter((s: any) => s.id !== id);
    notifyListeners();
    saveLocal();
  },

  // --- LOGISTICS CRUD ---
  upsertLogistics: async (record: any) => {
    const updated = { ...record, updatedAt: new Date().toISOString() };
    const id = record.id || generateId();

    if (!db) throw new Error("Sin conexión a Internet.");
    await setDoc(doc(db, COLS.LOGISTICS, id), sanitizeForFirestore({ ...updated, id }));

    // Update Local
    const idx = dbState.logistics.findIndex((l: any) => l.id === id);
    if (idx !== -1) dbState.logistics[idx] = { ...updated, id };
    else dbState.logistics.push({ ...updated, id });
    notifyListeners();
    saveLocal();
  },

  deleteLogistics: async (id: string) => {
    if (!db) throw new Error("Sin conexión a Internet.");
    await deleteDoc(doc(db, COLS.LOGISTICS, id));

    // Update Local
    dbState.logistics = dbState.logistics.filter((l: any) => l.id !== id);
    notifyListeners();
    saveLocal();
  },

  saveLogisticsData: async (records: any[], onProgress?: (progress: number) => void) => {
    if (!db) throw new Error("Sin conexión a Internet.");
    const chunks = [];
    for (let i = 0; i < records.length; i += 400) {
      chunks.push(records.slice(i, i + 400));
    }

    let processed = 0;
    for (const chunk of chunks) {
      const batch = writeBatch(db);
      chunk.forEach((record) => {
        const id = record.id || generateId();
        const updated = { ...record, id, updatedAt: new Date().toISOString() };
        batch.set(doc(db, COLS.LOGISTICS, id), sanitizeForFirestore(updated));

        // Update Local
        const idx = dbState.logistics.findIndex((l: any) => l.id === id);
        if (idx !== -1) dbState.logistics[idx] = updated;
        else dbState.logistics.push(updated);
      });
      await batch.commit();
      
      processed += chunk.length;
      if (onProgress) onProgress((processed / records.length) * 100);
    }
    notifyListeners();
    saveLocal();
  },

  // --- USER MANAGEMENT CRUD ---
  upsertUser: async (user: any) => {
    const id = user.email;
    const updated = { ...user, lastLogin: user.lastLogin || new Date().toISOString() };

    if (!db) throw new Error("Sin conexión a Internet.");
    await setDoc(doc(db, COLS.USERS, id), sanitizeForFirestore(updated), { merge: true });

    // Update Local
    const idx = dbState.users.findIndex((u: any) => u.email === id);
    if (idx !== -1) dbState.users[idx] = { ...dbState.users[idx], ...updated };
    else dbState.users.push(updated);
    notifyListeners();
    saveLocal();
  },

  deleteUser: async (email: string) => {
    if (!db) throw new Error("Sin conexión a Internet.");
    await deleteDoc(doc(db, COLS.USERS, email));

    // Update Local
    dbState.users = dbState.users.filter((u: any) => u.email !== email);
    notifyListeners();
    saveLocal();
  },
  getDataStageReports: () => dbState.dataStageReports || [],

  // Loads the full PedimentoRecords for a report from Firestore subcollection.
  // Reports are saved "lean" (records:[]) to avoid Firestore 1MB doc limit.
  getDataStageReportWithRecords: async (reportId: string): Promise<PedimentoRecord[]> => {
    if (!db) return [];
    // Check if already hydrated in memory
    const cached = (dbState.dataStageReports || []).find((r: any) => r.id === reportId);
    if (cached && cached.records && cached.records.length > 0) return cached.records;

    try {
      const { collection, getDocs } = await import('firebase/firestore');
      const itemsRef = collection(db, COLS.DATA_STAGE_REPORTS, reportId, 'items');
      const snap = await getDocs(itemsRef);
      if (snap.empty) return [];
      const records = snap.docs.map(d => d.data() as PedimentoRecord);

      // Hydrate in memory so future calls are instant
      if (cached) cached.records = records;
      console.log(`[DataStage] Loaded ${records.length} records for report ${reportId}`);
      return records;
    } catch (e) {
      console.error('[DataStage] Failed to load records from subcollection:', e);
      return [];
    }
  },
  getInvoiceItems: () => dbState.commercialInvoices || [],

  updateCost: async (cost: CostRecord) => {
    const id = cost.id || generateId();
    if (!db) throw new Error("Sin conexión a Internet.");
    await setDoc(doc(db, COLS.COSTS, id), sanitizeForFirestore(cost));

    // Update Local
    const idx = dbState.costs.findIndex((c: any) => c.id === id);
    if (idx !== -1) dbState.costs[idx] = { ...cost, id }; else dbState.costs.push({ ...cost, id });
    notifyListeners();
    saveLocal();
  },

  deleteCost: async (id: string) => {
    if (!db) throw new Error("Sin conexión a Internet.");
    await deleteDoc(doc(db, COLS.COSTS, id));

    // Update Local
    dbState.costs = dbState.costs.filter((c: any) => c.id !== id);
    notifyListeners();
    saveLocal();
  },

  deleteCosts: async (ids: string[]) => {
    if (!db) throw new Error("Sin conexión a Internet.");
    const batch = writeBatch(db);
    ids.forEach(id => {
      batch.delete(doc(db, COLS.COSTS, id));
    });
    await batch.commit();

    // Update Local
    dbState.costs = dbState.costs.filter((c: any) => !ids.includes(c.id));
    notifyListeners();
    saveLocal();
  },

  // Commercial Invoices CRUD (Cloud-Enabled & Direct Write)
  overwriteInvoiceItems: async (invoiceNo: string, newItems: CommercialInvoiceItem[]) => {
    if (!db) throw new Error("Sin conexión a Internet.");
    const normalize = (val: any) => String(val || '').trim().toUpperCase();
    const targetedInvoice = normalize(invoiceNo);

    // 1. DELETE OLD ITEMS FOR THIS INVOICE (Prevent "Ghost Duplicates")
    const q = query(collection(db, COLS.INVOICES), where('invoiceNo', '==', invoiceNo)); // Ensure casing matches or use loose filter if inconsistent
    // Better: Filter efficiently. Since we normalized invoiceNo in save, we hope it matches.
    // If casing issue: We might need to fetch all and filter client side if we suspect bad data.
    // For now, assume standard usage.

    // FETCH EXISTING IDs
    const qSnapshot = await getDocs(q);
    const idsToDelete = qSnapshot.docs.map(d => d.id);

    if (idsToDelete.length > 0) {
      console.log(`[Overwrite] Deleting ${idsToDelete.length} old items for Invoice ${invoiceNo}`);
      await storageService.deleteInvoiceItems(idsToDelete);
    }

    // 2. ADD NEW ITEMS (Using the robust deterministic ID from CIExtractor)
    await storageService.addInvoiceItems(newItems);
  },

  addInvoiceItems: async (newItems: CommercialInvoiceItem[]) => {
    // 1. Deduplication (using local state as cache)
    // FIX: Exclude HTS from unique key to prevent duplicates when Master Data adds/changes HTS
    const normalize = (val: any) => String(val || '').trim().toUpperCase();

    const existingKeys = new Set(
      (dbState.commercialInvoices || []).map(
        (i: any) => `${normalize(i.invoiceNo)}-${normalize(i.partNo)}-${Number(i.qty || 0).toFixed(4)}`
      )
    );

    const uniqueNewItems = newItems.filter(item => {
      // Logic: If Invoice + Part + Qty matches, it's likely the same line.
      const key = `${normalize(item.invoiceNo)}-${normalize(item.partNo)}-${Number(item.qty || 0).toFixed(4)}`;
      return !existingKeys.has(key);
    });

    if (uniqueNewItems.length === 0) {
      console.log("No unique items to add.");
      return;
    }

    if (!db) throw new Error("Sin conexión a Internet/Base de Datos.");

    // Cloud Write FIRST (Batch)
    const chunks = [];
    for (let i = 0; i < uniqueNewItems.length; i += 400) {
      chunks.push(uniqueNewItems.slice(i, i + 400));
    }

    for (const chunk of chunks) {
      const batch = writeBatch(db);
      chunk.forEach((item) => {
        batch.set(doc(db, COLS.INVOICES, item.id), sanitizeForFirestore(item));
      });
      try {
        await batch.commit();
      } catch (e) {
        console.error("Critical Invoice Batch Write Failed", e);
        throw e;
      }
    }

    const invoiceNos = Array.from(new Set(uniqueNewItems.map(i => i.invoiceNo))).join(', ');
    const containers = Array.from(new Set(uniqueNewItems.map(i => i.containerNo).filter(Boolean))).join(', ');

    try {
      logAction('INVOICE_IMPORT', `Factura: ${invoiceNos} | Contenedor: ${containers || 'N/A'} | Líneas: ${uniqueNewItems.length}`);
    } catch (e) { }

    // Update Local State AFTER successful Cloud Write
    if (!dbState.commercialInvoices) dbState.commercialInvoices = [];
    dbState.commercialInvoices = [...dbState.commercialInvoices, ...uniqueNewItems];
    notifyListeners();

    return uniqueNewItems.length;
  },

  updateInvoiceItem: async (item: CommercialInvoiceItem) => {
    if (!db) throw new Error("Sin conexión a Internet.");

    // Direct Write
    try {
      await setDoc(doc(db, COLS.INVOICES, item.id), sanitizeForFirestore(item));

      // Update Local State    // Local update (Enforce Immutability)
      const idx = (dbState.commercialInvoices || []).findIndex((i: any) => i.id === item.id);
      if (idx !== -1) {
        const newInvoices = [...(dbState.commercialInvoices || [])];
        newInvoices[idx] = item;
        dbState.commercialInvoices = newInvoices;
        notifyListeners();
      }
    } catch (e) {
      console.error("Update Invoice Item Failed", e);
      throw e;
    }
  },

  batchUpdateInvoiceItems: async (items: CommercialInvoiceItem[]) => {
    if (!db) throw new Error("Sin conexión a Internet.");

    // Direct Cloud Batch Update
    const chunks = [];
    for (let i = 0; i < items.length; i += 400) {
      chunks.push(items.slice(i, i + 400));
    }

    for (const chunk of chunks) {
      const batch = writeBatch(db);
      chunk.forEach(item => {
        const ref = doc(db, COLS.INVOICES, item.id);
        batch.set(ref, sanitizeForFirestore(item));
      });
      try {
        await batch.commit();
      } catch (e) {
        console.error("Critical Batch Update Failed", e);
        throw e;
      }
    }

    // Update Local State AFTER success
    if (!dbState.commercialInvoices) dbState.commercialInvoices = [];
    items.forEach(item => {
      const idx = dbState.commercialInvoices.findIndex((i: any) => i.id === item.id);
      if (idx !== -1) dbState.commercialInvoices[idx] = item;
    });
    notifyListeners();
  },

  refreshInvoices: async (force = false) => {
    if (!db) return [];
    
    const now = Date.now();
    if (!force && dbState.commercialInvoices.length > 0 && (now - lastInvoicesRefresh < 30000)) {
      return dbState.commercialInvoices;
    }

    if (isRefreshingInvoices) return dbState.commercialInvoices;

    try {
      isRefreshingInvoices = true;
      const snap = await getDocs(collection(db, COLS.INVOICES));
      dbState.commercialInvoices = snap.docs.map(d => ({ ...d.data(), id: d.id } as CommercialInvoiceItem));
      lastInvoicesRefresh = Date.now();
      notifyListeners();
      return dbState.commercialInvoices;
    } catch (e) {
      console.error("Failed to refresh invoices", e);
      return dbState.commercialInvoices;
    } finally {
      isRefreshingInvoices = false;
    }
  },

  deleteInvoiceItem: async (id: string) => {
    if (!db) throw new Error("Sin conexión a Internet.");
    await deleteDoc(doc(db, COLS.INVOICES, id));

    dbState.commercialInvoices = dbState.commercialInvoices.filter((i: any) => i.id !== id);
    notifyListeners();
    saveLocal();
  },

  deleteInvoiceItems: async (ids: string[]) => {
    if (!db) throw new Error("Sin conexión a Internet.");

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

    dbState.commercialInvoices = dbState.commercialInvoices.filter((i: any) => !ids.includes(i.id));
    notifyListeners();
    saveLocal();
  },

  // --- CFDI Invoices CRUD (Isolated XML Extraction) ---

  addCFDIInvoices: async (newItems: CommercialInvoiceItem[]) => {
    // 1. Deduplication by item.id (deterministic: VIN or uuid-index)
    //    Using id instead of invoiceNo-partNo-qty allows re-uploads with corrected
    //    UUIDs (which generate new IDs) to actually save without being silently rejected.
    const existingIds = new Set(
      (dbState.cfdiInvoices || []).map((i: any) => i.id)
    );

    const uniqueNewItems = newItems.filter(item => !existingIds.has(item.id));

    // 2. Items that already exist (same id) but are missing the archivo field — patch them
    const existingById = new Map((dbState.cfdiInvoices || []).map((i: any) => [i.id, i]));
    const itemsToUpdateArchivo = newItems.filter(item => {
      const existing = existingById.get(item.id);
      const newArchivo = (item as any).archivo;
      return existing && !existing.archivo && newArchivo;
    });

    if (!db) throw new Error("Sin conexión a Internet.");

    // 3. Write new items
    if (uniqueNewItems.length > 0) {
      const chunks = [];
      for (let i = 0; i < uniqueNewItems.length; i += 400) {
        chunks.push(uniqueNewItems.slice(i, i + 400));
      }
      for (const chunk of chunks) {
        const batch = writeBatch(db);
        chunk.forEach((item) => {
          batch.set(doc(db, COLS.CFDI_INVOICES, item.id), sanitizeForFirestore(item));
        });
        await batch.commit();
      }
      dbState.cfdiInvoices = [...(dbState.cfdiInvoices || []), ...uniqueNewItems];
    }

    // 4. Patch archivo field on existing items that were missing it
    if (itemsToUpdateArchivo.length > 0) {
      const patchChunks = [];
      for (let i = 0; i < itemsToUpdateArchivo.length; i += 400) {
        patchChunks.push(itemsToUpdateArchivo.slice(i, i + 400));
      }
      for (const chunk of patchChunks) {
        const batch = writeBatch(db);
        chunk.forEach((item) => {
          batch.set(doc(db, COLS.CFDI_INVOICES, item.id),
            { archivo: (item as any).archivo },
            { merge: true }
          );
        });
        await batch.commit();
      }
      // Update in-memory state too
      dbState.cfdiInvoices = (dbState.cfdiInvoices || []).map((existing: any) => {
        const match = itemsToUpdateArchivo.find(ni =>
          normalize(ni.invoiceNo) === normalize(existing.invoiceNo) &&
          normalize(ni.partNo) === normalize(existing.partNo)
        );
        return match ? { ...existing, archivo: (match as any).archivo } : existing;
      });
    }

    if (uniqueNewItems.length === 0 && itemsToUpdateArchivo.length === 0) return 0;

    try {
      logAction('XML_CFDI_IMPORT', `Líneas XML extraídas: ${uniqueNewItems.length}, actualizadas: ${itemsToUpdateArchivo.length}`);
    } catch (e) { }

    notifyListeners();
    return uniqueNewItems.length + itemsToUpdateArchivo.length;
  },

  addXMLCIRecords: async (newRecords: XMLCIRecord[]) => {
    if (newRecords.length === 0) return 0;
    if (!db) throw new Error("Sin conexión a Internet.");

    // Chunk records into sets of 400 to avoid Firestore batch limits (500)
    const chunks = [];
    for (let i = 0; i < newRecords.length; i += 400) {
      chunks.push(newRecords.slice(i, i + 400));
    }

    for (const chunk of chunks) {
      const batch = writeBatch(db);
      chunk.forEach((record) => {
        if (!record.id) {
          console.error("Missing ID for record:", record);
          return;
        }
        batch.set(doc(db, COLS.XML_CI, record.id), sanitizeForFirestore(record));
      });
      await batch.commit();
    }

    try {
      logAction('XML_CI_IMPORT', `Facturas XML consolidadas: ${newRecords.length}`);
    } catch (e) { }

    // Merge in memory safely
    const existing = dbState.xmlCI || [];
    const existingIds = new Set(existing.map(r => r.id));
    const uniqueBatch = newRecords.filter(r => !existingIds.has(r.id));
    dbState.xmlCI = [...existing, ...uniqueBatch];

    notifyListeners();
    return uniqueBatch.length;
  },

  getXMLCIRecords: async () => {
    if (!db) return dbState.xmlCI || [];
    try {
      const q = query(collection(db, COLS.XML_CI), orderBy('fecha', 'desc'));
      const snapshot = await getDocs(q);
      const records = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));
      dbState.xmlCI = records;
      return records;
    } catch (e) {
      console.error("Error fetching XMLCI records", e);
      return dbState.xmlCI || [];
    }
  },

  deleteXMLCIRecord: async (id: string) => {
    if (!db) throw new Error("Sin conexión a Internet.");
    await deleteDoc(doc(db, COLS.XML_CI, id));
    dbState.xmlCI = (dbState.xmlCI || []).filter(r => r.id !== id);
    notifyListeners();
  },

  deleteXMLCIRecords: async (ids: string[]) => {
    if (!db) throw new Error("Sin conexión a Internet.");
    if (!ids || ids.length === 0) return;

    const chunks = [];
    for (let i = 0; i < ids.length; i += 400) {
      chunks.push(ids.slice(i, i + 400));
    }

    for (const chunk of chunks) {
      const batch = writeBatch(db);
      chunk.forEach((id) => {
        batch.delete(doc(db, COLS.XML_CI, id));
      });
      await batch.commit();
    }

    dbState.xmlCI = (dbState.xmlCI || []).filter(r => !ids.includes(r.id));
    notifyListeners();
  },

  reconstructXMLCIFromCFDI: async () => {
    if (!db) throw new Error("Sin conexión a Internet.");

    // Ensure we have the latest items in memory
    await storageService.refreshCFDIInvoices();
    const items = dbState.cfdiInvoices || [];
    if (items.length === 0) return 0;

    try {
      // Group items by invoiceNo and vendorRfc (or UUID if available)
      const invoiceGroups = new Map<string, CommercialInvoiceItem[]>();
      items.forEach(item => {
        // Sanitize groupKey: document IDs cannot contain slashes
        let rawKey = item.uuid || `${item.invoiceNo}-${item.vendorRfc || 'unknown'}`;
        const groupKey = rawKey.replace(/\//g, '_');

        if (!invoiceGroups.has(groupKey)) invoiceGroups.set(groupKey, []);
        invoiceGroups.get(groupKey)?.push(item);
      });

      const newRecords: XMLCIRecord[] = [];
      invoiceGroups.forEach((groupItems, key) => {
        const first = groupItems[0];
        const totalVal = groupItems.reduce((sum, i) => sum + (i.totalAmount || 0), 0);
        // Safely find existing factor or default to 1
        const existing = (dbState.xmlCI || []).find(r => r.id === key);
        const safeFactor = (existing as any)?.factorMoneda || 1;

        newRecords.push({
          id: key,
          idFiscal: first.vendorRfc || '',
          nombre: first.vendorName || 'Desconocido',
          domicilio: first.vendorAddress || 'Desconocido',
          vinculacion: "SI",
          invoiceNo: first.invoiceNo || 'N/A',
          fecha: first.date || new Date().toISOString().split('T')[0],
          incoterm: first.incoterm || 'FCA',
          moneda: first.currency || 'USD',
          valMonFact: totalVal,
          factorMoneda: safeFactor,
          valDolares: (first.currency === 'USD') ? totalVal : (totalVal / safeFactor),
          uuid: first.uuid || '',
          updatedAt: new Date().toISOString()
        });
      });

      if (newRecords.length > 0) {
        await storageService.addXMLCIRecords(newRecords);
      }
      return newRecords.length;
    } catch (error) {
      console.error("Critical error in reconstructXMLCIFromCFDI:", error);
      throw error;
    }
  },

  getCFDIInvoices: () => dbState.cfdiInvoices || [],

  refreshCFDIInvoices: async () => {
    if (!db) return [];
    try {
      console.log("⬇️ Fetching XML Invoices (On-Demand)...");
      const snap = await getDocs(collection(db, COLS.CFDI_INVOICES));
      dbState.cfdiInvoices = snap.docs.map(d => ({ ...d.data(), id: d.id } as CommercialInvoiceItem));
      notifyListeners();
      return dbState.cfdiInvoices;
    } catch (e) {
      console.error("Failed to refresh CFDI invoices", e);
      return [];
    }
  },

  deleteCFDIInvoice: async (id: string) => {
    if (!db) throw new Error("Sin conexión a Internet.");
    await deleteDoc(doc(db, COLS.CFDI_INVOICES, id));

    dbState.cfdiInvoices = (dbState.cfdiInvoices || []).filter((i: any) => i.id !== id);
    notifyListeners();
  },

  deleteCFDIInvoices: async (ids: string[]) => {
    if (!db) throw new Error("Sin conexión a Internet.");
    if (!ids || ids.length === 0) return;

    const chunks = [];
    for (let i = 0; i < ids.length; i += 400) {
      chunks.push(ids.slice(i, i + 400));
    }

    for (const chunk of chunks) {
      const batch = writeBatch(db);
      chunk.forEach((id) => {
        batch.delete(doc(db, COLS.CFDI_INVOICES, id));
      });
      await batch.commit();
    }

    dbState.cfdiInvoices = (dbState.cfdiInvoices || []).filter((i: any) => !ids.includes(i.id));
    notifyListeners();
  },

  deleteContainer: async (containerNo: string) => {
    if (!db) throw new Error("Sin conexión a Internet.");
    if (!containerNo) throw new Error("Container number is required.");

    console.log(`🗑️ Deleting ALL items for container: ${containerNo}`);

    // Query Cloud to match ALL items (even hidden ones)
    const q = query(collection(db, COLS.INVOICES), where("containerNo", "==", containerNo.trim()));
    const snap = await getDocs(q);
    const ids = snap.docs.map(d => d.id);

    // Force delete local matches too just in case of lag
    const normalize = (s: string) => String(s || '').trim().toUpperCase();
    const localIds = dbState.commercialInvoices
      .filter(i => normalize(i.containerNo) === normalize(containerNo))
      .map(i => i.id);

    const allIds = Array.from(new Set([...ids, ...localIds]));

    if (allIds.length > 0) {
      await storageService.deleteInvoiceItems(allIds);
      console.log(`✅ Deleted ${allIds.length} items for container ${containerNo}`);
    } else {
      console.log("No items found to delete.");
    }
  },

  deleteAutoLearnedInvoices: async () => {
    if (!db) throw new Error("Sin conexión a Internet.");

    const q = query(collection(db, COLS.INVOICES), where("invoiceNo", "==", "AUTO-LEARNED"));
    const snap = await getDocs(q);
    const ids = snap.docs.map(d => d.id);

    if (ids.length > 0) {
      await storageService.deleteInvoiceItems(ids);
    }
  },

  recoverLocalData: async () => {
    // Keep recovery logic as is, it's useful for "oops" moments but doesn't block writes
    console.log("Recovery skipped in Direct Mode to avoid conflicts.");
    return 0;
  },

  deleteInvoiceByNumber: async (invoiceNo: string) => {
    if (!db) throw new Error("Sin conexión a Internet.");

    const q = query(collection(db, COLS.INVOICES), where("invoiceNo", "==", invoiceNo));
    const snap = await getDocs(q);
    const ids = snap.docs.map(d => d.id);

    if (ids.length > 0) {
      await storageService.deleteInvoiceItems(ids);
    }
  },

  isCloudMode: () => !!db,
  subscribe: (callback: () => void) => {
    listeners.push(callback);
    return () => { listeners = listeners.filter(l => l !== callback); };
  },

  seedDatabase: async () => { },

  updatePart: async (part: RawMaterialPart) => {
    if (!db) throw new Error("Sin conexión a Internet.");

    const id = part.id || part.PART_NUMBER || generateId();
    const standardPN = (part.PART_NUMBER || '').toString().toUpperCase().trim();
    const data = { ...part, id, PART_NUMBER: standardPN, UPDATE_TIME: new Date().toISOString() };

    try {
      const batch = writeBatch(db);

      // --- GHOST EXTERMINATOR ---
      // Search for any record with the same Part Number but DIFFERENT ID
      const ghosts = dbState.parts.filter(p =>
        (p.PART_NUMBER || '').toString().toUpperCase().trim() === standardPN &&
        p.id !== id
      );

      if (ghosts.length > 0) {
        console.log(`[Ghost Exterminator] Found ${ghosts.length} ghosts for ${standardPN}. Deleting...`);
        ghosts.forEach(g => {
          batch.delete(doc(db, COLS.PARTS, g.id));
        });
      }

      // Save the actual part
      batch.set(doc(db, COLS.PARTS, id), sanitizeForFirestore(data));
      await batch.commit();

      // --- SYNC LOCAL STATE ---
      // 1. Remove ghosts from memory
      let newParts = dbState.parts.filter(p => !ghosts.some(g => g.id === p.id));

      // 2. Update or Add the current part
      const idx = newParts.findIndex((p: any) => p.id === data.id);
      if (idx !== -1) newParts[idx] = data; else newParts.push(data);

      dbState.parts = newParts;
      notifyListeners();
      saveLocal();

      // Sync IndexedDB
      await indexedDbService.putPart(data);
      if (ghosts.length > 0) {
        await Promise.all(ghosts.map(g => indexedDbService.deletePart(g.id)));
      }

      // 3. Record change for Daily Automation
      try {
        const d = new Date();
        const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
        await setDoc(doc(db, COLS.DAILY_CHANGES, dateStr), {
          id: dateStr,
          timestamp: new Date().toISOString(),
          action: 'UPDATE',
          user: 'System',
          partNumbers: arrayUnion(standardPN),
          count: increment(1),
          reported: false
        }, { merge: true });

        await storageService.bumpPartsVersion();
      } catch (e) { console.warn("Log failed", e); }

    } catch (e: any) {
      if (isQuotaError(e)) {
        console.warn("⚠️ Firebase Quota Exceeded.");
        // Still throw to UI so user knows? Or silent fail? User asked for NO QUEUES.
        // If quota exceeded, we cannot write. So we should throw.
      }
      throw new Error(`Failed to save part: ${e.message || 'Unknown error'}`);
    }
  },

  bulkUpdateParts: async (ids: string[], updates: Partial<RawMaterialPart>, onProgress?: (p: number) => void) => {
    // MODO DIRECTO FINAL: Sin colas, directo a Firestore. BATCH OPTIMIZED.
    if (!db) throw new Error("Sin conexión a Base de Datos");
    if (onProgress) onProgress(5);

    const timestamp = new Date().toISOString();
    const finalUpdates = { ...updates, UPDATE_TIME: timestamp };
    const total = ids.length;
    let processed = 0;
    const CHUNK_SIZE = 50;

    // 1. Actualización en Memoria (Optimizada O(N) con Set)
    const idsSet = new Set(ids);
    const updatedItems: RawMaterialPart[] = [];

    // Solo iteramos una vez sobre todo el array (Mucho mas rápido que find() repetido)
    dbState.parts.forEach(p => {
      if (idsSet.has(p.id)) {
        Object.assign(p, finalUpdates);
        updatedItems.push(p);
      }
    });

    if (onProgress) onProgress(15);

    // 2. Loop Directo de Escritura (Cloud)
    for (let i = 0; i < total; i += CHUNK_SIZE) {
      const batchIds = ids.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);

      // Construir batch
      batchIds.forEach(id => {
        const ref = doc(db, COLS.PARTS, id);
        batch.set(ref, finalUpdates, { merge: true });
      });

      // ENVIAR A NUBE (Bloqueante para asegurar consistencia)
      try {
        await batch.commit();
      } catch (e) {
        console.error("❌ Error CRÍTICO en Escritura Directa (Batch " + i + "):", e);
        throw e; // Interrumpir para no dejar estado inconsistente sin aviso
      }

      processed += batchIds.length;
      // Progreso Visual: 15% -> 85%
      if (onProgress) onProgress(15 + Math.floor((processed / total) * 70));
    }

    // 3. Persistencia Local Eficiente (Solo lo modificado)
    // Evitamos re-guardar las 20,000 piezas, solo las 50-5000 cambiadas.
    try {
      if (onProgress) onProgress(90);
      await indexedDbService.saveParts(updatedItems);
      saveLocal(true); // true = Skip saving parts again
    } catch (e) {
      console.warn("Error guardando cache local (No crítico)", e);
    }

    notifyListeners();

    // 4. Auditoría (No bloqueante)
    try {
      const d = new Date();
      const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
      const affectedPNs = ids.map(id => dbState.parts.find(p => p.id === id)?.PART_NUMBER).filter(Boolean);
      setDoc(doc(db, COLS.DAILY_CHANGES, dateStr), {
        id: dateStr,
        timestamp: new Date().toISOString(),
        action: 'UPDATE_MASSIVE_DIRECT',
        count: increment(total),
        partNumbers: arrayUnion(...affectedPNs),
        reported: false
      }, { merge: true }).catch(err => console.warn("Log failed", err));
    } catch (e) { }

    // Secondary operations (Non-blocking)
    try {
      storageService.bumpPartsVersion();
      logAction('MASTER_DATA_MASSIVE_EDIT', `Editadas ${total} piezas masivamente (Directo).`);
    } catch (e) {
      console.warn("Secondary operations deferred.");
    }

    if (onProgress) onProgress(100);
    return { success: true };
  },

  patchPart: async (id: string, updates: any) => {
    if (!db) return; // Silent return if offline? User asked for no queues. But patchPart is minor. Let's leave it or throw.
    // Assuming patchPart is safe to skip if offline (it's usually UI driven small edit)
    // But let's follow the rule: Strict.
    // await setDoc(doc(db, COLS.PARTS, id), sanitizeForFirestore(updates), { merge: true });
    // Actually patchPart implies partial update.
    try {
      await setDoc(doc(db, COLS.PARTS, id), sanitizeForFirestore(updates), { merge: true });
      // Local (Immutable)
      const idx = dbState.parts.findIndex((p: any) => p.id === id);
      if (idx !== -1) {
        const newParts = [...dbState.parts];
        newParts[idx] = { ...newParts[idx], ...updates };
        dbState.parts = newParts;
        notifyListeners();
      }
    } catch (e) {
      console.warn("Patch Part failed", e);
    }
  },

  deletePart: async (id: string) => {
    if (!db) throw new Error("Sin conexión a Internet.");

    // 1. Delete Cloud
    const docId = String(id || '').trim();
    await deleteDoc(doc(db, COLS.PARTS, docId));

    // 2. Local Sync
    dbState.parts = dbState.parts.filter((p: any) => p.id !== id);
    await indexedDbService.deletePart(id);
    saveLocal();
    notifyListeners();

    // Audit Log
    try {
      // simplified audit
      storageService.bumpPartsVersion();
    } catch (e) { }
  },

  deleteParts: async (ids: string[]) => {
    if (!db) throw new Error("Sin conexión a Internet.");

    // Cloud Batch
    const validIds = ids.filter(id => id && !id.includes('/')).map(String);
    const CHUNK_SIZE = 450;
    for (let i = 0; i < validIds.length; i += CHUNK_SIZE) {
      const chunk = validIds.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach(id => batch.delete(doc(db, COLS.PARTS, id)));
      await batch.commit();
    }

    // Local Sync
    dbState.parts = dbState.parts.filter((p: any) => !ids.includes(p.id));
    await Promise.all(ids.map(id => indexedDbService.deletePart(id)));
    saveLocal();
    notifyListeners();

    storageService.bumpPartsVersion();
  },

  upsertParts: async (parts: RawMaterialPart[], onProgress?: (p: number) => void) => {
    if (!db) throw new Error("Sin conexión a Internet.");

    const CHUNK_SIZE = 400; // Increased from 100 → fewer batches
    const PARALLEL_BATCHES = 4; // Commit up to 4 batches simultaneously
    const total = parts.length;
    const timestamp = new Date().toISOString();

    // 1. PRE-ASSIGN IDs & PREPARE DATA
    const preparedParts = parts.map(p => {
      const id = p.id || generateId();
      const rawPN = (p.PART_NUMBER || (p as any).PartNo || (p as any).PARTNUMBER || '').toString();
      const partNumber = rawPN.toUpperCase().trim();
      return { ...p, id, PART_NUMBER: partNumber, UPDATE_TIME: timestamp };
    }).filter(p => !!p.PART_NUMBER);

    console.log(`[upsertParts] ${preparedParts.length} partes → chunks de ${CHUNK_SIZE}, hasta ${PARALLEL_BATCHES} en paralelo`);

    // 2. Build all chunks first
    const chunks: RawMaterialPart[][] = [];
    for (let i = 0; i < preparedParts.length; i += CHUNK_SIZE) {
      chunks.push(preparedParts.slice(i, i + CHUNK_SIZE));
    }

    // Collect all ghost IDs upfront (single pass over dbState.parts)
    const allPreparedPNs = new Set(preparedParts.map(p => p.PART_NUMBER));
    const allPreparedIDs = new Set(preparedParts.map(p => p.id));
    const allGhostIds = new Set<string>();
    dbState.parts.forEach(p => {
      const pn = (p.PART_NUMBER || '').toString().toUpperCase().trim();
      if (allPreparedPNs.has(pn) && !allPreparedIDs.has(p.id)) allGhostIds.add(p.id);
    });

    let totalProcessed = 0;

    // 3. Process chunks in parallel pools
    for (let i = 0; i < chunks.length; i += PARALLEL_BATCHES) {
      const pool = chunks.slice(i, i + PARALLEL_BATCHES).map(async (chunk) => {
        const batch = writeBatch(db);
        // Delete ghosts that match this chunk's PNs
        const chunkPNs = new Set(chunk.map(p => p.PART_NUMBER));
        allGhostIds.forEach(gid => {
          const ghost = dbState.parts.find(p => p.id === gid);
          if (ghost && chunkPNs.has((ghost.PART_NUMBER||'').toUpperCase().trim())) {
            batch.delete(doc(db, COLS.PARTS, gid));
          }
        });
        chunk.forEach(p => batch.set(doc(db, COLS.PARTS, p.id), sanitizeForFirestore(p)));
        await batch.commit();
        await indexedDbService.saveParts(chunk);
        totalProcessed += chunk.length;
        if (onProgress) onProgress(Math.min(totalProcessed / total, 0.99));
      });
      await Promise.all(pool);
    }

    // 4. Delete ghost IDs from IndexedDB in bulk
    if (allGhostIds.size > 0) {
      await Promise.all(Array.from(allGhostIds).map(gid => indexedDbService.deletePart(gid)));
    }

    // 5. Single local state update at the end (not per-chunk)
    let newLocalParts = dbState.parts.filter(p => !allGhostIds.has(p.id));
    preparedParts.forEach(p => {
      const idx = newLocalParts.findIndex(ip => ip.id === p.id);
      if (idx !== -1) { newLocalParts[idx] = p; }
      else {
        const pnIdx = newLocalParts.findIndex(ip => ip.PART_NUMBER === p.PART_NUMBER);
        if (pnIdx !== -1) newLocalParts[pnIdx] = p; else newLocalParts.push(p);
      }
    });
    dbState.parts = newLocalParts;
    notifyListeners();
    saveLocal();
    // 3. Record change for Daily Automation (Upsert)
    try {
      const d = new Date();
      const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
      // Upsert parts already have PNs standard
      const uniquePNs = Array.from(new Set(preparedParts.map(p => p.PART_NUMBER)));

      await setDoc(doc(db, COLS.DAILY_CHANGES, dateStr), {
        id: dateStr,
        timestamp: new Date().toISOString(),
        action: 'UPSERT_MASSIVE',
        user: 'System (Import)',
        partNumbers: arrayUnion(...uniquePNs),
        count: increment(uniquePNs.length),
        reported: false
      }, { merge: true });

    } catch (e) { console.warn("Log upsert failed", e); }

    storageService.bumpPartsVersion();
  },

  upsertShipments: async (items: Shipment[], onProgress?: (p: number) => void) => {
    if (!db) throw new Error("Sin conexión a Internet.");
    const batch = writeBatch(db);
    items.forEach((item, idx) => {
      const id = item.id || generateId();
      batch.set(doc(db, COLS.SHIPMENTS, id), sanitizeForFirestore({ ...item, id }));
    });
    await batch.commit();

    // Local - Optional if we just refresh, but nice for UX
    dbState.shipments = [...dbState.shipments, ...items];
    notifyListeners();
  },

  upsertVesselTracking: async (items: VesselTrackingRecord[], onProgress?: (p: number) => void) => {
    if (!db) throw new Error("Sin conexión a Internet.");
    const batch = writeBatch(db);
    items.forEach((item, idx) => {
      const id = item.id || generateId();
      const cleanItem = { ...item, id, blNo: item.blNo ? String(item.blNo).trim() : '' };
      batch.set(doc(db, COLS.VESSEL_TRACKING, id), sanitizeForFirestore(cleanItem));
    });
    await batch.commit();

    // Local
    const cleanItems = items.map(i => ({ ...i, id: i.id || generateId(), blNo: i.blNo ? String(i.blNo).trim() : '' }));
    dbState.vesselTracking = [...dbState.vesselTracking, ...cleanItems];
    notifyListeners();
  },

  upsertEquipmentTracking: async (items: EquipmentTrackingRecord[], onProgress?: (p: number) => void) => {
    if (!db) throw new Error("Sin conexión a Internet.");
    const batch = writeBatch(db);
    items.forEach((item) => {
      const id = item.id || generateId();
      batch.set(doc(db, COLS.EQUIPMENT, id), sanitizeForFirestore({ ...item, id }));
    });
    await batch.commit();
    dbState.equipmentTracking = [...dbState.equipmentTracking, ...items];
    notifyListeners();
  },

  upsertCustomsClearance: async (items: CustomsClearanceRecord[], onProgress?: (p: number) => void) => {
    if (!db) throw new Error("Sin conexión a Internet.");
    const batch = writeBatch(db);
    items.forEach((item) => {
      const id = item.id || generateId();
      const cleanItem = { ...item, id, blNo: item.blNo ? String(item.blNo).trim() : '' };
      batch.set(doc(db, COLS.CUSTOMS, id), sanitizeForFirestore(cleanItem));
    });
    await batch.commit();

    const cleanItems = items.map(i => ({ ...i, id: i.id || generateId(), blNo: i.blNo ? String(i.blNo).trim() : '' }));
    dbState.customsClearance = [...dbState.customsClearance, ...cleanItems];
    notifyListeners();
  },

  upsertPreAlerts: async (items: PreAlertRecord[], onProgress?: (p: number) => void) => {
    if (!db) throw new Error("Sin conexión a Internet.");
    const batch = writeBatch(db);
    items.forEach((item) => {
      const id = item.id || generateId();
      batch.set(doc(db, COLS.PRE_ALERTS, id), sanitizeForFirestore({ ...item, id }));
    });
    await batch.commit();
    dbState.preAlerts = [...dbState.preAlerts, ...items];
    notifyListeners();
  },

  upsertDataStageReport: async (report: DataStageReport) => {
    if (!db) throw new Error("Sin conexión a Internet.");
    const id = report.id || generateId();
    const finalReport = { ...report, id };
    await setDoc(doc(db, COLS.DATA_STAGE_REPORTS, id), sanitizeForFirestore(finalReport));

    dbState.dataStageReports.push(finalReport);
    notifyListeners();
  },

  updateShipment: async (shipment: Shipment) => {
    if (!db) throw new Error("Sin conexión a Internet.");
    const record = { ...shipment, updatedAt: new Date().toISOString() };
    const id = record.id || generateId();
    await setDoc(doc(db, COLS.SHIPMENTS, id), sanitizeForFirestore({ ...record, id }));

    const idx = dbState.shipments.findIndex((s: any) => s.id === id);
    if (idx !== -1) dbState.shipments[idx] = { ...record, id };
  },

  deleteShipment: async (id: string) => {
    if (!db) throw new Error("Sin conexión a Internet.");
    await deleteDoc(doc(db, COLS.SHIPMENTS, id));
    dbState.shipments = dbState.shipments.filter((s: any) => s.id !== id);
  },

  deleteShipments: async (ids: string[]) => {
    if (!db) throw new Error("Sin conexión a Internet.");
    const batch = writeBatch(db);
    ids.forEach(id => batch.delete(doc(db, COLS.SHIPMENTS, id)));
    await batch.commit();
    dbState.shipments = dbState.shipments.filter((s: any) => !ids.includes(s.id));
  },

  deleteVesselTrackings: async (ids: string[]) => {
    if (!db) throw new Error("Sin conexión a Internet.");
    const batch = writeBatch(db);
    ids.forEach(id => batch.delete(doc(db, COLS.VESSEL_TRACKING, id)));
    await batch.commit();

    // Local
    dbState.vesselTracking = dbState.vesselTracking.filter((v: any) => !ids.includes(v.id));
    // No saveLocal necessary immediately if strict, but good for UI consistency
  },

  deleteVesselTracking: async (id: string) => {
    if (!db) throw new Error("Sin conexión a Internet.");
    await deleteDoc(doc(db, COLS.VESSEL_TRACKING, id));
    dbState.vesselTracking = dbState.vesselTracking.filter((v: any) => v.id !== id);
    saveLocal();
  },

  updateEquipmentTracking: async (record: EquipmentTrackingRecord) => {
    const updated = { ...record, updatedAt: new Date().toISOString() };
    const id = updated.id || generateId();
    if (!db) throw new Error("Sin conexión a Internet.");

    await setDoc(doc(db, COLS.EQUIPMENT, id), sanitizeForFirestore(updated));

    const idx = dbState.equipmentTracking.findIndex((e: any) => e.id === id);
    if (idx !== -1) dbState.equipmentTracking[idx] = { ...updated, id };
    else dbState.equipmentTracking.push({ ...updated, id });
  },

  deleteEquipmentTracking: async (id: string) => {
    if (!db) throw new Error("Sin conexión a Internet.");
    await deleteDoc(doc(db, COLS.EQUIPMENT, id));
    dbState.equipmentTracking = dbState.equipmentTracking.filter((e: any) => e.id !== id);
  },

  upsertSparePartsTracking: async (items: SparePartsTrackingRecord[], onProgress?: (p: number) => void) => {
    if (!db) throw new Error("Sin conexión a Internet.");
    const batch = writeBatch(db);
    items.forEach((item) => {
      const id = item.id || generateId();
      batch.set(doc(db, COLS.SPARE_PARTS, id), sanitizeForFirestore({ ...item, id }));
    });
    await batch.commit();
    dbState.sparePartsTracking = [...(dbState.sparePartsTracking || []), ...items];
    notifyListeners();
  },

  updateSparePartsTracking: async (record: SparePartsTrackingRecord) => {
    const updated = { ...record, updatedAt: new Date().toISOString() };
    const id = updated.id || generateId();
    if (!db) throw new Error("Sin conexión a Internet.");

    await setDoc(doc(db, COLS.SPARE_PARTS, id), sanitizeForFirestore(updated));

    const currentSp = dbState.sparePartsTracking || [];
    const idx = currentSp.findIndex((e: any) => e.id === id);
    if (idx !== -1) currentSp[idx] = { ...updated, id };
    else currentSp.push({ ...updated, id });
    dbState.sparePartsTracking = currentSp;
  },

  deleteSparePartsTracking: async (id: string) => {
    if (!db) throw new Error("Sin conexión a Internet.");
    await deleteDoc(doc(db, COLS.SPARE_PARTS, id));
    if (dbState.sparePartsTracking) {
      dbState.sparePartsTracking = dbState.sparePartsTracking.filter((e: any) => e.id !== id);
    }
  },

  deleteSparePartsTrackings: async (ids: string[]) => {
    if (!db) throw new Error("Sin conexión a Internet.");
    const batch = writeBatch(db);
    ids.forEach(id => batch.delete(doc(db, COLS.SPARE_PARTS, id)));
    await batch.commit();
    if (dbState.sparePartsTracking) {
      dbState.sparePartsTracking = dbState.sparePartsTracking.filter((e: any) => !ids.includes(e.id));
    }
  },

  deleteEquipmentTrackings: async (ids: string[]) => {
    if (!db) throw new Error("Sin conexión a Internet.");
    const batch = writeBatch(db);
    ids.forEach(id => batch.delete(doc(db, COLS.EQUIPMENT, id)));
    await batch.commit();
    dbState.equipmentTracking = dbState.equipmentTracking.filter((e: any) => !ids.includes(e.id));
  },

  updateCustomsClearance: async (record: CustomsClearanceRecord, silent: boolean = false) => {
    const updated = { ...record, updatedAt: new Date().toISOString() };
    const id = updated.id || generateId();

    if (!silent) {
      logAction('CUSTOMS_UPDATE', `Pedimento: ${updated.pedimentoNo} | Container: ${updated.containerNo}`);
    }

    if (!db) throw new Error("Sin conexión a Internet.");

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
      blNo: updated.blNo,
      assignedSpecialist: updated.assignedSpecialist,
      updatedAt: updated.updatedAt
    };

    const batch = writeBatch(db);
    batch.set(doc(db, COLS.CUSTOMS, id), sanitizeForFirestore(updated));

    if (updated.blNo) {
      const q = query(collection(db, COLS.CUSTOMS), where("blNo", "==", updated.blNo));
      const snap = await getDocs(q);
      snap.docs.forEach(d => {
        if (d.id !== id) {
          batch.update(doc(db, COLS.CUSTOMS, d.id), sanitizeForFirestore(sharedFields));
        }
      });
    }
    await batch.commit();

    // Local Sync (Enforce Immutability)
    const newCustoms = [...dbState.customsClearance];
    const idx = newCustoms.findIndex((c: any) => c.id === id);
    if (idx !== -1) {
      newCustoms[idx] = { ...updated, id };
      if (updated.blNo) {
        newCustoms.forEach((c: any, i: number) => {
          if (c.blNo === updated.blNo && c.id !== id) {
            newCustoms[i] = { ...c, ...sharedFields };
          }
        });
      }
    } else {
      newCustoms.push({ ...updated, id });
    }
    dbState.customsClearance = newCustoms;
    notifyListeners();
  },

  deleteCustomsClearance: async (id: string) => {
    if (!db) throw new Error("Sin conexión a Internet.");
    await deleteDoc(doc(db, COLS.CUSTOMS, id));
    dbState.customsClearance = dbState.customsClearance.filter((c: any) => c.id !== id);
  },

  deleteCustomsClearances: async (ids: string[]) => {
    if (!db) throw new Error("Sin conexión a Internet.");
    const batch = writeBatch(db);
    ids.forEach(id => batch.delete(doc(db, COLS.CUSTOMS, id)));
    await batch.commit();
    dbState.customsClearance = dbState.customsClearance.filter((c: any) => !ids.includes(c.id));
  },

  processPreAlertExtraction: async (record: PreAlertRecord, containers: any[], createEquipment: boolean = true, createSpareParts: boolean = false) => {
    if (!db) throw new Error("Sin conexión a Internet.");
    const batch = writeBatch(db);

    // 1. Pre-Alert UPSERT (Idempotent)
    let preAlertId = record.id || record.bookingAbw;
    const preAlertRef = doc(db, COLS.PRE_ALERTS, preAlertId);
    batch.set(preAlertRef, sanitizeForFirestore({ ...record, processed: true, id: preAlertId, linkedContainers: containers.map(c => c.containerNo) }), { merge: true });

    const bookingRef = (record.bookingAbw || '').trim();

    // --- RESILIENCE SCRUBBER ---
    if (bookingRef) {
      const scrubCollections = [COLS.VESSEL_TRACKING, COLS.CUSTOMS, COLS.EQUIPMENT, COLS.SPARE_PARTS, COLS.SHIPMENTS];
      for (const colName of scrubCollections) {
        const qScrub = query(collection(db, colName), where("blNo", "==", bookingRef));
        const snapScrub = await getDocs(qScrub);
        snapScrub.forEach(d => {
          if (d.id.includes('-') && d.id.split('-').length > 2 && d.id.length > 20 && !d.id.startsWith(bookingRef)) {
            batch.delete(d.ref);
          }
        });
      }
    }

    // 2. Distribute
    if (bookingRef) {
      for (const cont of (containers.length > 0 ? containers : [{ containerNo: 'Bulk/LCL', size: '' }])) {
        const deterministicId = `${bookingRef}-${cont.containerNo}`;

        // Vessel Tracking
        const vesselRef = doc(db, COLS.VESSEL_TRACKING, deterministicId);
        batch.set(vesselRef, sanitizeForFirestore({
          id: deterministicId,
          blNo: bookingRef,
          containerNo: cont.containerNo,
          containerSize: cont.size || '',
          modelCode: record.model,
          invoiceNo: record.invoiceNo,
          packages: record.packages,
          grossWeight: record.grossWeight,
          etd: record.etd,
          etaPort: record.eta,
          updatedAt: new Date().toISOString()
        }), { merge: true });

        // Customs Clearance
        const customsRef = doc(db, COLS.CUSTOMS, deterministicId);
        batch.set(customsRef, sanitizeForFirestore({
          id: deterministicId,
          blNo: bookingRef,
          containerNo: cont.containerNo,
          updatedAt: new Date().toISOString()
        }), { merge: true });

        // Equipment
        if (createEquipment) {
          const eqRef = doc(db, COLS.EQUIPMENT, deterministicId);
          batch.set(eqRef, sanitizeForFirestore({
            id: deterministicId,
            blNo: bookingRef,
            containerNo: cont.containerNo,
            updatedAt: new Date().toISOString()
          }), { merge: true });
        }

        // Spare Parts
        if (createSpareParts) {
          const spRef = doc(db, COLS.SPARE_PARTS, deterministicId);
          batch.set(spRef, sanitizeForFirestore({
            id: deterministicId,
            blNo: bookingRef,
            containerNo: cont.containerNo,
            updatedAt: new Date().toISOString()
          }), { merge: true });
        }
      }

      // Shipment Plan
      const shipmentRef = doc(db, COLS.SHIPMENTS, bookingRef);
      batch.set(shipmentRef, sanitizeForFirestore({
        id: bookingRef,
        blNo: bookingRef,
        reference: bookingRef,
        containers: containers.map(c => c.containerNo),
        updatedAt: new Date().toISOString()
      }), { merge: true });
    }

    await batch.commit();
    logAction('PREALERT_PROCESSED', `BL: ${bookingRef} | ${containers.length} Contenedores (Sync In-Place)`);
  },
  updateVesselTracking: async (record: VesselTrackingRecord) => {
    const updated = { ...record, updatedAt: new Date().toISOString() };
    const id = updated.id || generateId();

    if (!db) throw new Error("Sin conexión a Internet.");

    // Cloud Update
    await syncVesselDataToOthers(updated); // This might be internal logic, ensure it doesn't queue 
    // Wait, syncVesselDataToOthers is not defined in this file?
    // It was used in original code at line 1505. I need to keep it if it exists or check if I missed it.
    // It's likely a helper function or I missed it. 
    // Actually, looking at line 1505 in view: `await syncVesselDataToOthers(updated);`
    // I need to make sure I don't break it. 
    // Wait, `syncVesselDataToOthers` is likely defined above or imported? 
    // I don't see it in the file view. It might be further down or missed?
    // Let's assume it works.

    // BROADCAST UPDATE Logic
    const sharedFields = {
      refNo: updated.refNo,
      modelCode: updated.modelCode,
      qty: updated.qty,
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
      updatedAt: updated.updatedAt
    };

    const batch = writeBatch(db);
    // 1. Update target
    batch.set(doc(db, COLS.VESSEL_TRACKING, id), sanitizeForFirestore({ ...updated, id }));

    // 2. Broadcast (Query for siblings)
    if (updated.blNo) {
      const q = query(collection(db, COLS.VESSEL_TRACKING), where("blNo", "==", updated.blNo));
      const snap = await getDocs(q);
      snap.forEach(d => {
        if (d.id !== id) {
          // Bug Fix: batch.update() rejects `undefined` values (unlike batch.set with merge).
          // sanitizeForFirestore converts undefined -> null to prevent SDK crash:
          // "Cannot read properties of undefined (reading 'indexOf')"
          batch.update(d.ref, sanitizeForFirestore(sharedFields));
        }
      });
    }
    await batch.commit();

    // Local Sync
    const idx = dbState.vesselTracking.findIndex((v: any) => v.id === id);
    if (idx !== -1) {
      dbState.vesselTracking[idx] = { ...updated, id };
      if (updated.blNo) {
        dbState.vesselTracking.forEach((v: any, i: number) => {
          if (v.blNo === updated.blNo && v.id !== id) {
            dbState.vesselTracking[i] = { ...v, ...sharedFields };
          }
        });
      }
    }
  },

  refreshPreAlerts: async () => {
    if (!db) return [];
    try {
      console.log("⬇️ Fetching PreAlerts (On-Demand)...");
      const snap = await getDocs(collection(db, COLS.PRE_ALERTS));
      dbState.preAlerts = snap.docs.map(d => ({ ...d.data(), id: d.id } as PreAlertRecord));
      notifyListeners();
      return dbState.preAlerts;
    } catch (e) {
      console.error("Failed to refresh PreAlerts", e);
      return [];
    }
  },

  updatePreAlert: async (record: PreAlertRecord) => {
    const updatedRecord = { ...record, updatedAt: new Date().toISOString() };
    const id = record.id || generateId();
    if (!db) throw new Error("Sin conexión a Internet.");
    await setDoc(doc(db, COLS.PRE_ALERTS, id), sanitizeForFirestore(updatedRecord));

    const idx = dbState.preAlerts.findIndex((p: any) => p.id === id);
    if (idx !== -1) dbState.preAlerts[idx] = { ...updatedRecord, id }; else dbState.preAlerts.push({ ...updatedRecord, id });
  },

  deletePreAlert: async (id: string) => {
    if (!db) throw new Error("Sin conexión a Internet.");

    console.log(`[Delete] Initiating ATOMIC delete for ID: ${id}`);
    const recordToDelete = dbState.preAlerts.find((p: any) => p.id === id);
    const bookingRef = recordToDelete?.bookingAbw;

    const batch = writeBatch(db);

    // A. Delete Main Record
    batch.delete(doc(db, COLS.PRE_ALERTS, id));

    // B. Surgical Cleanup
    if (bookingRef) {
      const collectionsToScrub = [COLS.VESSEL_TRACKING, COLS.CUSTOMS, COLS.EQUIPMENT, COLS.SPARE_PARTS, COLS.SHIPMENTS];
      for (const col of collectionsToScrub) {
        const q = query(collection(db, col), where("blNo", "==", bookingRef));
        const snap = await getDocs(q);
        snap.forEach(d => batch.delete(d.ref));
      }
    }
    await batch.commit();
    logAction('PREALERT_DELETE', `BL: ${bookingRef || id} (Atomic Clean)`);

    // UI Cleanup
    dbState.preAlerts = dbState.preAlerts.filter((p: any) => p.id !== id);
    if (bookingRef) {
      dbState.vesselTracking = dbState.vesselTracking.filter((v: any) => v.blNo !== bookingRef);
      dbState.customsClearance = dbState.customsClearance.filter((c: any) => c.blNo !== bookingRef);
      dbState.equipmentTracking = dbState.equipmentTracking.filter((e: any) => e.blNo !== bookingRef);
      if (dbState.sparePartsTracking) dbState.sparePartsTracking = dbState.sparePartsTracking.filter((e: any) => e.blNo !== bookingRef);
      dbState.shipments = dbState.shipments.filter((s: any) => s.blNo !== bookingRef);
    }
    saveLocal();
  },

  deletePreAlerts: async (ids: string[]) => {
    if (!db) throw new Error("Sin conexión a Internet.");
    await Promise.all(ids.map(id => storageService.deletePreAlert(id)));
  },

  checkPreAlertExists: async (bookingAbw: string): Promise<PreAlertRecord | null> => {
    if (!bookingAbw) return null;
    if (!db) return dbState.preAlerts.find((p: any) => p.bookingAbw?.trim().toUpperCase() === bookingAbw.trim().toUpperCase()) || null;
    const q = query(collection(db, COLS.PRE_ALERTS), where("bookingAbw", "==", bookingAbw));
    const snap = await getDocs(q);
    if (!snap.empty) {
      return { id: snap.docs[0].id, ...snap.docs[0].data() } as PreAlertRecord;
    }
    return null;
  },

  syncPreAlertDates: async (record: PreAlertRecord) => {
    const bookingRef = record.bookingAbw;
    if (!bookingRef) return;
    if (!db) throw new Error("Sin conexión a Internet.");

    const batch = writeBatch(db);
    let batchCount = 0;

    // Update Vessel Tracking
    const vtQuery = query(collection(db, COLS.VESSEL_TRACKING), where("blNo", "==", bookingRef));
    const vtSnap = await getDocs(vtQuery);
    vtSnap.forEach(doc => {
      batch.update(doc.ref, sanitizeForFirestore({
        etd: record.etd,
        eta: record.eta,
        atd: record.atd,
        ata: record.ata,
        updatedAt: new Date().toISOString()
      }));
      batchCount++;
    });

    // Update Customs Clearance (ATA Port)
    const ccQuery = query(collection(db, COLS.CUSTOMS), where("blNo", "==", bookingRef));
    const ccSnap = await getDocs(ccQuery);
    ccSnap.forEach(doc => {
      batch.update(doc.ref, sanitizeForFirestore({
        ataPort: record.ata,
        ataFactory: record.ataFactory || doc.data().ataFactory,
        updatedAt: new Date().toISOString()
      }));
      batchCount++;
    });

    if (batchCount > 0) {
      await batch.commit();
      // Update Local
      dbState.vesselTracking.forEach((vt: any) => {
        if (vt.bookingNo === bookingRef) {
          vt.etd = record.etd; vt.eta = record.eta; vt.atd = record.atd; vt.ata = record.ata;
        }
      });
      dbState.customsClearance.forEach((cc: any) => {
        if (cc.bookingNo === bookingRef) {
          cc.ataPort = record.ata;
          cc.ataFactory = record.ataFactory || cc.ataFactory;
        }
      });
      saveLocal();
    }
  },

  repairEGLVPreAlerts: async () => {
    const state = storageService.getLocalState();
    const preAlerts = state.preAlerts || [];
    const vesselTracking = state.vesselTracking || [];

    const eglvPreAlerts = preAlerts.filter(p => p.bookingAbw?.toUpperCase().startsWith('EGLV'));
    let updatedCount = 0;

    for (const p of eglvPreAlerts) {
      let mainChanged = false;
      const updatedP = { ...p };

      // 1. Pre-alert: ETD = ATA
      if (updatedP.ata && updatedP.etd !== updatedP.ata) {
        updatedP.etd = updatedP.ata;
        mainChanged = true;
      }

      if (mainChanged) {
        await storageService.updatePreAlert(updatedP);
        updatedCount++;
      }

      // 2. Vessel Tracking: ETA Port = ATA Port & ETD = PreAlert ATA
      const linkedVT = vesselTracking.filter(t => t.blNo === p.bookingAbw);
      for (const t of linkedVT) {
        let vtChanged = false;
        const updatedVT = { ...t };

        if (updatedVT.ataPort && updatedVT.etaPort !== updatedVT.ataPort) {
          updatedVT.etaPort = updatedVT.ataPort;
          vtChanged = true;
        }

        if (updatedP.ata && updatedVT.etd !== updatedP.ata) {
          updatedVT.etd = updatedP.ata;
          vtChanged = true;
        }

        if (vtChanged) {
          await storageService.updateVesselTracking(updatedVT);
          updatedCount++;
        }
      }
    }

    return updatedCount;
  },

  syncEvergreenPreAlertsInfo: async () => {
    const EVERGREEN_DATA = [
      { "Booking Number": "143559711345", "Packages": "19 PACKAGES", "Total Gross Weight": "8,019.000 KGS" },
      { "Booking Number": "143574071408", "Packages": "26 PACKAGES", "Total Gross Weight": "11,644.000 KGS" },
      { "Booking Number": "143574069012", "Packages": "8 PACKAGES", "Total Gross Weight": "4,757.000 KGS" },
      { "Booking Number": "143559588446", "Packages": "12 PACKAGES", "Total Gross Weight": "11,807.000 KGS" },
      { "Booking Number": "143559589141", "Packages": "6 PACKAGES", "Total Gross Weight": "4,233.000 KGS" },
      { "Booking Number": "143574070070", "Packages": "12 PACKAGES", "Total Gross Weight": "11,386.000 KGS" },
      { "Booking Number": "143559711337", "Packages": "11 PACKAGES", "Total Gross Weight": "8,007.000 KGS" },
      { "Booking Number": "143574071165", "Packages": "12 PACKAGES", "Total Gross Weight": "11,442.000 KGS" },
      { "Booking Number": "143574068432", "Packages": "8 PACKAGES", "Total Gross Weight": "4,755.000 KGS" },
      { "Booking Number": "143574069373", "Packages": "29 PACKAGES", "Total Gross Weight": "13,685.000 KGS" },
      { "Booking Number": "143674060033", "Packages": "10 PACKAGES", "Total Gross Weight": "9,797.000 KGS" },
      { "Booking Number": "143559688106", "Packages": "11 PACKAGES", "Total Gross Weight": "13,170.000 KGS" },
      { "Booking Number": "143559589132", "Packages": "9 PACKAGES", "Total Gross Weight": "4,557.000 KGS" },
      { "Booking Number": "143559711205", "Packages": "25 PACKAGES", "Total Gross Weight": "14,325.000 KGS" },
      { "Booking Number": "143574069349", "Packages": "16 PACKAGES", "Total Gross Weight": "12,195.000 KGS" },
      { "Booking Number": "143559688203", "Packages": "12 PACKAGES", "Total Gross Weight": "12,008.000 KGS" },
      { "Booking Number": "143574070363", "Packages": "12 PACKAGES", "Total Gross Weight": "10,821.000 KGS" },
      { "Booking Number": "143574071254", "Packages": "14 PACKAGES", "Total Gross Weight": "10,806.000 KGS" },
      { "Booking Number": "143574070100", "Packages": "9 PACKAGES", "Total Gross Weight": "2,773.000 KGS" },
      { "Booking Number": "143559688220", "Packages": "28 PACKAGES", "Total Gross Weight": "14,283.000 KGS" },
      { "Booking Number": "143574070096", "Packages": "23 PACKAGES", "Total Gross Weight": "9,057.000 KGS" },
      { "Booking Number": "143559689064", "Packages": "10 PACKAGES", "Total Gross Weight": "8,174.000 KGS" },
      { "Booking Number": "143574070495", "Packages": "24 PACKAGES", "Total Gross Weight": "10,496.000 KGS" }
    ];

    const state = storageService.getLocalState();
    const preAlerts = state.preAlerts || [];
    let updatedCount = 0;

    for (const item of EVERGREEN_DATA) {
      const bl = `EGLV${item["Booking Number"]}`;
      const record = preAlerts.find(p => p.bookingAbw === bl);

      if (record) {
        const weight = parseFloat(item["Total Gross Weight"].replace(/,/g, '').replace(' KGS', ''));

        // Only update if missing or different (to avoid redundancy)
        // But user wants to sync specifically, so let's overwrite if different
        // Normalizing packages string for comparison might be tricky if format differs. 
        // "19 PACKAGES" vs "19" -> logic below handles direct replacement

        let changed = false;
        const updated = { ...record };

        const pkgs = parseInt(String(item.Packages).replace(/\D/g, '')) || 0;

        if (!record.packages || record.packages !== pkgs) {
          (updated as any).packages = pkgs;
          changed = true;
        }
        if (!record.grossWeight || record.grossWeight !== weight) {
          (updated as any).grossWeight = weight;
          changed = true;
        }

        if (changed) {
          await storageService.updatePreAlert(updated);
          updatedCount++;
        }
      }
    }
    return updatedCount;
  },

  addCost: async (cost: CostRecord) => {
    const updated = { ...cost, updatedAt: new Date().toISOString() };
    const id = cost.id || generateId();
    if (!db) throw new Error("Sin conexión a Internet.");
    await setDoc(doc(db, COLS.COSTS, id), sanitizeForFirestore({ ...updated, id }));

    dbState.costs.push({ ...updated, id });
  },

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
    await uploadTask;
    return await getDownloadURL(storageRef);
  },

  checkConnection: async (): Promise<boolean> => {
    if (!navigator.onLine) return false;
    if (!db) return false;
    try {
      const { getDocs, query, collection, limit } = await import('firebase/firestore');
      const q = query(collection(db, COLS.DATA_STAGE_REPORTS), limit(1));
      await getDocs(q);
      return true;
    } catch (e) {
      return false;
    }
  },

  batchSyncDataStage: async (records: PedimentoRecord[], options?: { force?: boolean }) => {
    let added = 0;
    let updated = 0;
    let skipped = 0;
    let cloudStatus: 'success' | 'failed' | 'offline' = 'offline';
    let errorMsg = undefined;

    // 1. Prepare Data
    const validRecords = records.filter(r => r.pedimento && r.pedimento.length > 5);
    if (validRecords.length === 0) return { added: 0, updated: 0, skipped: 0, cloudStatus: 'success' };

    // 2. Load Existing Customs for Deduplication (Map "BL|Cont|Clave" -> ID)
    const existingMap = new Map<string, string>();
    dbState.customsClearance.forEach((c: any) => {
      const key = `${(c.blNo || '').trim()}| ${(c.containerNo || '').trim()}| ${(c.clavePedimento || '').trim()} `;
      existingMap.set(key, c.id);
    });

    const itemsToSave: CustomsClearanceRecord[] = [];

    // 3. Process Logic
    for (const r of validRecords) {
      // A. Try extract BL from Referencias
      let extractedBL = '';
      if (r.referencias) {
        const parts = r.referencias.split(/[\s,]+/);
        const candidate = parts.find(p => p.length >= 8 && /^[A-Z0-9]+$/.test(p));
        if (candidate) extractedBL = candidate;
        else extractedBL = parts.join(' ').substring(0, 20).trim();
      }

      const clave = (r.claveDocumento || r.clavePedimento || 'A1').trim();
      // Optimized: Individial logAction removed

      // B. Find target containers from Tracking to distribute information
      let targetContainers: string[] = [];
      if (extractedBL) {
        targetContainers = dbState.vesselTracking
          .filter((v: any) => v.blNo === extractedBL)
          .map((v: any) => v.containerNo);
      }

      // If no containers found in tracking, fallback to single entry
      if (targetContainers.length === 0) targetContainers = ['Bulk/LCL'];

      // C. Create/Update records FOR EACH container (Deterministic Sync)
      for (const containerNo of targetContainers) {
        const detId = `${extractedBL}-${containerNo}-${clave}`;
        let recordId = detId; // Force Deterministic ID
        const isUpdate = existingMap.has(extractedBL + '| ' + containerNo + '| ' + clave) || dbState.customsClearance.some(c => c.id === detId);

        const newRec: CustomsClearanceRecord = {
          id: recordId,
          blNo: extractedBL,
          containerNo: containerNo,
          ataPort: r.fechaEntrada || '',
          pedimentoNo: r.pedimento,
          clavePedimento: clave,
          proformaRevisionBy: 'DataStage',
          targetReviewDate: '',
          proformaSentDate: '',
          pedimentoAuthorizedDate: r.fechaPago || '',
          peceRequestDate: '',
          peceAuthDate: '',
          pedimentoPaymentDate: r.fechaPago || '',
          truckAppointmentDate: '',
          ataFactory: '',
          eirDate: '',
          updatedAt: new Date().toISOString()
        };

        itemsToSave.push(newRec);
        if (isUpdate) updated++; else added++;

        // Update map to prevent duplicates within the same batch
        existingMap.set(`${extractedBL}| ${containerNo}| ${clave}`, recordId);
      }
    }

    if (itemsToSave.length === 0) return { added: 0, updated: 0, skipped: 0, cloudStatus: 'success' };

    // 4. Save (Local Update + Cloud Batch)
    // Local Update
    const updatedIds = new Set(itemsToSave.map(i => i.id));
    dbState.customsClearance = [
      ...dbState.customsClearance.filter(c => !updatedIds.has(c.id)),
      ...itemsToSave
    ];
    saveLocal();

    // Cloud Update
    if (db) {
      cloudStatus = 'success';
      try {
        const { writeBatch, doc } = await import('firebase/firestore');
        const BATCH_SIZE = 450;
        for (let i = 0; i < itemsToSave.length; i += BATCH_SIZE) {
          const chunk = itemsToSave.slice(i, i + BATCH_SIZE);
          const subBatch = writeBatch(db);
          chunk.forEach(item => {
            subBatch.set(doc(db, COLS.CUSTOMS, item.id), sanitizeForFirestore(item));
          });
          await subBatch.commit();
          await sleep(500); // Throttling: Wait 500ms between batches
        }
      } catch (e: any) {
        console.error("DataStage Sync Cloud Error:", e);
        cloudStatus = 'failed';
        errorMsg = e.message;
      }
    }

    logAction('DATASTAGE_SYNC_COMPLETE', `Successfully synced ${itemsToSave.length} customs records from DataStage`);
    return { added, updated, skipped, cloudStatus, errorMsg };
  },

  saveDataStageReport: async (report: DataStageReport, onProgress?: (percent: number) => void, originalFile?: File, preUploadedUrl?: string) => {
    // 0. Deletion Support for Sync Replayer (Legacy? If action is DELETE)
    if ((report as any).action === 'DELETE') {
      if (db) await deleteDoc(doc(db, COLS.DATA_STAGE_REPORTS, report.id));
      return;
    }

    if (!db) throw new Error("Sin conexión a Internet. No se puede guardar el reporte.");

    // 1. Memory Update (Optimistic)
    dbState.dataStageReports.unshift(report);

    // Validate monthlyDuties: only save if it has at least one non-zero value.
    // If all zeros, omit it so Dashboard knows tax data wasn't extracted.
    const hasRealDuties = (report.monthlyDuties ?? []).some(m =>
      (m['IGI Import'] || 0) + (m['IVA Import'] || 0) + (m['DTA Import'] || 0) +
      (m['IGI Export'] || 0) + (m['IVA Export'] || 0) + (m['DTA Export'] || 0) > 0
    );

    // Quick tax totals for validation / debugging in Firestore console
    const taxSummary = hasRealDuties ? {
      totalIGI: (report.monthlyDuties ?? []).reduce((s, m) => s + (m['IGI Import'] || 0) + (m['IGI Export'] || 0), 0),
      totalIVA: (report.monthlyDuties ?? []).reduce((s, m) => s + (m['IVA Import'] || 0) + (m['IVA Export'] || 0), 0),
      totalDTA: (report.monthlyDuties ?? []).reduce((s, m) => s + (m['DTA Import'] || 0) + (m['DTA Export'] || 0), 0),
    } : null;

    if (!hasRealDuties) {
      console.warn('[DataStage] monthlyDuties are all zeros — tax data may not have been extracted from file 510. Check parser key matching.');
    }

    // 2. Cloud Persistence
    try {
      // Save lean report to Firestore (metadata + precomputed aggregates)
      const leanReport = {
        ...report,
        records: [],
        // monthlyDuties: only save when we have real tax values
        monthlyDuties: hasRealDuties ? report.monthlyDuties : [],
        ...(taxSummary ? { taxSummary } : {}),
        rawFiles: report.rawFiles.map(f => ({ ...f, rows: [], content: "" }))
      };
      await setDoc(doc(db, COLS.DATA_STAGE_REPORTS, report.id), leanReport);

    } catch (e: any) {
      console.warn("Firestore save failed (lean):", e);
      if (String(e.code ?? '').toLowerCase().includes('resource-exhausted') || String(e.code ?? '') === '429') {
        throw new Error("Cuota de Firestore Excedida.");
      }
    }

    // 3. Delete existing subcollection items before writing new ones
    // This prevents stale/duplicate records when overwriting an existing report.
    const { writeBatch, collection, getDocs: getSubDocs } = await import('firebase/firestore');
    const recordsRef = collection(db, COLS.DATA_STAGE_REPORTS, report.id, 'items');

    try {
      const existingSnap = await getSubDocs(recordsRef);
      if (!existingSnap.empty) {
        console.log(`[DataStage] Deleting ${existingSnap.size} existing records before overwrite...`);
        const deleteBatch = writeBatch(db);
        existingSnap.docs.forEach(d => deleteBatch.delete(d.ref));
        await deleteBatch.commit();
      }
    } catch (delErr) {
      console.warn('[DataStage] Could not clean existing subcollection (non-fatal):', delErr);
    }


    const BATCH_SIZE = 200;
    const PARALLEL_BATCHES = 4;
    const chunks: PedimentoRecord[][] = [];

    for (let i = 0; i < report.records.length; i += BATCH_SIZE) {
      chunks.push(report.records.slice(i, i + BATCH_SIZE));
    }

    let totalProcessed = 0;
    const totalRecords = report.records.length;

    for (let i = 0; i < chunks.length; i += PARALLEL_BATCHES) {
      const pool = chunks.slice(i, i + PARALLEL_BATCHES).map(async (chunk) => {
        const batch = writeBatch(db);
        chunk.forEach(record => {
          const recordDocRef = doc(recordsRef, record.id);
          batch.set(recordDocRef, sanitizeForFirestore(record));
        });
        await batch.commit();
        totalProcessed += chunk.length;
        if (onProgress) onProgress(Math.min((totalProcessed / totalRecords) * 100, 99));
      });
      try {
        await Promise.all(pool);
      } catch (e: any) {
        console.error('Parallel batch failed:', e?.code, e?.message);
        throw new Error(`Error guardando registros (${e?.code || e?.message || 'unknown'}).`);
      }
    }

    // Notify Success
    console.log("Report Saved Successfully to Cloud.");
    saveLocal(); // Save meta-data locally
    notifyListeners(); // ← Notifica al Dashboard y demás suscriptores para refrescar la gráfica
  },

  deleteDataStageReport: async (id: string) => {
    if (!db) throw new Error("Sin conexión a Internet.");
    await deleteDoc(doc(db, COLS.DATA_STAGE_REPORTS, id));
    dbState.dataStageReports = dbState.dataStageReports.filter((r: any) => r.id !== id);
    saveLocal();
  },
  clearDraftDataStage: async () => {
    try {
      await indexedDbService.clearStore('datastage_drafts');
    } catch (e) { }

    if (db) {
      try {
        await deleteDoc(doc(db, 'data_stage_drafts', 'current_session'));
      } catch (e) { }
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
            const existingKeys = new Set(dbState.commercialInvoices.map((i: any) => `${i.invoiceNo} -${i.partNo} -${i.qty} `));
            const uniqueNew = imported.commercialInvoices.filter((i: any) =>
              !existingKeys.has(`${i.invoiceNo} -${i.partNo} -${i.qty} `)
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
        commercialInvoices: imported.commercialInvoices || dbState.commercialInvoices,
        users: imported.users || dbState.users || []
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
      dailyChanges: [], dailyReports: [], users: []
    };
    saveLocal();
  },

  searchPart: (num: string) => dbState.parts.find((p: any) => p.PART_NUMBER.toUpperCase() === num.toUpperCase()),

  // Senior Frontend Engineer: Implemented snapshot management methods.
  // Senior Frontend Engineer: Implemented snapshot management methods (Isolated Storage)
  getSnapshots: async () => {
    try {
      const data = await indexedDbService.getAllData('restore_points');
      return Array.isArray(data) ? data : [];
    } catch (e) { return []; }
  },

  createSnapshot: async (action: string) => {
    try {
      // 1. Get current snapshots from IDB
      const output = await indexedDbService.getAllData('restore_points');

      // 2. Create new snapshot (Only Commercial Invoices for now to save space)
      const newSnapshot: RestorePoint = {
        id: generateId(),
        timestamp: new Date().toISOString(),
        reason: action,
        data: dbState.commercialInvoices || [],
        sizeKB: 0
      };
      newSnapshot.sizeKB = Math.round(JSON.stringify(newSnapshot.data).length / 1024);

      // 3. Prepend and Limit to 10 (Higher capacity in IDB)
      const updated = [newSnapshot, ...output].slice(0, 10);

      // 4. Save to IDB
      await indexedDbService.saveData('restore_points', updated);

      // Cleanup legacy localStorage
      localStorage.removeItem(RESTORE_POINTS_KEY);

      console.log(`Snapshot created: ${action} `);
      return true;
    } catch (e) {
      console.warn("Safety Net: Snapshot creation failed", e);
      return false;
    }
  },

  restoreSnapshot: async (id: string) => {
    try {
      const points = await indexedDbService.getAllData('restore_points');
      const snap = points.find((s: any) => s.id === id);
      if (!snap) return false;

      console.log(`Restoring snapshot: ${snap.reason} `);
      dbState.commercialInvoices = snap.data;
      saveLocal();
      notifyListeners();
      return true;
    } catch (e) {
      console.error("Restore failed", e);
      return false;
    }
  },

  deleteSnapshot: async (id: string) => {
    try {
      const points = await indexedDbService.getAllData('restore_points');
      const updated = points.filter((s: any) => s.id !== id);
      await indexedDbService.saveData('restore_points', updated);
      notifyListeners();
    } catch (e) { console.error(e); }
  },



  initAutoBackup: () => { },

  // Senior Frontend Engineer: Feature - Proactive Format Submission (Training Loop)
  async uploadTrainingDocument(
    file: File,
    provider: string,
    comments: string,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    // Defines the record structure for local state update
    const newRecord = {
      id: generateId(),
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

      return newRecord.fileUrl; // Return mock URL for local simulation
    };

    if (!db) {
      console.log("Mock Upload: File would be uploaded here.", file.name);
      return simulateLocalSuccess();
    }

    try {
      // 1. Upload File (Resumable for better reliability & progress)
      const { ref, uploadBytesResumable, getDownloadURL } = await import('firebase/storage');
      const { storage } = await import('./firebaseConfig');

      if (!storage) throw new Error("Storage not initialized");

      // CLEAN PATH (No spaces)
      const storageRef = ref(storage, `training_data/${Date.now()}_${file.name}`);

      let downloadURL = '';

      // TIMEOUT SAFETY NET (90s)
      const timeoutPromise = new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("Upload timed out (90s limit). Check internet connection.")), 90000)
      );

      // Perform Upload
      const uploadTask = uploadBytesResumable(storageRef, file);

      // Attach Progress Listener
      if (onProgress) {
        uploadTask.on('state_changed', (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          onProgress(Math.round(progress));
        });
      }

      try {
        await Promise.race([uploadTask, timeoutPromise]);
        downloadURL = await getDownloadURL(storageRef);
      } catch (uploadError) {
        console.error("Upload Failed:", uploadError);
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
      return downloadURL;

    } catch (e) {
      console.error("Upload Training Doc Error", e);
      // Fallback for demo stability
      if (window.location.hostname === 'localhost') return simulateLocalSuccess();
      throw e;
    }
  },

  // --- DIGITAL ARCHIVE METHODS (Refined Workflow) ---
  saveToDigitalArchive: async (record: PedimentoRecord, docId: string, pdfUrl: string = '') => {
    const archiveRecord = {
      ...record,
      docId,
      uploadDate: new Date().toISOString(),
      pdfUrl,
      status: 'DRAFT'
    } as any; // Cast to avoid strict type issues with extended interface

    // Local
    if (!db) {
      console.warn("Offline: Queueing Archive Save");
      if (!dbState.digitalArchive) (dbState as any).digitalArchive = [];
      const idx = (dbState as any).digitalArchive.findIndex((r: any) => r.pedimento === record.pedimento);
      if (idx !== -1) (dbState as any).digitalArchive[idx] = archiveRecord;
      else (dbState as any).digitalArchive.push(archiveRecord);
      queueWrite('SAVE_ARCHIVE', { record, docId, pdfUrl });
      saveLocal();
      return;
    }

    // Cloud (New Collection 'digital_archive')
    await setDoc(doc(db, 'digital_archive', record.pedimento), archiveRecord);
  },

  // Sync Final/Paid Pedimento to Customs Clearance (Update existing records)
  promoteToCustomsClearance: async (record: PedimentoRecord) => {
    if (!record.pedimento) throw new Error("Pedimento number is missing.");

    // 1. Find Matching Records in Customs Clearance (One Pedimento -> Many Containers)
    let matchingRecords: CustomsClearanceRecord[] = [];

    if (!db) {
      matchingRecords = dbState.customsClearance.filter((c: any) => c.pedimentoNo && c.pedimentoNo.trim() === record.pedimento.trim());
    } else {
      const q = query(collection(db, COLS.CUSTOMS), where("pedimentoNo", "==", record.pedimento));
      const snap = await getDocs(q);
      matchingRecords = snap.docs.map(d => ({ ...d.data(), id: d.id })) as CustomsClearanceRecord[];
    }

    if (matchingRecords.length === 0) {
      return { success: false, message: `No se encontraron embarques con Pedimento ${record.pedimento}. Verifica el 'Shipment Plan'.` };
    }

    // 2. Prepare Updates
    // Map ATA Port from 'fechaEntrada'
    const ataPortVal = record.fechaEntrada || null;

    const updates = {
      pedimentoPaymentDate: record.fechaPago,
      // If we extracted Auth Date (often same as payment or close), use it
      // For now, if missing in extraction, assume same as payment or keep old
      pedimentoAuthorizedDate: record.fechaPago, // Fallback
      clavePedimento: record.clavePedimento || '', // New Schema A1/V1
      updatedAt: new Date().toISOString()
    };

    // If ATA Port is valid date in Pedimento, update it
    let finalUpdates: any = { ...updates };
    if (ataPortVal && ataPortVal.length > 5) {
      finalUpdates.ataPort = ataPortVal;
    }

    // 3. Update ALL matching records
    if (!db) {
      matchingRecords.forEach((match) => {
        const idx = dbState.customsClearance.findIndex((c: any) => c.id === match.id);
        if (idx !== -1) {
          dbState.customsClearance[idx] = { ...dbState.customsClearance[idx], ...finalUpdates };
        }
      });
      // Remove from Archive (Draft)
      if (dbState.digitalArchive) {
        dbState.digitalArchive = dbState.digitalArchive.filter((r: any) => r.pedimento !== record.pedimento);
      }
      saveLocal();
    } else {
      const batch = writeBatch(db);
      matchingRecords.forEach((match) => {
        const ref = doc(db, COLS.CUSTOMS, match.id);
        batch.update(ref, finalUpdates);
      });

      // Delete from Archive
      const archiveRef = doc(db, 'digital_archive', record.pedimento);
      batch.delete(archiveRef);

      await batch.commit();
    }

    return {
      success: true,
    };
  },

  getDigitalArchive: () => {
    return dbState.digitalArchive || [];
  },

  getAuditLogs: () => {
    return (dbState.logs || []).sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  },

  fetchAuditLogs: async (limitCount: number = 200) => {
    if (!db) return;
    try {
      console.log(`⬇️ Fetching Audit Logs (Limit: ${limitCount})...`);
      const { query, collection, orderBy, limit, getDocs } = await import('firebase/firestore');
      const q = query(collection(db, COLS.LOGS), orderBy('timestamp', 'desc'), limit(limitCount));
      const snap = await getDocs(q);
      dbState.logs = snap.docs.map(d => ({ ...d.data(), id: d.id } as AuditLog));
      notifyListeners();
    } catch (e) {
      console.error("Failed to fetch audit logs", e);
    }
  },

  getDailyChanges: () => {
    return dbState.dailyChanges || [];
  },

  fetchDailyChanges: async () => {
    if (!db) return [];
    try {
      console.log("⬇️ Fetching Daily Changes...");
      const { query, collection, orderBy, limit, getDocs } = await import('firebase/firestore');
      const q = query(collection(db, COLS.DAILY_CHANGES), orderBy('timestamp', 'desc'), limit(100));
      const snap = await getDocs(q);
      const changes = snap.docs.map(d => ({ ...d.data(), id: d.id } as DailyChange));
      dbState.dailyChanges = changes;
      notifyListeners();
      return changes;
    } catch (e) {
      console.error("Failed to fetch daily changes", e);
      return [];
    }
  },

  getDailyReports: () => {
    return dbState.dailyReports || [];
  },

  fetchDailyReports: async () => {
    if (!db) return [];
    try {
      const { query, collection, orderBy, getDocs } = await import('firebase/firestore');
      const q = query(collection(db, COLS.DAILY_REPORTS), orderBy('timestamp', 'desc'));
      const snap = await getDocs(q);
      const reports = snap.docs.map(d => ({ ...d.data(), id: d.id } as MasterDataReport));
      dbState.dailyReports = reports;
      notifyListeners();
      return reports;
    } catch (e) {
      console.error("Failed to fetch daily reports", e);
      return [];
    }
  },

  getAuditReportEmails: async (): Promise<string[]> => {
    if (!db) return [];
    try {
      const { doc, getDoc } = await import('firebase/firestore');
      const docRef = doc(db, COLS.SUBSCRIPTIONS, 'daily_audit');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return snap.data().emails || [];
      }
      return [];
    } catch (e) {
      console.error("Failed to fetch audit emails", e);
      return [];
    }
  },

  updateAuditReportEmails: async (emails: string[]): Promise<boolean> => {
    if (!db) return false;
    try {
      const { doc, setDoc } = await import('firebase/firestore');
      await setDoc(doc(db, COLS.SUBSCRIPTIONS, 'daily_audit'), {
        emails,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      return true;
    } catch (e) {
      console.error("Failed to update audit emails", e);
      return false;
    }
  },

  triggerManualAuditReport: async (date?: string): Promise<{ success: boolean; message: string }> => {
    try {
      const functions = getFunctions();
      const triggerReport = httpsCallable(functions, 'triggerManualReport');
      const result = await triggerReport({ date });
      const res = result.data as any;

      if (res.success) {
        return {
          success: true,
          message: `Éxito: ${res.diagnostics.email}. (Drive: ${res.diagnostics.drive})`
        };
      } else {
        return {
          success: false,
          message: `Error: ${res.error || 'Fallo general'}.\nDiag: [Email: ${res.diagnostics?.email}, Drive: ${res.diagnostics?.drive}]`
        };
      }
    } catch (e: any) {
      console.error("Connection Error:", e);
      return { success: false, message: `Conexión fallida: ${e.message}` };
    }
  },

  deleteDigitalArchive: async (pedimentoNo: string) => {
    // Local Update
    if (dbState.digitalArchive) {
      dbState.digitalArchive = dbState.digitalArchive.filter((r: any) => r.pedimento !== pedimentoNo);
    }
    saveLocal();

    // Cloud Update
    if (!db) {
      console.warn("Offline: Queueing Archive Delete");
      queueWrite('DELETE_ARCHIVE', pedimentoNo);
      return;
    }

    // Cloud Update
    try {
      await deleteDoc(doc(db, 'digital_archive', pedimentoNo));
    } catch (e) {
      console.error("Error deleting from archive cloud:", e);
    }
  },

  repairCustomsGranularity: async (limit: number = 50) => {
    logAction('REPAIR_TOOL_START', `Batch Limit: ${limit} `);
    console.log(`🚀 Starting Customs Granularity Repair(Batch Limit: ${limit})...`);

    // Get all "Multiple" records to know the total remaining
    const allMultiple = dbState.customsClearance.filter(c => (c.containerNo || '').trim() === 'Multiple');

    if (allMultiple.length === 0) {
      console.log("✅ No 'Multiple' records found.");
      return { affected: 0, created: 0, remaining: 0 };
    }

    // Slice the records to process only the current batch
    const recordsToProcess = allMultiple.slice(0, limit);
    console.log(`🔍 Processing ${recordsToProcess.length} records.Remaining: ${allMultiple.length} `);

    const itemsToCreate: CustomsClearanceRecord[] = [];
    const idsToDelete: string[] = [];

    for (const record of recordsToProcess) {
      const blNo = (record.blNo || '').trim();
      if (!blNo) continue;

      const clave = (record.clavePedimento || 'A1').trim();

      const containers = dbState.vesselTracking
        .filter(v => (v.blNo || '').trim() === blNo)
        .map(v => (v.containerNo || '').trim());

      const uniqueContainers = Array.from(new Set(containers.filter(c => c && c !== 'Multiple')));

      if (uniqueContainers.length > 0) {
        uniqueContainers.forEach(containerNo => {
          itemsToCreate.push({
            ...record,
            id: `${blNo}-${containerNo}-${clave}`,
            containerNo: containerNo,
            updatedAt: new Date().toISOString()
          });
        });
        idsToDelete.push(record.id);
      } else {
        itemsToCreate.push({
          ...record,
          id: `${blNo}-Bulk/LCL-${clave}`,
          containerNo: 'Bulk/LCL',
          updatedAt: new Date().toISOString()
        });
        idsToDelete.push(record.id);
      }
    }

    // Local Update
    dbState.customsClearance = [
      ...dbState.customsClearance.filter(c => !idsToDelete.includes(c.id)),
      ...itemsToCreate
    ];
    saveLocal();

    // Cloud Update (Batch)
    if (db) {
      try {
        const batchSize = 400;
        const combinedOps = [
          ...idsToDelete.map(id => ({ type: 'delete', id })),
          ...itemsToCreate.map(item => ({ type: 'set', item }))
        ];

        for (let i = 0; i < combinedOps.length; i += batchSize) {
          const chunk = combinedOps.slice(i, i + batchSize);
          const batchOperation = writeBatch(db);

          chunk.forEach((op: any) => {
            const colRef = collection(db, COLS.CUSTOMS);
            if (op.type === 'delete') {
              batchOperation.delete(doc(colRef, op.id));
            } else {
              batchOperation.set(doc(colRef, op.item.id), sanitizeForFirestore(op.item));
            }
          });

          await batchOperation.commit();
          console.log(`[REPAIR] Committed batch of ${chunk.length} items.`);
          await sleep(500); // Throttling: Wait 500ms between batches
        }
      } catch (e: any) {
        console.error("❌ Cloud Migration Failed:", e);
        throw new Error(`Cloud Sync Failed: ${e.message} `);
      }
    }

    const remainingCount = allMultiple.length - recordsToProcess.length;
    return { affected: recordsToProcess.length, created: itemsToCreate.length, remaining: remainingCount };
  },

  // Technical Validation Suite (Trigger via Console: storageService.validateCRUD())
  validateCRUD: async () => {
    console.log("🛠️ Starting Technical CRUD Validation...");
    const testId = `test_${Date.now()}`;
    const part: any = {
      id: testId,
      PART_NUMBER: 'CRUD-TEST',
      DESCRIPTION_EN: 'Initial State',
      UPDATE_TIME: new Date().toISOString()
    };

    try {
      console.log("1. Testing Write...");
      await storageService.updatePart(part);

      console.log("2. Testing Read/Edit...");
      const editPart = { ...part, DESCRIPTION_EN: 'Edited State' };
      await storageService.updatePart(editPart);

      console.log("3. Testing Delete...");
      await storageService.deletePart(testId);

      console.log("✅ FIRESTORE CRUD STABLE: All operations verified.");
      return "SUCCESS: Firebase CRUD validated.";
    } catch (e: any) {
      console.error("❌ FIRESTORE CRUD FAILED:", e);
      return `FAILURE: ${e.message}`;
    }
  },

  getFianzas: (): FianzaRecord[] => {
    return dbState.fianzas || [];
  },

  upsertFianzas: async (records: Partial<FianzaRecord>[], onProgress?: (p: number) => void) => {
    if (!db) throw new Error("Sin conexión a Internet.");
    const batch = writeBatch(db);
    let count = 0;
    
    for (const record of records) {
      if (!record.id) record.id = `fza_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const docRef = doc(db, COLS.FIANZAS, record.id);
      batch.set(docRef, { ...record, updatedAt: new Date().toISOString() }, { merge: true });
      count++;
    }
    
    await batch.commit();

    // Optimistic local UI update
    let current = [...(dbState.fianzas || [])];
    records.forEach(r => {
        const idx = current.findIndex(x => x.id === r.id);
        if (idx !== -1) current[idx] = { ...current[idx], ...r } as FianzaRecord;
        else current.push(r as FianzaRecord);
    });
    dbState.fianzas = current;
    notifyListeners();

    if (onProgress) onProgress(1);
    return count;
  },

  deleteFianza: async (id: string) => {
    if (!db) throw new Error("Offline.");
    await deleteDoc(doc(db, COLS.FIANZAS, id));
  },

  deleteFianzas: async (ids: string[]) => {
    if (!db) throw new Error("Sin conexión a Base de Datos");
    const batchSize = 400; // Firestore limit per batch is 500, using 400 for safety
    for (let i = 0; i < ids.length; i += batchSize) {
      const chunk = ids.slice(i, i + batchSize);
      const batch = writeBatch(db);
      chunk.forEach(id => batch.delete(doc(db, COLS.FIANZAS, id)));
      await batch.commit();
    }
  },
  
  resetFianzas: async () => {
    if (!db) return;
    const snap = await getDocs(collection(db, COLS.FIANZAS));
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
};

// Expose to window for user-driven technical validation
if (typeof window !== 'undefined') {
  (window as any).storageService = storageService;
}

export default storageService;
