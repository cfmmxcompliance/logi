import { collection, addDoc, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from './firebaseConfig';

export interface LiberacionNotification {
  id?: string;
  tl: string;
  caja: string;
  createdAt: string;
  leidoPor: string[];
}

class LiberacionNotificationService {
  private collectionName = 'notificaciones_liberacion';

  async addNotification(tl: string, caja: string): Promise<void> {
    try {
      await addDoc(collection(db, this.collectionName), {
        tl,
        caja,
        createdAt: new Date().toISOString(),
        leidoPor: []
      });
    } catch (error) {
      console.error("Error adding liberacion notification", error);
    }
  }

  async markAsRead(notificationId: string, email: string): Promise<void> {
    try {
      const docRef = doc(db, this.collectionName, notificationId);
      await updateDoc(docRef, {
        leidoPor: arrayUnion(email)
      });
    } catch (error) {
      console.error("Error marking liberacion notification as read", error);
    }
  }
}

export const liberacionNotificationService = new LiberacionNotificationService();
