import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'LogiMasterDB';
const DB_VERSION = 1;
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
    }
};
