// services/capturaService.ts
import { db } from './firebaseConfig';
import {
  collection, doc, setDoc, getDoc,
  getDocs, query, orderBy, deleteDoc,
  serverTimestamp, Timestamp
} from 'firebase/firestore';
import { CapturaLayout } from '../types/capturaLayout';

const COL = 'capturas_layout';

export const capturaService = {
  /** Save or overwrite a capture layout (doc ID = invoiceNo) */
  async save(data: Omit<CapturaLayout, 'savedAt' | 'id'>): Promise<string> {
    const id = data.invoiceNo.replace(/[^a-zA-Z0-9_-]/g, '_') || `captura_${Date.now()}`;
    const ref = doc(db, COL, id);
    await setDoc(ref, {
      ...data,
      id,
      savedAt: serverTimestamp(),
    });
    return id;
  },

  /** Get a single capture by ID */
  async get(id: string): Promise<CapturaLayout | null> {
    const snap = await getDoc(doc(db, COL, id));
    if (!snap.exists()) return null;
    return { ...snap.data(), id: snap.id } as CapturaLayout;
  },

  /** List all captures, newest first */
  async getAll(): Promise<CapturaLayout[]> {
    const q = query(collection(db, COL), orderBy('savedAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ ...d.data(), id: d.id } as CapturaLayout));
  },

  /** Delete a capture */
  async delete(id: string): Promise<void> {
    await deleteDoc(doc(db, COL, id));
  },

  /** Format a Firestore Timestamp to locale string */
  formatDate(ts: any): string {
    if (!ts) return '—';
    const date = ts instanceof Timestamp ? ts.toDate() : new Date(ts);
    return date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
  }
};
