import { collection, doc, getDocs, setDoc, updateDoc, deleteDoc, query, where } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { VentanaCarga53 } from '../types/ventanaCarga53';

const COL = 'ventanasCarga53';

export const ventanaCarga53Service = {
  async getAllVentanas(): Promise<VentanaCarga53[]> {
    const snap = await getDocs(collection(db, COL));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as VentanaCarga53));
  },

  async getVentanasByFecha(fecha: string): Promise<VentanaCarga53[]> {
    const q = query(collection(db, COL), where('fecha', '==', fecha));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as VentanaCarga53));
  },

  async createVentana(ventana: Omit<VentanaCarga53, 'id'>): Promise<string> {
    const ref = doc(collection(db, COL));
    await setDoc(ref, {
      id: ref.id,
      cajasReservadas: 0,
      cajasDisponibles: ventana.capacidadCajas,
      estatus: 'Disponible',
      ...ventana,
    });
    return ref.id;
  },

  async updateVentana(id: string, partial: Partial<VentanaCarga53>): Promise<void> {
    await updateDoc(doc(db, COL, id), {
      ...partial,
      actualizadoEn: new Date().toISOString(),
    });
  },

  /** Returns number of active reservas (Reservada|Confirmada) linked to this ventana. */
  async countActiveReservas(ventanaId: string): Promise<number> {
    const q = query(
      collection(db, 'reservasVentanasCarga53'),
      where('ventanaId', '==', ventanaId),
    );
    const snap = await getDocs(q);
    return snap.docs.filter(d => ['Reservada', 'Confirmada'].includes(d.data().estatus)).length;
  },

  /** Deletes a ventana. Throws if it has active reservas. */
  async deleteVentana(id: string): Promise<void> {
    const active = await ventanaCarga53Service.countActiveReservas(id);
    if (active > 0) {
      throw new Error(`Esta ventana tiene ${active} reserva(s) activa(s). Cancélalas primero.`);
    }
    await deleteDoc(doc(db, COL, id));
  },
};
