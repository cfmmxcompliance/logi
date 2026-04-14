/**
 * UploadStatusBanner
 * Banner flotante (bottom) que informa sobre uploads en progreso.
 * No bloquea la UI — el usuario puede seguir operando.
 */
import React from 'react';
import { Loader2, CheckCircle2, WifiOff, Upload } from 'lucide-react';

export type UploadStatus = 'idle' | 'waiting-online' | 'uploading' | 'done' | 'error';

interface Props {
  status: UploadStatus;
  label?: string;
  error?: string;
  onDismiss?: () => void;
}

export const UploadStatusBanner: React.FC<Props> = ({ status, label, error, onDismiss }) => {
  if (status === 'idle') return null;

  const configs: Record<UploadStatus, { bg: string; icon: React.ReactNode; text: string }> = {
    idle: { bg: '', icon: null, text: '' },
    'waiting-online': {
      bg: 'bg-amber-500',
      icon: <WifiOff size={16} className="shrink-0" />,
      text: label || 'Sin señal — esperando conexión para subir foto...',
    },
    uploading: {
      bg: 'bg-blue-600',
      icon: <Loader2 size={16} className="shrink-0 animate-spin" />,
      text: label || 'Subiendo evidencia a Drive...',
    },
    done: {
      bg: 'bg-emerald-600',
      icon: <CheckCircle2 size={16} className="shrink-0" />,
      text: label || 'Evidencia subida correctamente ✓',
    },
    error: {
      bg: 'bg-red-600',
      icon: <Upload size={16} className="shrink-0" />,
      text: error || 'Error al subir evidencia — reintentando...',
    },
  };

  const { bg, icon, text } = configs[status];

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 ${bg} text-white
        flex items-center justify-between gap-3 px-4 py-3
        shadow-lg transition-all duration-300 ease-in-out`}
    >
      <div className="flex items-center gap-2 text-sm font-semibold">
        {icon}
        <span>{text}</span>
      </div>
      {(status === 'done' || status === 'error') && onDismiss && (
        <button
          onClick={onDismiss}
          className="text-white/80 hover:text-white text-xs underline shrink-0"
        >
          Cerrar
        </button>
      )}
    </div>
  );
};
