import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { asignacionCajaService } from '../services/asignacionCajaService.ts';
import { selloService } from '../services/selloService.ts';
import { geminiService } from '../services/geminiService.ts';
import { uploadFileToDrive } from '../services/googleDriveService.ts';
import { AsignacionCajaModel } from '../types/asignacionCaja.ts';
import { SelloRecord } from '../types.ts';
import { Camera, Check, ArrowLeft, Loader2, Save, X, Box, ImageIcon, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useUploadGuard } from '../hooks/useUploadGuard.ts';
import { waitForOnline } from '../hooks/useOnlineStatus.ts';
import { UploadStatusBanner, UploadStatus } from '../components/UploadStatusBanner.tsx';

export const HandheldSellos = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [cajasDelDia, setCajasDelDia] = useState<AsignacionCajaModel[]>([]);
  const [sellosDelDia, setSellosDelDia] = useState<SelloRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Initialize date to local today YYYY-MM-DD
  const getLocalToday = () => {
    const today = new Date();
    const tzOffset = today.getTimezoneOffset() * 60000;
    return (new Date(today.getTime() - tzOffset)).toISOString().split('T')[0];
  };

  const [selectedDate, setSelectedDate] = useState<string>(getLocalToday());

  // Modal State
  const [selectedCaja, setSelectedCaja] = useState<AsignacionCajaModel | null>(null);
  const [selloValue, setSelloValue] = useState("");
  const [aiRenderKey, setAiRenderKey] = useState(0);
  const [currentImageFile, setCurrentImageFile] = useState<File | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const [replaceConfirm, setReplaceConfirm] = useState<{ caja: AsignacionCajaModel; sello: SelloRecord } | null>(null);
  const [networkWarning, setNetworkWarning] = useState<string | null>(null);

  // ── Upload state: non-blocking, fire & forget ──
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [uploadError, setUploadError]   = useState<string | undefined>(undefined);

  // Bloquea cierre del browser si hay upload activo
  useUploadGuard(uploadStatus === 'uploading' || uploadStatus === 'waiting-online');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchWithTimeout = <T,>(promise: Promise<T>, ms: number = 10000): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_EXCEEDED')), ms))
    ]);
  };

  const fetchDataForDate = async (targetDate: string) => {
    setLoading(true);
    
    // ⚡ STEP 1: Show cached data instantly (< 50ms on revisits)
    try {
      const [cachedCajas, cachedSellos] = await Promise.all([
        asignacionCajaService.getAsignacionesByDateCached(targetDate),
        selloService.getSellosByDateCached(targetDate)
      ]);
      
      if (cachedCajas.length > 0) {
        cachedCajas.sort((a, b) => {
          const tA = a.horaAsignacion || '00:00';
          const tB = b.horaAsignacion || '00:00';
          if (tA !== tB) return tA < tB ? -1 : 1;
          const opA = a.numeroOperacion || '';
          const opB = b.numeroOperacion || '';
          if (opA !== opB) return opA < opB ? -1 : 1;
          const crA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const crB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return crA - crB;
        });
        setCajasDelDia(cachedCajas);
        setSellosDelDia(cachedSellos);
        setLoading(false); // UI unblocked instantly
      }
    } catch { /* cache miss */ }

    // STEP 2: Refresh from network silently in background
    try {
      const [cajasParaFecha, sellosParaFecha] = await fetchWithTimeout(
        Promise.all([
          asignacionCajaService.getAsignacionesByDate(targetDate),
          selloService.getSellosByDate(targetDate)
        ]),
        12000 // 12 seconds max wait
      );
      
      cajasParaFecha.sort((a, b) => {
        const timeA = a.horaAsignacion || '00:00';
        const timeB = b.horaAsignacion || '00:00';
        if (timeA !== timeB) return timeA < timeB ? -1 : 1;

        const opA = a.numeroOperacion || '';
        const opB = b.numeroOperacion || '';
        if (opA !== opB) return opA < opB ? -1 : 1;

        const crA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const crB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return crA - crB;
      });
      
      setCajasDelDia(cajasParaFecha);
      setSellosDelDia(sellosParaFecha);
    } catch (e: any) {
      console.warn('fetchDataForDate error:', e.message);
      // Sin alert() bloqueante — si hay datos en caché el usuario los ve sin interrupción
      if (cajasDelDia.length === 0) {
        // Solo avisa si no hay absolutamente nada que mostrar
        setNetworkWarning(
          e.message === 'TIMEOUT_EXCEEDED'
            ? 'Señal lenta — mostrando datos en caché. Actualizará cuando haya conexión.'
            : 'Sin conexión — mostrando datos en caché.'
        );
        setTimeout(() => setNetworkWarning(null), 5000);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDataForDate(selectedDate);
  }, [selectedDate]);

  // --- IMAGE COMPRESSION UTILITY ---
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          // Increased to 1440px for OCR text readability
          const MAX_DIM = 1440;
          if (width > height) {
            if (width > MAX_DIM) { height *= MAX_DIM / width; width = MAX_DIM; }
          } else {
            if (height > MAX_DIM) { width *= MAX_DIM / height; height = MAX_DIM; }
          }
          
          canvas.width = Math.round(width);
          canvas.height = Math.round(height);
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
          
          // Higher quality (85%) for Gemini OCR accuracy
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          resolve(dataUrl);
        };
        img.onerror = (e) => reject(e);
      };
      reader.onerror = (e) => reject(e);
    });
  };

  const handleImageCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = '';

    try {
      setIsProcessingImage(true);
      
      // Compress immediately
      const compressedBase64 = await compressImage(file);
      
      // Safe base64 -> Blob conversion that doesn't trigger Call Stack limits
      const res = await fetch(compressedBase64);
      const blob = await res.blob();
      const smallFile = new File([blob], file.name, { type: 'image/jpeg' });
      setCurrentImageFile(smallFile);
      setIsProcessingImage(false); // Unblock the UI immediately - show the image preview

      // Run Gemini AI in the background without blocking
      const base64Data = compressedBase64.split(',')[1];
      geminiService.extractSelloNumber(base64Data)
        .then(extractedNumber => {
          if (extractedNumber && extractedNumber !== 'NO_DETECTADO') {
            setSelloValue(extractedNumber);
          }
        })
        .catch(aiError => {
          console.warn('Gemini no pudo extraer sello:', aiError);
          // Silent fail - user can type manually
        })
        .finally(() => {
          setAiRenderKey(k => k + 1);
        });
    } catch (e) {
      console.error(e);
      setIsProcessingImage(false);
    }
  };

  /**
   * uploadPhotoBackground — sube la foto a Drive en segundo plano (fire & forget).
   * Si no hay signal, espera sin bloquear la UI. Reintenta hasta 3 veces con back-off.
   * Actualiza el registro de Firestore con la URL real cuando termina.
   */
  const uploadPhotoBackground = useCallback(async (
    file: File,
    filename: string,
    selloId: string
  ) => {
    const FOLDER_ID = '1jBIvDIbXAP2eGFyVM3J2i5iZWjaEdO9X';
    const MAX_RETRIES = 3;

    if (!navigator.onLine) {
      setUploadStatus('waiting-online');
      await waitForOnline();
    }

    setUploadStatus('uploading');
    setUploadError(undefined);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await uploadFileToDrive(file, filename, FOLDER_ID);
        const url = result?.webViewLink || (result as any)?.url || '';
        if (url) {
          // Actualiza Firestore con la URL real — en background
          await selloService.updateSello(selloId, { fotoUrl: url });
          setSellosDelDia(prev =>
            prev.map(s => s.id === selloId ? { ...s, fotoUrl: url } : s)
          );
        }
        setUploadStatus('done');
        setTimeout(() => setUploadStatus('idle'), 3000);
        return;
      } catch (err: any) {
        console.warn(`Drive upload intento ${attempt}/${MAX_RETRIES}:`, err.message);
        setUploadError(err.message);
        if (attempt < MAX_RETRIES) {
          // Back-off exponencial: 2s, 4s, 8s
          if (!navigator.onLine) {
            setUploadStatus('waiting-online');
            await waitForOnline();
          }
          setUploadStatus('uploading');
          await new Promise(r => setTimeout(r, 2000 * attempt));
        } else {
          setUploadStatus('error');
        }
      }
    }
  }, []);

  const handleSaveSello = async () => {
    if (!selectedCaja || !selloValue.trim()) {
       alert('Por favor completa el número de sello.');
       return;
    }
    if (!user?.username && !user?.email) {
       alert('Error de sesión: No se detectó un usuario válido.');
       return;
    }

    setIsSaving(true);
    try {
      const selloExistente = getSelloForCaja(selectedCaja.id || '');

      const newSello: SelloRecord = {
        fechaAsignacion: selectedDate,
        asignacionCajaId: selectedCaja.id || '',
        numeroCaja: selectedCaja.numeroCaja,
        selloAsignado: selloValue.toUpperCase().trim(),
        usuario: user.email || user.username || 'unknown',
        fechaHoraRegistro: new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }),
        createdAt: selloExistente?.createdAt || new Date().toISOString()
      };
      // NO esperamos la foto — guardamos el registro de sello INMEDIATAMENTE
      // Pre-generamos el id para poder referenciarlo en el background upload
      let savedId: string;
      if (selloExistente && selloExistente.id) {
        await selloService.updateSello(selloExistente.id, newSello);
        savedId = selloExistente.id;
      } else {
        savedId = `sello_${selectedCaja.id}_${Date.now()}`;
        await selloService.addSello({ ...newSello, id: savedId });
      }

      // Optimistic local update
      const savedSello = { ...newSello, id: savedId };
      if (selloExistente) {
        setSellosDelDia(prev => prev.map(s => s.id === selloExistente.id ? savedSello : s));
      } else {
        setSellosDelDia(prev => [...prev, savedSello]);
      }

      setSelloValue('');
      setCurrentImageFile(null);
      setSelectedCaja(null); // cierra modal INMEDIATAMENTE

      // Upload foto en SEGUNDO PLANO si existe (fire & forget — no bloquea)
      if (currentImageFile) {
        uploadPhotoBackground(
          currentImageFile,
          `Sello de Caja ${selectedCaja.numeroCaja}`,
          savedId
        ); // sin await intencionalmente
      }

    } catch (err: any) {
      console.error(err);
      alert('Error inesperado al guardar: ' + (err.message || 'Desconocido'));
    } finally {
      setIsSaving(false);
    }
  };

  const getSelloForCaja = (cajaId: string) => {
    return sellosDelDia.find(s => s.asignacionCajaId === cajaId);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col font-sans">
      {/* Banner flotante de upload — no bloquea nada */}
      <UploadStatusBanner
        status={uploadStatus}
        error={uploadError}
        onDismiss={() => setUploadStatus('idle')}
      />
      {/* Banner de red lenta — aparece y desaparece solo, sin bloquear */}
      {networkWarning && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-white
          text-xs font-semibold px-4 py-2 flex items-center justify-between gap-2">
          <span>⚠ {networkWarning}</span>
          <button onClick={() => setNetworkWarning(null)} className="text-white/80 hover:text-white">✕</button>
        </div>
      )}
      {/* HEADER */}
      <header className="bg-slate-800 p-4 shadow-md sticky top-0 z-10 flex flex-col gap-3 border-b border-slate-700">
        <div className="flex items-center justify-between">
          <button 
            onClick={() => navigate('/m/home')}
            className="p-2 -ml-2 text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-xl font-bold tracking-tight">Asignación de Sellos</h1>
          <div className="w-8"></div> {/* Spacer for centering */}
        </div>
        
        {/* Date Selector */}
        <div className="flex items-center justify-between bg-slate-900 rounded-xl p-1 border border-slate-700">
           <input 
             type="date"
             value={selectedDate}
             onChange={(e) => setSelectedDate(e.target.value)}
             className="w-full bg-transparent text-slate-300 font-bold px-3 py-2 outline-none focus:ring-0 [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert"
           />
        </div>
      </header>

      {/* CONTENT */}
      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-48 text-blue-400">
            <Loader2 size={36} className="animate-spin mb-4" />
            <p className="font-medium animate-pulse">Cargando cajas de la fecha...</p>
          </div>
        ) : cajasDelDia.length === 0 ? (
          <div className="bg-slate-800/50 rounded-2xl p-8 border border-slate-700/50 text-center flex flex-col items-center">
             <div className="w-16 h-16 bg-slate-700/50 rounded-full flex items-center justify-center mb-4">
                 <Box size={32} className="text-slate-500" />
             </div>
             <h2 className="text-xl font-bold text-slate-300">No hay cajas asignadas</h2>
             <p className="text-slate-500 mt-2 text-sm max-w-[250px]">
               No se encontraron asignaciones terrestres para esta fecha en Master Data.
             </p>
          </div>
        ) : (
          <div className="space-y-3">
             <div className="flex justify-between items-end pb-2">
                 <h2 className="text-slate-400 text-sm font-bold uppercase tracking-wider">Cajas ({cajasDelDia.length})</h2>
                 <span className="text-xs bg-slate-800 px-2 py-1 rounded-md text-slate-300 border border-slate-700">
                     {sellosDelDia.length} Selladas
                 </span>
             </div>
             
             {cajasDelDia.map((caja, index) => {
                const selloExistente = getSelloForCaja(caja.id || "");
                const isCompleted = !!selloExistente;

                return (
                  <div 
                    key={caja.id} 
                    onClick={() => {
                        if (isCompleted && selloExistente) {
                            // Show custom confirmation popup if photo already exists
                            setReplaceConfirm({ caja, sello: selloExistente });
                            return;
                        }
                        setSelectedCaja(caja);
                        setSelloValue(selloExistente?.selloAsignado || "");
                        setCurrentImageFile(null);
                    }}
                    className={`relative overflow-hidden rounded-2xl p-4 flex flex-col gap-3 transition-colors active:scale-[0.98] ${
                        isCompleted 
                        ? 'bg-emerald-900/20 border border-emerald-800/40' 
                        : 'bg-slate-800 border-l-4 border-l-blue-500 border border-slate-700 shadow-sm'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                        <div className="flex flex-col gap-1">
                            <div className="text-2xl font-black tracking-tight text-white flex items-center gap-3 flex-wrap">
                                <span className="text-blue-400">{caja.horaAsignacion || '--:--'}</span>
                                {caja.numeroOperacion && <span className="text-pink-400">{caja.numeroOperacion}</span>}
                                <span>{caja.numeroCaja}</span>
                            </div>
                            <div className="text-sm font-medium text-slate-400 flex items-center gap-2">
                                <span>{caja.carrierCodigo || "SC"}</span> • <span>{caja.placasCaja}</span> 
                            </div>
                        </div>
                        {isCompleted ? (
                            <div className="flex gap-2">
                                {selloExistente.fotoUrl && selloExistente.fotoUrl !== 'PENDING' ? (
                                    <button
                                      type="button" 
                                      onClick={(e) => { 
                                          e.stopPropagation();
                                          // Convertimos /view a /preview para enjaularlo en el iframe sin dar opciones de navegación a Drive
                                          let safePreview = selloExistente.fotoUrl!;
                                          if (safePreview.includes('/view')) {
                                              safePreview = safePreview.replace('/view', '/preview');
                                          }
                                          setPreviewUrl(safePreview);
                                      }}
                                      className="p-2 bg-slate-800 rounded-full text-blue-400 hover:text-white border border-slate-700 hover:border-blue-500 transition-colors shadow-sm"
                                      title="Ver foto del sello"
                                    >
                                        <ImageIcon size={20} />
                                    </button>
                                ) : (
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); setSelectedCaja(caja); setSelloValue(selloExistente?.selloAsignado || ""); setCurrentImageFile(null); }}
                                      className="p-2 bg-slate-800 rounded-full text-amber-400 hover:text-white border border-slate-700 hover:border-amber-500 transition-colors shadow-sm"
                                      title="Foto pendiente — toca para agregar"
                                    >
                                        <ImageIcon size={20} />
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="bg-blue-500/10 text-blue-400 px-3 py-1.5 rounded-full ring-1 ring-blue-500/30 text-xs font-bold uppercase tracking-wider shadow-[0_0_15px_rgba(59,130,246,0.15)]">
                                Pendiente
                            </div>
                        )}
                    </div>
                    {isCompleted && (
                        <div className="mt-2 bg-slate-900/50 p-3 rounded-xl border border-emerald-800/30 flex items-center justify-between">
                            <span className="text-xs text-slate-400">SELLO ACTUAL:</span>
                            <div className="flex items-center gap-3">
                                <div className="bg-emerald-500/10 text-emerald-400 p-1.5 rounded-full ring-1 ring-emerald-500/30">
                                    <Check size={16} className="stroke-[3]" />
                                </div>
                                <span className="font-mono text-lg font-bold text-emerald-400 tracking-wider">
                                    {selloExistente.selloAsignado}
                                </span>
                            </div>
                        </div>
                    )}
                  </div>
                );
             })}
          </div>
        )}
      </main>

      {/* ── REEMPLAZO CONFIRMATION MODAL ── */}
      {replaceConfirm && (
          <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-5">
              <div className="bg-slate-900 rounded-3xl border border-amber-500/40 shadow-[0_0_40px_rgba(245,158,11,0.2)] w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
                  {/* Header */}
                  <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-5 flex items-center gap-4">
                      <div className="w-12 h-12 bg-amber-500/20 rounded-2xl flex items-center justify-center flex-shrink-0">
                          <AlertTriangle size={24} className="text-amber-400" />
                      </div>
                      <div>
                          <h3 className="text-white font-black text-lg leading-tight">¿Reemplazar Sello?</h3>
                          <p className="text-amber-300/70 text-xs mt-0.5">Esta caja ya tiene evidencia registrada</p>
                      </div>
                  </div>

                  {/* Caja info */}
                  <div className="px-6 py-5 space-y-3">
                      <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700">
                          <p className="text-slate-400 text-xs uppercase tracking-widest font-bold mb-1">Caja</p>
                          <p className="text-2xl font-black font-mono text-white">{replaceConfirm.caja.numeroCaja}</p>
                      </div>

                      <div className="bg-emerald-950/40 rounded-2xl p-4 border border-emerald-800/40">
                          <p className="text-slate-400 text-xs uppercase tracking-widest font-bold mb-1">Sello Registrado</p>
                          <p className="text-xl font-black font-mono text-emerald-400 tracking-widest">
                              {replaceConfirm.sello.selloAsignado}
                          </p>
                          {replaceConfirm.sello.fotoUrl && (
                              <div className="mt-2 flex items-center gap-2 text-xs text-emerald-500/70">
                                  <ImageIcon size={12} />
                                  <span>Foto de evidencia ya cargada en Drive</span>
                              </div>
                          )}
                          <p className="text-slate-500 text-[10px] mt-1">{replaceConfirm.sello.fechaHoraRegistro}</p>
                      </div>

                      <p className="text-amber-300/80 text-sm text-center leading-relaxed">
                          Si continúas, el sello y la foto actuales serán <span className="font-bold text-amber-300">reemplazados permanentemente</span>.
                      </p>
                  </div>

                  {/* Actions */}
                  <div className="px-6 pb-6 flex gap-3">
                      <button
                          onClick={() => setReplaceConfirm(null)}
                          className="flex-1 py-4 rounded-2xl bg-slate-800 border border-slate-700 text-slate-300 font-bold hover:bg-slate-700 transition-colors"
                      >
                          Cancelar
                      </button>
                      <button
                          onClick={() => {
                              const { caja, sello } = replaceConfirm;
                              setReplaceConfirm(null);
                              setSelectedCaja(caja);
                              setSelloValue(sello.selloAsignado || '');
                              setCurrentImageFile(null);
                          }}
                          className="flex-1 py-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-900 font-black transition-colors shadow-[0_0_20px_rgba(245,158,11,0.3)]"
                      >
                          Reemplazar
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* MODAL / POPUP DE CAPTURA */}
      {selectedCaja && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex flex-col justify-end">
              {/* Modal Content */}
              <div className="bg-slate-900 w-full rounded-t-[32px] p-6 pb-12 border-t border-slate-700 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] animate-in slide-in-from-bottom-full duration-300">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                          Asignar Sello
                      </h3>
                      <button 
                        onClick={() => {
                            setSelectedCaja(null);
                            setCurrentImageFile(null);
                        }}
                        className="p-2 bg-slate-800 rounded-full text-slate-400 hover:text-white"
                      >
                          <X size={20} />
                      </button>
                  </div>
                  
                  <div className="bg-slate-800 p-4 rounded-2xl mb-6 flex justify-between items-center border border-slate-700">
                      <span className="text-slate-400 text-sm">Caja Seleccionada</span>
                      <span className="text-xl font-black">{selectedCaja.numeroCaja}</span>
                  </div>

                  <div className="space-y-4">
                      {/* INPUT INVISIBLE (Solo usado por el label/boton visible) */}
                      <input 
                        type="file" 
                        accept="image/*" 
                        capture="environment" 
                        ref={fileInputRef}
                        onChange={handleImageCapture}
                        className="hidden" 
                        id="cameraInput"
                      />

                      {/* AREA PRINCIPAL: Botón Cámara o Input Manual */}
                      <div className="relative">
                          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block ml-1">Número de Sello</label>
                          <div className="flex gap-2">
                              <input 
                                key={`sello-input-${aiRenderKey}`}
                                type="text" 
                                value={selloValue}
                                onChange={(e) => setSelloValue(e.target.value.toUpperCase())}
                                placeholder="Escanear o escribir..."
                                className="flex-1 bg-slate-950 border-2 border-slate-700 text-white font-mono text-lg px-4 py-4 rounded-2xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all uppercase placeholder:text-slate-600"
                              />
                              <label 
                                htmlFor="cameraInput"
                                className={`flex items-center justify-center aspect-square w-16 rounded-2xl cursor-pointer transition-all ${
                                    isProcessingImage 
                                    ? 'bg-blue-600/20 text-blue-400 border-2 border-blue-500/50' 
                                    : 'bg-blue-600 text-white hover:bg-blue-500 shadow-[0_0_20px_rgba(37,99,235,0.4)]'
                                }`}
                              >
                                  {isProcessingImage ? <Loader2 size={24} className="animate-spin" /> : <Camera size={26} />}
                              </label>
                          </div>
                          
                          {isProcessingImage && (
                              <div className="absolute -bottom-6 left-2 text-xs text-blue-400 font-medium animate-pulse flex items-center gap-1">
                                  <span>Gemini extrayendo datos... (~5s)</span>
                              </div>
                          )}
                      </div>

                      {/* GUARDAR A TODO ANCHO */}
                      <button
                        onClick={handleSaveSello}
                        disabled={isSaving || isProcessingImage || !selloValue.trim()}
                        className="w-full mt-8 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold py-5 rounded-2xl shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all flex items-center justify-center gap-2 text-lg active:scale-95"
                      >
                         {isSaving ? <Loader2 size={24} className="animate-spin" /> : <Save size={24} />}
                         Confirmar y Guardar
                      </button>
                  </div>
              </div>
          </div>
      )}
      
      {/* Modal de Previsualización de Google Drive Enjaulado */}
      {previewUrl && (
            <div 
              className="fixed inset-0 z-50 bg-black/90 flex flex-col backdrop-blur-sm"
              onClick={() => setPreviewUrl(null)}
            >
                <div className="p-4 flex justify-between items-center bg-slate-900 border-b border-white/10">
                    <span className="text-white font-semibold">Evidencia (Solo Lectura)</span>
                    <button 
                        onClick={() => setPreviewUrl(null)}
                        className="bg-red-500/20 text-red-400 p-2 rounded-full hover:bg-red-500/40 transition-colors"
                    >
                        <X size={24} />
                    </button>
                </div>
                <div className="flex-1 w-full h-full p-2 bg-black flex justify-center items-center">
                    {/* El iframe con modo preview aísla el archivo del entorno de Google Drive general */}
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
