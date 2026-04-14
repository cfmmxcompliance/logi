/**
 * useUploadGuard — previene cierre accidental del browser mientras hay uploads en curso.
 * Usa el evento nativo `beforeunload` que muestra un diálogo de confirmación al usuario.
 */
import { useEffect } from 'react';

export function useUploadGuard(isUploading: boolean): void {
  useEffect(() => {
    if (!isUploading) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Requerido por browsers modernos — el mensaje personalizado ya no se muestra,
      // pero el diálogo nativo del browser sí aparece.
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isUploading]);
}
