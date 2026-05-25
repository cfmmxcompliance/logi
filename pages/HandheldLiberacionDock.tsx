import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { asignacionCajaService } from '../services/asignacionCajaService.ts';
import { liberacionDockService } from '../services/liberacionDockService.ts';
import { AsignacionCajaModel, LiberacionDockRecord } from '../types.ts';
import { Camera, Anchor, CheckCircle2, ChevronLeft, Loader2, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const HandheldLiberacionDock = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [cajasAsignadas, setCajasAsignadas] = useState<AsignacionCajaModel[]>([]);
  const [selectedCaja, setSelectedCaja] = useState<AsignacionCajaModel | null>(null);

  const [fotoCajaFile, setFotoCajaFile] = useState<File | null>(null);
  const [fotoPuertasFile, setFotoPuertasFile] = useState<File | null>(null);
  const [activeCameraStep, setActiveCameraStep] = useState<1 | 2 | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchDataForDate = async (targetDate: string) => {
    setLoading(true);
    try {
      const data = await asignacionCajaService.getAsignacionesByDate(targetDate);
      setCajasAsignadas(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
    fetchDataForDate(today);
  }, []);

  const handleCaptureImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (activeCameraStep === 1) setFotoCajaFile(file);
      else if (activeCameraStep === 2) setFotoPuertasFile(file);
      setActiveCameraStep(null);
    }
  };

  const triggerCamera = (step: 1 | 2) => {
    setActiveCameraStep(step);
    document.getElementById('hidden-camera-input')?.click();
  };

  const handleSave = async () => {
    if (!selectedCaja || !fotoCajaFile || !fotoPuertasFile) return;
    setIsSaving(true);
    setErrorMsg(null);
    try {
      const selectedDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
      const record: LiberacionDockRecord = {
        fechaLiberacion: selectedDate,
        asignacionCajaId: selectedCaja.id || '',
        numeroCaja: selectedCaja.numeroCaja,
        usuario: user?.email || user?.username || user?.name || 'operario',
        fechaHoraRegistro: new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City', hour12: false }),
        fotos: { cajaUrl: 'PENDING', puertasUrl: 'PENDING' },
        createdAt: new Date().toISOString(),
      };
      await liberacionDockService.addLiberacionDock(record);
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setSelectedCaja(null);
        setFotoCajaFile(null);
        setFotoPuertasFile(null);
        fetchDataForDate(selectedDate);
      }, 2000);
    } catch (e: any) {
      setErrorMsg(e.message || 'Error al guardar');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white"><Loader2 className="animate-spin mb-4 text-sky-400" size={32} />Cargando...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col text-slate-100 font-sans relative">
      <div className="bg-slate-900 border-b border-slate-800 p-4 sticky top-0 z-10 flex items-center shadow-md">
        <button onClick={() => navigate('/m/home')} className="p-2 -ml-2 rounded-full hover:bg-slate-800 text-slate-400 transition-colors">
          <ChevronLeft size={24} />
        </button>
        <div className="ml-2 flex items-center gap-2">
          <Anchor size={20} className="text-sky-400" />
          <h1 className="text-lg font-bold text-white tracking-tight leading-none">Liberación de Dock</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-24">
        {errorMsg && (
          <div className="bg-red-900/50 border border-red-500/50 text-red-200 p-4 rounded-xl mb-4 text-sm">
            {errorMsg}
          </div>
        )}

        {saveSuccess ? (
          <div className="h-[60vh] flex flex-col items-center justify-center text-center animate-in zoom-in duration-300">
            <div className="w-24 h-24 bg-green-500/20 rounded-full flex items-center justify-center mb-6">
              <CheckCircle2 size={64} className="text-green-500" />
            </div>
            <h2 className="text-2xl font-black text-white">¡Liberación Exitosa!</h2>
            <p className="text-slate-400 mt-2">Los datos se han guardado correctamente.</p>
          </div>
        ) : !selectedCaja ? (
          <div>
            <h2 className="text-xs font-bold text-slate-500 tracking-widest uppercase mb-4 px-1">SELECCIONA UNA CAJA ({cajasAsignadas.length})</h2>
            <div className="grid grid-cols-1 gap-3">
              {cajasAsignadas.map(c => (
                <button key={c.id} onClick={() => setSelectedCaja(c)} className="bg-slate-900 hover:bg-slate-800 border border-slate-800 p-5 rounded-2xl flex items-center justify-between text-left transition-all active:scale-95 shadow-sm">
                  <div>
                    <h3 className="text-2xl font-black text-white tracking-tight">{c.numeroCaja}</h3>
                    <p className="text-sky-400 text-sm font-semibold mt-1">Op: {c.numeroOperacion || 'N/A'}</p>
                  </div>
                  <ArrowRight size={24} className="text-slate-600" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="animate-in slide-in-from-right-4 duration-200">
            <div className="flex justify-between items-center mb-6 px-1">
              <div>
                <span className="text-xs text-sky-400 font-bold tracking-widest uppercase">CAJA SELECCIONADA</span>
                <h2 className="text-3xl font-black text-white">{selectedCaja.numeroCaja}</h2>
              </div>
              <button onClick={() => { setSelectedCaja(null); setFotoCajaFile(null); setFotoPuertasFile(null); }} className="text-sm font-semibold text-slate-400 bg-slate-900 px-4 py-2 rounded-lg">Cambiar</button>
            </div>

            <input type="file" accept="image/*" capture="environment" id="hidden-camera-input" onChange={handleCaptureImage} className="hidden" />

            <div className="space-y-4">
              <div className={`border-2 rounded-2xl p-5 transition-all ${fotoCajaFile ? 'bg-sky-900/20 border-sky-500/50' : 'bg-slate-900 border-slate-700'}`}>
                <h3 className="font-bold text-white mb-3">1. Foto Placas y Caja</h3>
                <button onClick={() => triggerCamera(1)} className={`w-full py-4 rounded-xl flex justify-center items-center gap-2 font-bold ${fotoCajaFile ? 'bg-slate-950 text-sky-400' : 'bg-sky-600 text-white'}`}>
                  <Camera size={20} /> {fotoCajaFile ? 'Tomar de nuevo' : 'Capturar Foto 1'}
                </button>
              </div>

              <div className={`border-2 rounded-2xl p-5 transition-all ${fotoPuertasFile ? 'bg-sky-900/20 border-sky-500/50' : 'bg-slate-900 border-slate-700'}`}>
                <h3 className="font-bold text-white mb-3">2. Foto Puertas</h3>
                <button onClick={() => triggerCamera(2)} className={`w-full py-4 rounded-xl flex justify-center items-center gap-2 font-bold ${fotoPuertasFile ? 'bg-slate-950 text-sky-400' : 'bg-sky-600 text-white'}`}>
                  <Camera size={20} /> {fotoPuertasFile ? 'Tomar de nuevo' : 'Capturar Foto 2'}
                </button>
              </div>
            </div>

            <div className="mt-8 bg-slate-900 border-t border-slate-800 p-4 fixed bottom-0 left-0 right-0 z-20">
              <button
                onClick={handleSave}
                disabled={!fotoCajaFile || !fotoPuertasFile || isSaving}
                className={`w-full max-w-sm mx-auto py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                  !fotoCajaFile || !fotoPuertasFile ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-sky-500 hover:bg-sky-400 text-slate-950'
                }`}
              >
                {isSaving ? <><Loader2 size={24} className="animate-spin" /> Guardando...</> : <><CheckCircle2 size={24} /> Confirmar Liberación de Dock</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
