import { collection, addDoc, updateDoc, doc, arrayUnion } from 'firebase/firestore';
import { db } from './firebaseConfig';

export interface ExpoNotification {
  id?: string;
  tl: string;
  caja: string;
  createdAt: string;
  leidoPor: string[]; // array of user emails
}

class ExpoNotificationService {
  private collectionName = 'notificaciones_expo';

  async addNotification(tl: string, caja: string): Promise<void> {
    try {
      await addDoc(collection(db, this.collectionName), {
        tl,
        caja,
        createdAt: new Date().toISOString(),
        leidoPor: []
      });
    } catch (error) {
      console.error("Error adding expo notification", error);
    }
  }

  async markAsRead(notificationId: string, email: string): Promise<void> {
    try {
      const docRef = doc(db, this.collectionName, notificationId);
      await updateDoc(docRef, {
        leidoPor: arrayUnion(email)
      });
    } catch (error) {
      console.error("Error marking expo notification as read", error);
    }
  }
}

export const expoNotificationService = new ExpoNotificationService();
