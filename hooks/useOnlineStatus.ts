/**
 * useOnlineStatus — detecta en tiempo real si el dispositivo tiene conexión a internet.
 * Escucha los eventos nativos del browser `online` / `offline`.
 */
import { useState, useEffect } from 'react';

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(() => navigator.onLine);

  useEffect(() => {
    const handleOnline  = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

/**
 * waitForOnline — Promise que resuelve cuando el dispositivo recupera conexión.
 * Úsala antes de intentar subir sin bloquear el UI (fire & forget pattern).
 */
export function waitForOnline(): Promise<void> {
  if (navigator.onLine) return Promise.resolve();
  return new Promise<void>(resolve => {
    const handler = () => {
      window.removeEventListener('online', handler);
      resolve();
    };
    window.addEventListener('online', handler);
  });
}
