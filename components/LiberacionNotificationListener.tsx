import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { useAuth } from '../context/useAuth';
import { UserRole } from '../types';
import { liberacionNotificationService, LiberacionNotification } from '../services/liberacionNotificationService';
import { PackageCheck, CheckCircle } from 'lucide-react';

export const LiberacionNotificationListener: React.FC = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<LiberacionNotification[]>([]);
  const isClosingAll = React.useRef(false);

  useEffect(() => {
    // Solo mostramos a estos roles
    const allowedRoles = [UserRole.ADMIN, UserRole.EXPO_COORDINATOR];
    if (!user || !user.role || !allowedRoles.includes(user.role as any)) {
      return;
    }

    const q = query(
      collection(db, 'notificaciones_liberacion')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (isClosingAll.current) return;

      const notifs: LiberacionNotification[] = [];
      const userEmail = user.email || '';
      
      snapshot.forEach(doc => {
        const data = doc.data() as LiberacionNotification;
        // Solo mostramos notificaciones recientes (últimos 3 días para no saturar) 
        // Y que el usuario actual NO haya leído
        const isRecent = (new Date().getTime() - new Date(data.createdAt).getTime()) < 3 * 24 * 60 * 60 * 1000;
        if (isRecent && (!data.leidoPor || !data.leidoPor.includes(userEmail))) {
          notifs.push({ ...data, id: doc.id });
        }
      });
      
      // Ordenamos por fecha de creación descendente (más nuevas primero)
      notifs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      setNotifications(notifs);
    });

    return () => unsubscribe();
  }, [user]);

  if (notifications.length === 0) return null;

  const activeNotif = notifications[0]; // Mostrar la más reciente primero

  const handleEnterado = async () => {
    if (!activeNotif.id || !user?.email) return;
    // Ocultar optimisticamente
    setNotifications(prev => prev.filter(n => n.id !== activeNotif.id));
    await liberacionNotificationService.markAsRead(activeNotif.id, user.email);
  };

  const handleCerrarTodas = async () => {
    if (!user?.email) return;
    isClosingAll.current = true;
    const notifIds = notifications.map(n => n.id!);
    setNotifications([]);
    await Promise.all(notifIds.map(id => liberacionNotificationService.markAsRead(id, user.email!)));
    isClosingAll.current = false;
    window.dispatchEvent(new Event('data:refresh'));
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[9999] animate-fade-in p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform animate-scale-up">
        <div className="bg-sky-600 p-6 flex flex-col items-center justify-center text-white">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mb-4">
            <PackageCheck size={32} />
          </div>
          <h2 className="text-2xl font-bold text-center">¡Línea Liberada!</h2>
        </div>
        
        <div className="p-6 flex flex-col gap-4">
          <p className="text-slate-600 text-center text-lg">
            La línea para <span className="font-bold text-slate-800">{activeNotif.tl || 'Transporte'}</span> acaba de ser <span className="font-bold text-sky-600">LIBERADA</span> para la caja:
          </p>
          
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
            <span className="text-3xl font-black text-sky-600 tracking-tight">{activeNotif.caja}</span>
          </div>
          
          <p className="text-xs text-slate-400 text-center">
            Hora: {new Date(activeNotif.createdAt).toLocaleString('es-MX')}
          </p>

          <button
            onClick={handleEnterado}
            className="mt-2 w-full h-12 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl shadow-lg shadow-sky-600/30 transition-all flex items-center justify-center gap-2 text-lg active:scale-95"
          >
            <CheckCircle size={20} />
            Enterado
          </button>
          
          {notifications.length > 1 && (
            <div className="flex flex-col items-center gap-2 mt-2 w-full">
              <p className="text-center text-sm text-slate-500">
                (Tienes {notifications.length - 1} notificación(es) más pendiente(s))
              </p>
              {user?.role !== UserRole.EXPO_COORDINATOR && user?.role !== UserRole.EMBARQUES && (
                <button
                  onClick={handleCerrarTodas}
                  className="w-full h-10 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold rounded-xl transition-all text-sm active:scale-95"
                >
                  Cerrar todas las notificaciones
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
