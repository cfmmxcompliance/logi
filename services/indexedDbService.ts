import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'LogiMasterDB';
const DB_VERSION = 3;
const STORE_NAME = 'master_data';

export const indexedDbService = {
    db: null as IDBPDatabase | null,

    init: async () => {
        if (indexedDbService.db) return;
        try {
            indexedDbService.db = await openDB(DB_NAME, DB_VERSION, {
                upgrade(db) {
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    }
                    if (!db.objectStoreNames.contains('invoices')) {
                        db.createObjectStore('invoices', { keyPath: 'id' });
                    }
                    if (!db.objectStoreNames.contains('logs')) {
                        db.createObjectStore('logs', { keyPath: 'id' });
                    }
                    if (!db.objectStoreNames.contains('sync_queue')) {
                        db.createObjectStore('sync_queue', { keyPath: 'id' });
                    }
                    if (!db.objectStoreNames.contains('datastage_drafts')) {
                        db.createObjectStore('datastage_drafts', { keyPath: 'id' });
                    }
                    if (!db.objectStoreNames.contains('datastage_reports')) {
                        db.createObjectStore('datastage_reports', { keyPath: 'id' });
                    }
                    if (!db.objectStoreNames.contains('restore_points')) {
                        db.createObjectStore('restore_points', { keyPath: 'id' });
                    }
                    if (!db.objectStoreNames.contains('app_state')) {
                        db.createObjectStore('app_state', { keyPath: 'id' });
                    }
                    if (!db.objectStoreNames.contains('cfdi_invoices')) {
                        db.createObjectStore('cfdi_invoices', { keyPath: 'id' });
                    }
                },
            });
            console.log('✅ IndexedDB Initialized');
        } catch (e) {
            console.error('Failed to init IndexedDB', e);
        }
    },

    getAllParts: async (): Promise<any[]> => {
        if (!indexedDbService.db) await indexedDbService.init();
        try {
            return await indexedDbService.db!.getAll(STORE_NAME);
        } catch (e) {
            console.error('Failed to get parts from IndexedDB', e);
            return [];
        }
    },

    saveParts: async (parts: any[]) => {
        if (!indexedDbService.db) await indexedDbService.init();
        try {
            const tx = indexedDbService.db!.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            for (const part of parts) {
                store.put(part); // Put is async but we don't need to await each for transaction speed
            }
            await tx.done;
        } catch (e) {
            console.error('Failed to save parts to IndexedDB', e);
        }
    },

    putPart: async (part: any) => {
        if (!indexedDbService.db) await indexedDbService.init();
        try {
            await indexedDbService.db!.put(STORE_NAME, part);
        } catch (e) {
            console.error('Failed to put part to IndexedDB', e);
        }
    },

    clearParts: async () => {
        if (!indexedDbService.db) await indexedDbService.init();
        try {
            await indexedDbService.db!.clear(STORE_NAME);
        } catch (e) {
            console.error('Failed to clear IndexedDB', e);
        }
    },

    deletePart: async (id: string) => {
        if (!indexedDbService.db) await indexedDbService.init();
        try {
            await indexedDbService.db!.delete(STORE_NAME, id);
        } catch (e) {
            console.error('Failed to delete part from IndexedDB', e);
        }
    },

    saveInvoices: async (invoices: any[]) => {
        if (!indexedDbService.db) await indexedDbService.init();
        try {
            const tx = indexedDbService.db!.transaction('invoices', 'readwrite');
            const store = tx.objectStore('invoices');
            for (const item of invoices) {
                store.put(item);
            }
            await tx.done;
        } catch (e) {
            console.error('Failed to save invoices to IndexedDB', e);
        }
    },

    getAllInvoices: async (): Promise<any[]> => {
        if (!indexedDbService.db) await indexedDbService.init();
        try {
            return await indexedDbService.db!.getAll('invoices');
        } catch (e) {
            console.error('Failed to get invoices from IndexedDB', e);
            return [];
        }
    },

    saveLogs: async (logs: any[]) => {
        if (!indexedDbService.db) await indexedDbService.init();
        try {
            const tx = indexedDbService.db!.transaction('logs', 'readwrite');
            const store = tx.objectStore('logs');
            for (const log of logs) {
                store.put(log);
            }
            await tx.done;
        } catch (e) {
            console.error('Failed to save logs to IndexedDB', e);
        }
    },

    getAllLogs: async (): Promise<any[]> => {
        if (!indexedDbService.db) await indexedDbService.init();
        try {
            return await indexedDbService.db!.getAll('logs');
        } catch (e) {
            console.error('Failed to get logs from IndexedDB', e);
            return [];
        }
    },

    // Generic methods for new stores
    saveData: async (storeName: string, items: any[]) => {
        if (!indexedDbService.db) await indexedDbService.init();
        try {
            const tx = indexedDbService.db!.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            for (const item of items) {
                store.put(item);
            }
            await tx.done;
        } catch (e) {
            console.error(`Failed to save to IDB store ${storeName}`, e);
        }
    },

    getAllData: async (storeName: string): Promise<any[]> => {
        if (!indexedDbService.db) await indexedDbService.init();
        try {
            return await indexedDbService.db!.getAll(storeName);
        } catch (e) {
            console.error(`Failed to get from IDB store ${storeName}`, e);
            return [];
        }
    },

    clearStore: async (storeName: string) => {
        if (!indexedDbService.db) await indexedDbService.init();
        try {
            await indexedDbService.db!.clear(storeName);
        } catch (e) {
            console.error(`Failed to clear IDB store ${storeName}`, e);
        }
    }
};
