import { collection, doc, getDocs, setDoc, query, where } from 'firebase/firestore';
import { db } from './firebaseConfig';

export interface CitasConfig {
  fecha: string;
  horas: Record<string, number>;
}

const COL = 'citasConfiguracion';

export const citasConfigService = {
  async getCitasConfigByDateRange(start: string, end: string): Promise<Record<string, Record<string, number>>> {
    const q = query(
      collection(db, COL),
      where('fecha', '>=', start),
      where('fecha', '<=', end)
    );
    const snap = await getDocs(q);
    const result: Record<string, Record<string, number>> = {};
    snap.docs.forEach(d => {
      const data = d.data() as CitasConfig;
      result[data.fecha] = data.horas || {};
    });
    return result;
  },

  async getAllConfigs(): Promise<Record<string, Record<string, number>>> {
    const snap = await getDocs(collection(db, COL));
    const result: Record<string, Record<string, number>> = {};
    snap.docs.forEach(d => {
      const data = d.data() as CitasConfig;
      result[data.fecha] = data.horas || {};
    });
    return result;
  },

  async saveConfig(fecha: string, horas: Record<string, number>): Promise<void> {
    const ref = doc(db, COL, fecha);
    await setDoc(ref, {
      fecha,
      horas
    });
  }
};
