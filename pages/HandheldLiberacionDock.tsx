import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/useAuth';
import { asignacionCajaService } from '../services/asignacionCajaService.ts';
import { liberacionDockService } from '../services/liberacionDockService.ts';
import { LiberacionDockRecord } from '../types.ts';
import { AsignacionCajaModel } from '../types/asignacionCaja.ts';
import { Camera, Anchor, CheckCircle2, ChevronLeft, Loader2, ArrowRight, DoorOpen, Box, X, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { HandheldToolbar } from '../components/HandheldToolbar.tsx';
import { uploadFileToDrive } from '../services/googleDriveService.ts';
import { waitForOnline } from '../hooks/useOnlineStatus.ts';
import { useUploadGuard } from '../hooks/useUploadGuard.ts';
import { UploadStatusBanner, UploadStatus } from '../components/UploadStatusBanner.tsx';
import { savePendingUpload, getPendingUploads, removePendingUpload } from '../services/pendingUploadStore.ts';

export const HandheldLiberacionDock = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [cajasAsignadas, setCajasAsignadas] = useState<AsignacionCajaModel[]>([]);
  const [liberacionesDock, setLiberacionesDock] = useState<LiberacionDockRecord[]>([]);
  const [filteredCajas, setFilteredCajas] = useState<AsignacionCajaModel[]>([]);
  const [selectedCaja, setSelectedCaja] = useState<AsignacionCajaModel | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [dateStart, setDateStart] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' }));
  const [dateEnd, setDateEnd] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' }));
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDIENTES' | 'LIBERADAS'>('ALL');

  const [fotoCajaFile, setFotoCajaFile] = useState<File | null>(null);
  const [fotoPuertasFile, setFotoPuertasFile] = useState<File | null>(null);
  const [activeCameraStep, setActiveCameraStep] = useState<1 | 2 | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Upload state
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [uploadStatusLabel, setUploadStatusLabel] = useState<string | undefined>(undefined);
  const [uploadError, setUploadError] = useState<string | undefined>(undefined);

  useUploadGuard(uploadStatus === 'uploading' || uploadStatus === 'waiting-online');

  const fetchDataForRange = async () => {
    setLoading(true);
    try {
      const [dataCajas, dataLibs] = await Promise.all([
        asignacionCajaService.getAsignacionesByDateRange(dateStart, dateEnd),
        dateStart === dateEnd 
          ? liberacionDockService.getLiberacionesDockByDate(dateStart) 
          : liberacionDockService.getLiberacionesDockByDateRange(dateStart, dateEnd)
      ]);
      setCajasAsignadas(dataCajas);
      setLiberacionesDock(dataLibs);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const drainedRef = useRef(false);

  // Drain any pending uploads from IndexedDB on mount
  const drainPendingUploads = async () => {
    if (drainedRef.current) return;
    drainedRef.current = true;
    try {
      const pending = await getPendingUploads();
      if (pending.length === 0) return;
      console.log(`[LiberacionDock] ${pending.length} subida(s) pendiente(s) encontrada(s). Reintentando...`);
      for (const p of pending) {
        const cajaFile = new File([p.cajaBlob], `retry_${p.numeroCaja}_CAJA.jpg`, { type: p.cajaMimeType });
        const puertasFile = new File([p.puertasBlob], `retry_${p.numeroCaja}_PUERTAS.jpg`, { type: p.puertasMimeType });
        await uploadEvidenciasBackground(cajaFile, puertasFile, p.id, p.numeroCaja);
      }
    } catch (err) {
      console.error('[LiberacionDock] Error drenando pendientes:', err);
    }
  };

  useEffect(() => {
    fetchDataForRange();
    drainPendingUploads();
  }, [dateStart, dateEnd]);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredCajas(cajasAsignadas);
      return;
    }
    const term = searchTerm.toLowerCase();
    setFilteredCajas(cajasAsignadas.filter(c => 
      (c.numeroCaja || '').toLowerCase().includes(term) ||
      (c.placas || '').toLowerCase().includes(term) ||
      (c.numeroOperacion || '').toLowerCase().includes(term) ||
      (c.transportista || '').toLowerCase().includes(term)
    ));
  }, [cajasAsignadas, searchTerm]);

  const getLiberacionDockForCaja = (cajaId: string) => liberacionesDock.find(l => l.asignacionCajaId === cajaId);

  const [isProcessingImage, setIsProcessingImage] = useState(false);

  const handleCaptureImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const step = activeCameraStep;
      // Limpiar el input
      e.target.value = '';
      setActiveCameraStep(null);
      setIsProcessingImage(true);

      try {
        const compressedBase64 = await compressImage(file);
        const res = await fetch(compressedBase64);
        const blob = await res.blob();
        const compressedFile = new File([blob], `compressed_${file.name}`, { type: 'image/jpeg' });

        if (step === 1) setFotoCajaFile(compressedFile);
        else if (step === 2) setFotoPuertasFile(compressedFile);
      } catch (err) {
        console.error("Error comprimiendo foto:", err);
        alert("No se pudo procesar la foto.");
      } finally {
        setIsProcessingImage(false);
      }
    }
  };

  const triggerCamera = (step: 1 | 2) => {
    setActiveCameraStep(step);
    document.getElementById('hidden-camera-input')?.click();
  };

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let { width, height } = img;
          const MAX_SIZE = 1440;
          if (width > height) { if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } }
          else { if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; } }
          canvas.width = Math.round(width);
          canvas.height = Math.round(height);
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = () => reject(new Error('Error al cargar imagen.'));
      };
      reader.onerror = () => reject(new Error('Error al leer archivo.'));
    });
  };

  const uploadEvidenciasBackground = async (
    cajaFile: File,
    puertasFile: File,
    libId: string,
    numeroCaja: string
  ) => {
    const FOLDER_ID = '1jBIvDIbXAP2eGFyVM3J2i5iZWjaEdO9X';
    const MAX_RETRIES = 3;

    if (!navigator.onLine) {
      setUploadStatus('waiting-online');
      setUploadStatusLabel('Sin señal — esperando conexión para subir fotos...');
      await waitForOnline();
    }

    setUploadStatus('uploading');
    setUploadStatusLabel('Subiendo 2 fotos a Drive...');
    setUploadError(undefined);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const ts = Date.now();
        const [cajaRes, puertasRes] = await Promise.all([
          uploadFileToDrive(cajaFile, `libdock_${numeroCaja}_CAJA_${ts}.jpg`, FOLDER_ID),
          uploadFileToDrive(puertasFile, `libdock_${numeroCaja}_PUERTAS_${ts}.jpg`, FOLDER_ID),
        ]);
        const cajaUrl = cajaRes?.webViewLink || (cajaRes as any)?.url || '';
        const puertasUrl = puertasRes?.webViewLink || (puertasRes as any)?.url || '';

        if (!cajaUrl || !puertasUrl) {
          setUploadError('Drive respondió pero sin URLs.');
          setUploadStatus('error');
          return;
        }

        await liberacionDockService.updateLiberacionDock(libId, {
          fotos: { cajaUrl, puertasUrl },
          uploadStatus: 'done',
        });

        // Update local state so icons become clickable immediately
        setLiberacionesDock(prev => prev.map(l =>
          l.id === libId ? { ...l, fotos: { cajaUrl, puertasUrl }, uploadStatus: 'done' } : l
        ));

        // Remove from IndexedDB queue — upload succeeded
        try { await removePendingUpload(libId); } catch { /* ok */ }

        setUploadStatus('done');
        setUploadStatusLabel('2 fotos subidas ✔');
        setTimeout(() => setUploadStatus('idle'), 4000);
        return;
      } catch (err: any) {
        setUploadError(err.message);
        if (attempt < MAX_RETRIES) {
          if (!navigator.onLine) { setUploadStatus('waiting-online'); await waitForOnline(); }
          setUploadStatus('uploading');
          setUploadStatusLabel(`Reintentando (${attempt + 1}/${MAX_RETRIES})...`);
          await new Promise(r => setTimeout(r, 2000 * attempt));
        } else {
          // Mark as failed in Firestore so we know it needs retry
          try {
            await liberacionDockService.updateLiberacionDock(libId, { uploadStatus: 'error' });
          } catch { /* best effort */ }
          setUploadStatus('error');
        }
      }
    }
  };

  const handleSave = async () => {
    if (!selectedCaja || !fotoCajaFile || !fotoPuertasFile) return;
    setIsSaving(true);
    setErrorMsg(null);
    try {
      // 1. Guardar en Firestore con PENDING
      const record: LiberacionDockRecord = {
        fechaLiberacion: selectedCaja.fecha || dateStart,
        asignacionCajaId: selectedCaja.id || '',
        numeroCaja: selectedCaja.numeroCaja,
        usuario: user?.email || user?.username || user?.name || 'operario',
        fechaHoraRegistro: new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City', hour12: false }),
        fotos: { cajaUrl: 'PENDING', puertasUrl: 'PENDING' },
        createdAt: new Date().toISOString(),
      };
      const libId = await liberacionDockService.addLiberacionDock(record);
      
      // Optimistic update so it shows as closed immediately
      setLiberacionesDock(prev => [...prev, { ...record, id: libId }]);
      setSaveSuccess(true);
      
      // 2. Persist photos to IndexedDB so they survive browser close
      try {
        await savePendingUpload(libId, selectedCaja.numeroCaja, fotoCajaFile, fotoPuertasFile);
      } catch (e) {
        console.warn('[LiberacionDock] No se pudo guardar en IndexedDB:', e);
      }

      // 3. Start background upload to Drive
      uploadEvidenciasBackground(fotoCajaFile, fotoPuertasFile, libId, selectedCaja.numeroCaja);

      setTimeout(() => {
        setSaveSuccess(false);
        setSelectedCaja(null);
        setFotoCajaFile(null);
        setFotoPuertasFile(null);
        // NOTE: No fetchDataForRange() here — the upload runs in the background
        // and will update local state directly when URLs are ready.
        // Fetching now would overwrite the optimistic record with PENDING from Firestore.
      }, 1500);
    } catch (e: any) {
      setErrorMsg(e.message || 'Error al guardar');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white"><Loader2 className="animate-spin mb-4 text-sky-400" size={32} />Cargando...</div>;
  }

  const cajasProcesadas = filteredCajas.map(c => {
    const lib = getLiberacionDockForCaja(c.id!);
    return { ...c, liberada: !!lib, lib };
  });

  const totalAll = cajasProcesadas.length;
  const totalLiberadas = cajasProcesadas.filter(c => c.liberada).length;
  const totalPendientes = totalAll - totalLiberadas;

  const displayedCajas = cajasProcesadas.filter(c => {
    if (statusFilter === 'PENDIENTES') return !c.liberada;
    if (statusFilter === 'LIBERADAS') return c.liberada;
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col text-slate-100 font-sans relative">
      <UploadStatusBanner status={uploadStatus} label={uploadStatusLabel} error={uploadError} />
      <div className="bg-slate-900 border-b border-slate-800 p-4 sticky top-0 z-10 flex items-center shadow-md">
        <button onClick={() => navigate('/m/home')} className="p-2 -ml-2 rounded-full hover:bg-slate-800 text-slate-400 transition-colors">
          <ChevronLeft size={24} />
        </button>
        <div className="ml-2 flex items-center gap-2">
          <Anchor size={20} className="text-sky-400" />
          <h1 className="text-lg font-bold text-white tracking-tight leading-none">Liberación de Dock</h1>
        </div>
      </div>

      {!selectedCaja && !saveSuccess && (
        <>
          <HandheldToolbar
            dateStart={dateStart} setDateStart={setDateStart}
            dateEnd={dateEnd} setDateEnd={setDateEnd}
            searchTerm={searchTerm} setSearchTerm={setSearchTerm}
            onSearch={() => {}}
          />
          {cajasProcesadas.length > 0 && (
            <div className="px-4 pb-3 bg-slate-900 border-b border-slate-800">
              <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl p-1 gap-1">
                {/* Todos */}
                <button
                  onClick={() => setStatusFilter('ALL')}
                  className={`flex-1 px-2 py-2 rounded-lg text-xs font-bold transition-all ${statusFilter === 'ALL' ? 'bg-sky-500 text-slate-900 shadow' : 'text-slate-400 hover:bg-slate-800'}`}
                >
                  Todos ({totalAll})
                </button>

                {/* Pendientes */}
                <button
                  onClick={() => setStatusFilter('PENDIENTES')}
                  className={`flex-1 px-2 py-2 rounded-lg text-xs font-bold transition-all flex flex-col items-center leading-tight ${statusFilter === 'PENDIENTES' ? 'bg-sky-500 text-slate-900 shadow' : 'text-slate-400 hover:bg-slate-800'}`}
                >
                  <span>PENDIENTES ({totalPendientes})</span>
                  {totalPendientes > 0 && (
                    <span className={`text-[10px] font-semibold mt-0.5 ${statusFilter === 'PENDIENTES' ? 'text-sky-900/80' : 'text-slate-500'}`}>
                      sin liberar: {totalPendientes}
                    </span>
                  )}
                </button>

                {/* Liberadas */}
                <button
                  onClick={() => setStatusFilter('LIBERADAS')}
                  className={`flex-1 px-2 py-2 rounded-lg text-xs font-bold transition-all flex flex-col items-center leading-tight ${statusFilter === 'LIBERADAS' ? 'bg-sky-500 text-slate-900 shadow' : 'text-slate-400 hover:bg-slate-800'}`}
                >
                  <span>LIBERADAS ({totalLiberadas})</span>
                  {totalLiberadas > 0 && (
                    <span className={`text-[10px] font-semibold mt-0.5 ${statusFilter === 'LIBERADAS' ? 'text-sky-900/80' : 'text-slate-500'}`}>
                      🟢 {totalLiberadas} cajas
                    </span>
                  )}
                </button>
              </div>
            </div>
          )}
        </>
      )}

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
            <h2 className="text-xs font-bold text-slate-500 tracking-widest uppercase mb-4 px-1 mt-4">CAJAS ENCONTRADAS ({displayedCajas.length})</h2>
            {displayedCajas.length === 0 ? (
              <div className="text-center py-12 bg-slate-900/50 rounded-2xl border border-slate-800/50 mt-2">
                <Box size={48} className="mx-auto text-slate-700 mb-4" />
                <h3 className="text-lg font-bold text-slate-400 mb-1">
                  {statusFilter === 'PENDIENTES' ? 'No hay cajas pendientes' :
                   statusFilter === 'LIBERADAS' ? 'No hay cajas liberadas' :
                   'No se encontraron cajas'}
                </h3>
                <p className="text-slate-500 text-sm">Prueba cambiando la fecha o el filtro de estado.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {displayedCajas.map(c => {
                  const lib = c.lib;
                  const yaLiberada = c.liberada;
                return (
                  <div key={c.id} onClick={() => { if (!yaLiberada) setSelectedCaja(c); }} className={`relative p-5 rounded-2xl border transition-all ${yaLiberada ? 'bg-emerald-950/20 border-emerald-900/50 opacity-90' : 'bg-slate-900 hover:bg-slate-800 border-slate-800 active:scale-95 cursor-pointer shadow-sm'}`}>
                    {yaLiberada && (
                      <div className="absolute top-0 right-0 bg-emerald-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg flex items-center gap-1 shadow-sm">
                        <CheckCircle size={12} /> LIBERADA
                      </div>
                    )}
                    <div className="flex items-center justify-between text-left">
                      <div>
                        <h3 className="text-2xl font-black text-white tracking-tight">{c.numeroCaja}</h3>
                        <p className="text-sky-400 text-sm font-semibold mt-1">Op: {c.numeroOperacion || 'N/A'}</p>
                        <p className="text-slate-400 text-xs mt-1">{c.fecha}</p>
                      </div>
                      {!yaLiberada && <ArrowRight size={24} className="text-slate-600" />}
                    </div>

                    {yaLiberada && (
                      <div className="mt-4 bg-emerald-900/30 p-3 rounded-xl border border-emerald-800/50 flex flex-col gap-2">
                        <span className="text-[10px] text-emerald-400 uppercase font-bold tracking-widest">Evidencias Guardadas</span>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const url = lib.fotos?.cajaUrl;
                              if (url && url !== 'PENDING') setPreviewUrl(url.replace('/view', '/preview'));
                            }}
                            className={`p-3 rounded-xl border transition-colors ${lib.fotos?.cajaUrl && lib.fotos.cajaUrl !== 'PENDING' ? 'bg-slate-800 text-blue-400 hover:text-white border-slate-700 hover:border-blue-500' : 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed opacity-40'}`}
                            title={lib.fotos?.cajaUrl === 'PENDING' ? 'Subiendo...' : 'Ver foto Caja'}
                          >
                            <Box size={24} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const url = lib.fotos?.puertasUrl;
                              if (url && url !== 'PENDING') setPreviewUrl(url.replace('/view', '/preview'));
                            }}
                            className={`p-3 rounded-xl border transition-colors ${lib.fotos?.puertasUrl && lib.fotos.puertasUrl !== 'PENDING' ? 'bg-slate-800 text-orange-400 hover:text-white border-slate-700 hover:border-orange-500' : 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed opacity-40'}`}
                            title={lib.fotos?.puertasUrl === 'PENDING' ? 'Subiendo...' : 'Ver foto Puertas'}
                          >
                            <DoorOpen size={24} />
                          </button>
                        </div>
                        <span className="text-[10px] text-emerald-500/70 pt-1 mt-1 block border-t border-emerald-800/50">{lib.fechaHoraRegistro} - {lib.usuario}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            )}
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
                <h3 className="font-bold text-white mb-3">1. Foto de Caja Cargada</h3>
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

      {/* IMAGE PREVIEW MODAL */}
      {previewUrl && (
        <div className="fixed inset-0 z-[60] bg-black/95 flex flex-col animate-in fade-in duration-200">
          <div className="flex justify-end p-4">
            <button onClick={() => setPreviewUrl(null)} className="p-3 bg-slate-800/80 hover:bg-slate-700 rounded-full text-white transition-colors">
              <X size={28} />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center p-4">
            <iframe 
              src={previewUrl}
              className="w-full h-full max-w-4xl max-h-[85vh] rounded-lg bg-slate-800"
              allow="autoplay"
              sandbox="allow-scripts allow-same-origin"
            />
          </div>
        </div>
      )}
    </div>
  );
};
