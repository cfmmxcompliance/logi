import React, { useEffect, useState } from 'react';

interface LoadingStep {
  id: string;
  label: string;
  sublabel: string;
  weight: number; // % of total progress this step represents
}

const STEPS: LoadingStep[] = [
  { id: 'auth',    label: 'Verificando sesión',         sublabel: 'Autenticando credenciales con Firebase',   weight: 8  },
  { id: 'idb',     label: 'Iniciando base local',       sublabel: 'Preparando almacenamiento IndexedDB',      weight: 12 },
  { id: 'parts',   label: 'Cargando maestros',          sublabel: 'Números de parte y catálogos de producto', weight: 25 },
  { id: 'invoices',label: 'Cargando documentos',        sublabel: 'Facturas y registros comerciales',         weight: 15 },
  { id: 'firebase',label: 'Sincronizando con Firebase', sublabel: 'Conectando listeners en tiempo real',      weight: 25 },
  { id: 'tracking',label: 'Módulos de rastreo',         sublabel: 'Embarques, equipos y aduanas',             weight: 10 },
  { id: 'ready',   label: '¡Sistema listo!',            sublabel: 'Todos los datos disponibles',              weight: 5  },
];

interface Props {
  currentStep: string;       // id of the active step
  targetProgress: number;    // 0–100 real progress
  error?: string | null;
  onRetry?: () => void;
}

const AppLoader: React.FC<Props> = ({ currentStep, targetProgress, error, onRetry }) => {
  const [displayProgress, setDisplayProgress] = useState(0);

  // Smooth animated progress bar — interpolates to targetProgress
  useEffect(() => {
    if (displayProgress >= targetProgress) return;
    const diff = targetProgress - displayProgress;
    const step = Math.max(0.5, diff * 0.08);
    const timer = setTimeout(() => {
      setDisplayProgress(prev => Math.min(targetProgress, prev + step));
    }, 30);
    return () => clearTimeout(timer);
  }, [displayProgress, targetProgress]);

  const activeIdx = STEPS.findIndex(s => s.id === currentStep);
  const active = STEPS[activeIdx] ?? STEPS[0];

  return (
    <div className="fixed inset-0 z-[99999] flex flex-col items-center justify-center overflow-hidden"
         style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)' }}>

      {/* Animated background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-10 blur-3xl animate-pulse"
             style={{ background: 'radial-gradient(circle, #6366f1, transparent)' }} />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full opacity-10 blur-3xl animate-pulse"
             style={{ background: 'radial-gradient(circle, #3b82f6, transparent)', animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full opacity-5 blur-3xl animate-pulse"
             style={{ background: 'radial-gradient(circle, #8b5cf6, transparent)', animationDelay: '2s' }} />
      </div>

      {/* Content card */}
      <div className="relative flex flex-col items-center gap-8 px-8 py-10 max-w-md w-full">

        {/* Logo + brand */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            {/* Spinning ring */}
            <svg className="w-20 h-20 animate-spin" style={{ animationDuration: '3s' }} viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="36" fill="none" stroke="#312e81" strokeWidth="4" />
              <circle cx="40" cy="40" r="36" fill="none" stroke="url(#spinGrad)" strokeWidth="4"
                      strokeDasharray="60 170" strokeLinecap="round" />
              <defs>
                <linearGradient id="spinGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#6366f1" />
                  <stop offset="100%" stopColor="#3b82f6" />
                </linearGradient>
              </defs>
            </svg>
            {/* Center icon */}
            <div className="absolute inset-0 flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="#6366f1" strokeWidth="1.5" strokeLinejoin="round"/>
                <path d="M2 17l10 5 10-5" stroke="#3b82f6" strokeWidth="1.5" strokeLinejoin="round"/>
                <path d="M2 12l10 5 10-5" stroke="#818cf8" strokeWidth="1.5" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>

          <div className="text-center">
            <h1 className="text-2xl font-black text-white tracking-widest uppercase">LOGIMASTER</h1>
            <p className="text-xs text-indigo-400 tracking-[0.3em] mt-0.5 uppercase">CFMoto · Import / Export Control</p>
          </div>
        </div>

        {/* Error state */}
        {error ? (
          <div className="w-full flex flex-col items-center gap-4">
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl px-6 py-4 text-center">
              <p className="text-red-400 text-sm font-medium">⚠ Error al inicializar</p>
              <p className="text-red-300/70 text-xs mt-1">{error}</p>
            </div>
            {onRetry && (
              <button onClick={onRetry}
                      className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors">
                Reintentar
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Progress bar */}
            <div className="w-full space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-indigo-300 font-medium">{active.label}</span>
                <span className="text-xs text-indigo-400 font-mono">{Math.round(displayProgress)}%</span>
              </div>
              <div className="w-full h-2 rounded-full overflow-hidden"
                   style={{ background: 'rgba(99,102,241,0.15)' }}>
                <div className="h-full rounded-full transition-all"
                     style={{
                       width: `${displayProgress}%`,
                       background: 'linear-gradient(90deg, #6366f1, #3b82f6)',
                       boxShadow: '0 0 12px rgba(99,102,241,0.8)',
                       transition: 'width 0.1s ease-out',
                     }} />
              </div>
              <p className="text-xs text-slate-500 text-center">{active.sublabel}</p>
            </div>

            {/* Step indicators */}
            <div className="w-full grid grid-cols-7 gap-1">
              {STEPS.map((step, idx) => {
                const isDone    = idx < activeIdx;
                const isActive  = idx === activeIdx;
                return (
                  <div key={step.id} className="flex flex-col items-center gap-1">
                    <div className={`w-full h-1 rounded-full transition-all duration-500 ${
                      isDone   ? 'bg-indigo-500' :
                      isActive ? 'bg-blue-400 animate-pulse' :
                                 'bg-slate-700'
                    }`} />
                    {isActive && (
                      <div className="w-1 h-1 rounded-full bg-blue-400 animate-ping" />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Hint */}
            <p className="text-xs text-slate-600 text-center">
              Descargando y sincronizando todos los datos operacionales.<br />
              Solo ocurre la primera vez o al limpiar el caché.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default AppLoader;
