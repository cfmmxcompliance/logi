import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface VigilanciaOutboxDB extends DBSchema {
  photos: {
    key: string;
    value: {
      id: string; // `${cajaId}_${sectionKey}`
      cajaId: string;
      cajaNumero: string;
      sectionKey: string;
      dataUrl: string;
      timestamp: number;
    };
    indexes: {
      'by-cajaId': string;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<VigilanciaOutboxDB>> | null = null;

const getDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<VigilanciaOutboxDB>('vigilancia-outbox', 1, {
      upgrade(db) {
        const store = db.createObjectStore('photos', { keyPath: 'id' });
        store.createIndex('by-cajaId', 'cajaId');
      },
    });
  }
  return dbPromise;
};

export const vigilanciaOutboxService = {
  async savePhoto(cajaId: string, cajaNumero: string, sectionKey: string, dataUrl: string): Promise<void> {
    const db = await getDB();
    await db.put('photos', {
      id: `${cajaId}_${sectionKey}`,
      cajaId,
      cajaNumero,
      sectionKey,
      dataUrl,
      timestamp: Date.now(),
    });
  },

  async getPhotosForCaja(cajaId: string) {
    const db = await getDB();
    return db.getAllFromIndex('photos', 'by-cajaId', cajaId);
  },

  async getAllPhotos() {
    const db = await getDB();
    return db.getAll('photos');
  },

  async removePhoto(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('photos', id);
  },
  
  async clearCajaPhotos(cajaId: string): Promise<void> {
    const db = await getDB();
    const photos = await db.getAllFromIndex('photos', 'by-cajaId', cajaId);
    const tx = db.transaction('photos', 'readwrite');
    for (const p of photos) {
      tx.store.delete(p.id);
    }
    await tx.done;
  }
};
