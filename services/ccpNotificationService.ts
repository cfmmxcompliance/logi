import { collection, addDoc, getDocs, query, where, updateDoc, doc, arrayUnion } from 'firebase/firestore';
import { db } from './firebaseConfig';

export interface CcpNotification {
  id?: string;
  tl: string;
  caja: string;
  createdAt: string;
  leidoPor: string[]; // array of user emails
}

class CcpNotificationService {
  private collectionName = 'notificaciones_ccp';

  async addNotification(tl: string, caja: string): Promise<void> {
    try {
      await addDoc(collection(db, this.collectionName), {
        tl,
        caja,
        createdAt: new Date().toISOString(),
        leidoPor: []
      });
    } catch (error) {
      console.error("Error adding ccp notification", error);
    }
  }

  async markAsRead(notificationId: string, email: string): Promise<void> {
    try {
      const docRef = doc(db, this.collectionName, notificationId);
      await updateDoc(docRef, {
        leidoPor: arrayUnion(email)
      });
    } catch (error) {
      console.error("Error marking ccp notification as read", error);
    }
  }
}

export const ccpNotificationService = new CcpNotificationService();
