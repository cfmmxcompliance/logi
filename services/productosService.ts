import { collection, doc, getDocs, updateDoc } from 'firebase/firestore';
import { db } from './firebaseConfig';

export interface Producto {
  id: string;
  estilo: string;
  modelo: string;
  unidadesPorCaja53?: number; // Non-destructive: may not exist in legacy docs
  updatedAt?: string;
}

const COLLECTION = 'productos';

export const productosService = {
  /** Get all products from the productos collection */
  async getAllProductos(): Promise<Producto[]> {
    const snapshot = await getDocs(collection(db, COLLECTION));
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Producto));
  },

  /** Update only the unidadesPorCaja53 field — non-destructive, preserves estilo/modelo */
  async updateUnidadesPorCaja(id: string, unidades: number): Promise<void> {
    const ref = doc(db, COLLECTION, id);
    await updateDoc(ref, {
      unidadesPorCaja53: unidades,
      updatedAt: new Date().toISOString(),
    });
  },
};
