import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebaseConfig';

const COLLECTION_NAME = 'productos';

export const catalogoProductosService = {
  /**
   * Retrieves all products from the productos collection
   * Returns a map of ProductNo (estilo) -> ModelName.
   */
  async getProductCatalog(): Promise<Record<string, string>> {
    const snapshot = await getDocs(collection(db, COLLECTION_NAME));
    const catalog: Record<string, string> = {};
    
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.estilo && data.modelo) {
        catalog[data.estilo] = data.modelo;
      }
    });

    return catalog;
  }
};
