import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface SelloMismatchAlertProps {
  isOpen: boolean;
  numeroCaja: string;
  selloOriginal: string;
  selloLiberacion: string;
  onClose: () => void;
}

/**
 * Modal de alerta crítica que se muestra cuando el sello de salida
 * no coincide con el sello registrado inicialmente en la caja.
 * Se usa en HandheldSellos, HandheldLiberacion y AsignacionesDiarias.
 */
export const SelloMismatchAlert: React.FC<SelloMismatchAlertProps> = ({
  isOpen,
  numeroCaja,
  selloOriginal,
  selloLiberacion,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-red-950 border-2 border-red-500 rounded-2xl w-full max-w-sm shadow-[0_0_60px_rgba(239,68,68,0.4)] animate-in zoom-in-95 duration-200 overflow-hidden">
        
        {/* Header */}
        <div className="bg-red-500 px-5 py-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={22} className="text-white" />
          </div>
          <div>
            <h2 className="text-white font-black text-base leading-tight uppercase tracking-wide">
              🚨 Alerta de Seguridad
            </h2>
            <p className="text-red-100/80 text-xs mt-0.5">Discrepancia de Sello Detectada</p>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-4">
          <p className="text-red-100 font-semibold text-sm leading-relaxed text-center">
            Liberacion con sello cambiado validar y no dar salida a la unidad, escalar inmediatamente.
          </p>

          {/* Caja */}
          <div className="bg-red-900/60 border border-red-700/60 rounded-xl p-3 text-center">
            <p className="text-red-300/70 text-[10px] uppercase tracking-widest font-bold mb-1">Caja</p>
            <p className="text-white font-black font-mono text-2xl tracking-widest">{numeroCaja}</p>
          </div>

          {/* Comparación de sellos */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-900/80 border border-slate-700 rounded-xl p-3 text-center">
              <p className="text-slate-400 text-[10px] uppercase tracking-widest font-bold mb-1">Sello Inicial</p>
              <p className="text-emerald-400 font-mono font-black text-base tracking-widest">
                {selloOriginal || '—'}
              </p>
            </div>
            <div className="bg-red-900/60 border border-red-600 rounded-xl p-3 text-center">
              <p className="text-red-300 text-[10px] uppercase tracking-widest font-bold mb-1">Sello Liberado</p>
              <p className="text-red-300 font-mono font-black text-base tracking-widest">
                {selloLiberacion || '—'}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5">
          <button
            onClick={onClose}
            className="w-full py-4 bg-red-500 hover:bg-red-400 text-white font-black rounded-xl transition-colors shadow-lg shadow-red-900/40 text-sm uppercase tracking-wide flex items-center justify-center gap-2"
          >
            <X size={18} />
            Entendido — Escalar Inmediatamente
          </button>
        </div>
      </div>
    </div>
  );
};
