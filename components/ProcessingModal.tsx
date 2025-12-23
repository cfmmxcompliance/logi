import React from 'react';
import { Loader2, CheckCircle, XCircle, X } from 'lucide-react';

export interface ProcessingState {
  isOpen: boolean;
  status: 'idle' | 'loading' | 'success' | 'error';
  title: string;
  message: string;
  progress: number;
}

export const INITIAL_PROCESSING_STATE: ProcessingState = {
    isOpen: false,
    status: 'idle',
    title: '',
    message: '',
    progress: 0
};

interface ProcessingModalProps {
  state: ProcessingState;
  onClose: () => void;
}

export const ProcessingModal: React.FC<ProcessingModalProps> = ({ state, onClose }) => {
  if (!state.isOpen) return null;

  const { status, title, message, progress } = state;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm transition-all duration-300">
      <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-sm text-center relative animate-in fade-in zoom-in duration-200 border border-slate-100">
        
        {status === 'error' && (
            <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors">
                <X size={20} />
            </button>
        )}

        <div className="flex justify-center mb-6">
          {status === 'loading' && (
            <div className="p-4 bg-blue-50 rounded-full border border-blue-100 shadow-sm">
                <Loader2 className="animate-spin text-blue-600" size={40} />
            </div>
          )}
          {status === 'success' && (
            <div className="p-4 bg-emerald-50 rounded-full border border-emerald-100 shadow-sm animate-in zoom-in duration-300">
                <CheckCircle className="text-emerald-600" size={40} />
            </div>
          )}
          {status === 'error' && (
            <div className="p-4 bg-red-50 rounded-full border border-red-100 shadow-sm animate-in zoom-in duration-300">
                <XCircle className="text-red-600" size={40} />
            </div>
          )}
        </div>

        <h3 className={`text-xl font-bold mb-2 ${
            status === 'error' ? 'text-red-700' : 
            status === 'success' ? 'text-emerald-700' : 
            'text-slate-800'
        }`}>
            {title}
        </h3>
        
        <p className="text-slate-500 mb-6 text-sm leading-relaxed">{message}</p>

        {status === 'loading' && (
           <div className="w-full bg-slate-100 rounded-full h-2.5 mb-2 overflow-hidden shadow-inner">
             <div 
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-500 ease-out" 
                style={{ width: `${Math.max(5, progress)}%` }}
             ></div>
           </div>
        )}
        
        {status === 'loading' && (
            <p className="text-xs text-slate-400 font-mono font-medium">{Math.round(progress)}%</p>
        )}

        {status === 'error' && (
            <button 
                onClick={onClose} 
                className="mt-2 w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors"
            >
                Cerrar
            </button>
        )}
      </div>
    </div>
  );
};