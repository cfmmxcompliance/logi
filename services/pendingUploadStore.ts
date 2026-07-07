/**
 * pendingUploadStore.ts
 * ---------------------
 * IndexedDB store for photos that haven't been uploaded to Drive yet.
 * On every page load the component drains this queue automatically.
 */

const DB_NAME = 'logimaster_pending_uploads';
const STORE_NAME = 'photos';
const DB_VERSION = 1;

export interface PendingUpload {
  id: string;               // libId (liberacionDock doc id)
  numeroCaja: string;
  cajaBlob: ArrayBuffer;
  puertasBlob: ArrayBuffer;
  cajaMimeType: string;
  puertasMimeType: string;
  createdAt: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function savePendingUpload(
  libId: string,
  numeroCaja: string,
  cajaFile: File,
  puertasFile: File
): Promise<void> {
  const [cajaBuffer, puertasBuffer] = await Promise.all([
    cajaFile.arrayBuffer(),
    puertasFile.arrayBuffer(),
  ]);
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({
      id: libId,
      numeroCaja,
      cajaBlob: cajaBuffer,
      puertasBlob: puertasBuffer,
      cajaMimeType: cajaFile.type || 'image/jpeg',
      puertasMimeType: puertasFile.type || 'image/jpeg',
      createdAt: new Date().toISOString(),
    } as PendingUpload);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getPendingUploads(): Promise<PendingUpload[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => { db.close(); resolve(req.result); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

export async function removePendingUpload(libId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(libId);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
