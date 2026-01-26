
import { openDB } from 'idb';

const DB_NAME = 'vucem_storage';
const STORE_NAME = 'fiel_files';
const META_KEY = 'vucem_meta';

export const vucemStorage = {
    async saveFiles(keyFile: File, cerFile: File) {
        const db = await openDB(DB_NAME, 1, {
            upgrade(db) {
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            },
        });
        await db.put(STORE_NAME, keyFile, 'key');
        await db.put(STORE_NAME, cerFile, 'cer');
    },

    async getFiles() {
        try {
            const db = await openDB(DB_NAME, 1);
            const keyFile = await db.get(STORE_NAME, 'key');
            const cerFile = await db.get(STORE_NAME, 'cer');
            return { keyFile, cerFile };
        } catch (e) {
            return { keyFile: null, cerFile: null };
        }
    },

    saveMeta(meta: { rfc: string, password?: string, webServicePassword?: string, remember: boolean }) {
        if (meta.remember) {
            localStorage.setItem(META_KEY, JSON.stringify(meta));
        } else {
            localStorage.removeItem(META_KEY);
        }
    },

    getMeta() {
        const str = localStorage.getItem(META_KEY);
        if (!str) return null;
        try {
            return JSON.parse(str);
        } catch (e) {
            return null;
        }
    },

    async clear() {
        // Clear LocalStorage
        localStorage.removeItem(META_KEY);

        // Clear IndexedDB
        try {
            const db = await openDB(DB_NAME, 1);
            const tx = db.transaction(STORE_NAME, 'readwrite');
            await tx.store.clear();
            await tx.done;
        } catch (e) {
            console.warn("Could not clear vucem IndexedDB", e);
        }
    }
};
