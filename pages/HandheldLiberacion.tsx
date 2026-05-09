import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { asignacionCajaService } from '../services/asignacionCajaService.ts';
import { selloService } from '../services/selloService.ts';
import { liberacionService } from '../services/liberacionService.ts';
import { geminiService } from '../services/geminiService.ts';
import { uploadFileToDrive } from '../services/googleDriveService.ts';
import { AsignacionCajaModel } from '../types/asignacionCaja.ts';
import { LiberacionRecord, SelloRecord } from '../types.ts';
import { Camera, Check, ArrowLeft, Loader2, Save, X, Box, ShieldCheck, DoorOpen, HardDrive, AlertCircle, CheckCircle, Car } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useUploadGuard } from '../hooks/useUploadGuard.ts';
import { waitForOnline } from '../hooks/useOnlineStatus.ts';
import { UploadStatusBanner, UploadStatus } from '../components/UploadStatusBanner.tsx';
import { SelloMismatchAlert } from '../components/SelloMismatchAlert.tsx';

export const HandheldLiberacion = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [cajasDelDia, setCajasDelDia] = useState<AsignacionCajaModel[]>([]);
  const [sellosDelDia, setSellosDelDia] = useState<SelloRecord[]>([]);
  const [liberacionesDelDia, setLiberacionesDelDia] = useState<LiberacionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Initialize date to local today
  const getLocalToday = () => {
    const today = new Date();
    const tzOffset = today.getTimezoneOffset() * 60000;
    return (new Date(today.getTime() - tzOffset)).toISOString().split('T')[0];
  };

  const [selectedDate, setSelectedDate] = useState<string>(getLocalToday());

  // Modal State
  const [selectedCaja, setSelectedCaja] = useState<AsignacionCajaModel | null>(null);
  
  // Progress State
  const [fotoCajaFile, setFotoCajaFile] = useState<File | null>(null);
  const [fotoPuertasFile, setFotoPuertasFile] = useState<File | null>(null);
  const [fotoSelloFile, setFotoSelloFile] = useState<File | null>(null);
  const [extractedSello, setExtractedSello] = useState<string>('');
  const [aiRenderKey, setAiRenderKey] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  
  // Flow State
  const [activeCameraStep, setActiveCameraStep] = useState<'CAJA' | 'PUERTAS' | 'SELLO' | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [networkWarning, setNetworkWarning] = useState<string | null>(null);

  // Alerta de sello cambiado
  const [mismatchAlert, setMismatchAlert] = useState<{
    numeroCaja: string;
    selloOriginal: string;
    selloLiberacion: string;
  } | null>(null);

  // ── Upload state ──
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [uploadStatusLabel, setUploadStatusLabel] = useState<string | undefined>(undefined);
  const [uploadError, setUploadError] = useState<string | undefined>(undefined);

  // Bloquea cierre del browser mientras suben las 3 evidencias
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
      const [cachedCajas, cachedSellos, cachedLiberaciones] = await Promise.all([
        asignacionCajaService.getAsignacionesByDateCached(targetDate),
        selloService.getSellosByDateCached(targetDate),
        liberacionService.getLiberacionesByDateCached(targetDate),
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
        setLiberacionesDelDia(cachedLiberaciones);
        setLoading(false); // Show immediately — don't wait for network
      }
    } catch { /* cache miss — spinner stays visible */ }

    // STEP 2: Refresh from network silently in background
    try {
      const [cajasParaFecha, sellosParaFecha, liberacionesParaFecha] = await fetchWithTimeout(
        Promise.all([
          asignacionCajaService.getAsignacionesByDate(targetDate),
          selloService.getSellosByDate(targetDate),
          liberacionService.getLiberacionesByDate(targetDate)
        ]),
        12000
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
      setLiberacionesDelDia(liberacionesParaFecha);
    } catch (e: any) {
      console.warn('fetchDataForDate error:', e.message);
      // Sin alert() bloqueante — datos del caché siguen visibles
      if (cajasDelDia.length === 0) {
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

          // Increased from 800px to 1440px for OCR accuracy
          const MAX_WIDTH = 1440;
          const MAX_HEIGHT = 1440;

          if (width > height) {
            if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
          } else {
            if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
          }

          canvas.width = Math.round(width);
          canvas.height = Math.round(height);

          const ctx = canvas.getContext('2d');
          if (!ctx) { reject(new Error("Failed to get canvas context")); return; }

          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          // Higher quality (85%) for Gemini OCR accuracy
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.85);
          resolve(compressedBase64);
        };
        img.onerror = (e) => reject(new Error("Failed to load image"));
      };
      reader.onerror = (e) => reject(new Error("Failed to read file"));
    });
  };

  const base64ToFile = (base64String: string, originalName: string): File => {
    const arr = base64String.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], originalName, { type: mime });
  };

  const handleCaptureFile = async (e: React.ChangeEvent<HTMLInputElement>, step: 'CAJA' | 'PUERTAS' | 'SELLO') => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Clear input so same file can be captured sequentially
    e.target.value = '';

    setActiveCameraStep(step);

    setIsProcessingImage(true);

    try {
      // 1. Compress Image
      const compressedBase64 = await compressImage(file);
      const res = await fetch(compressedBase64);
      const blob = await res.blob();
      const compressedFile = new File([blob], `compressed_${file.name}`, { type: 'image/jpeg' });

      // 2. Set State based on Step - unblock UI immediately
      if (step === 'CAJA') {
        setFotoCajaFile(compressedFile);
        setIsProcessingImage(false);
      } else if (step === 'PUERTAS') {
        setFotoPuertasFile(compressedFile);
        setIsProcessingImage(false);
      } else if (step === 'SELLO') {
        setFotoSelloFile(compressedFile);
        setExtractedSello("Analizando...");
        setIsProcessingImage(false); // Unblock UI
        
        // Run Gemini in background without blocking
        const base64Data = compressedBase64.split(',')[1];
        geminiService.extractSelloNumber(base64Data)
          .then(result => {
            if (result && result.trim() !== 'NO_DETECTADO' && result.trim().length > 0) {
              setExtractedSello(result.trim());
              setValidationError(null);
            } else {
              setExtractedSello('');
              // Fallback silencioso igual que Asignacion:
              // Simplemente dejamos el input vacio para que el usuario teclee.
            }
          })
          .catch(() => {
            setExtractedSello('');
            // Fallback silencioso igual que Asignacion
          })
          .finally(() => {
            // Force mobile WebView paint cycle
            setAiRenderKey(k => k + 1);
          });
      }

    } catch (err: any) {
      console.error("Error comprimiendo foto:", err);
      alert("No se pudo procesar la foto.");
      setIsProcessingImage(false);
    } finally {
      setActiveCameraStep(null);
    }
  };

  /**
   * uploadEvidenciasBackground — sube las 3 fotos a Drive en paralelo, en segundo plano.
   * Espera signal si está offline. Reintenta hasta 3 veces con back-off.
   * Actualiza el registro de Firestore con las URLs reales cuando termina.
   */
  const uploadEvidenciasBackground = useCallback(async (
    cajaFile: File,
    puertasFile: File,
    selloFile: File,
    liberacionId: string,
    numeroCaja: string
  ) => {
    const FOLDER_ID = '1jBIvDIbXAP2eGFyVM3J2i5iZWjaEdO9X';
    const MAX_RETRIES = 3;

    if (!navigator.onLine) {
      setUploadStatus('waiting-online');
      setUploadStatusLabel('Sin señal — esperando conexión para subir 3 evidencias...');
      await waitForOnline();
    }

    setUploadStatus('uploading');
    setUploadStatusLabel('Subiendo 3 evidencias a Drive...');
    setUploadError(undefined);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const ts = Date.now();
        const [cajaRes, puertasRes, selloRes] = await Promise.all([
          // Bug Fix #1: filenames con extensión .jpg y timestamp único para que Drive detecte MIME type
          uploadFileToDrive(cajaFile,    `lib_${numeroCaja}_CAJA_${ts}.jpg`,    FOLDER_ID),
          uploadFileToDrive(puertasFile, `lib_${numeroCaja}_PUERTAS_${ts}.jpg`, FOLDER_ID),
          uploadFileToDrive(selloFile,   `lib_${numeroCaja}_SELLO_${ts}.jpg`,   FOLDER_ID),
        ]);
        const cajaUrl    = cajaRes?.webViewLink    || (cajaRes    as any)?.url || '';
        const puertasUrl = puertasRes?.webViewLink  || (puertasRes as any)?.url || '';
        const selloUrl   = selloRes?.webViewLink    || (selloRes   as any)?.url || '';

        // Bug Fix #3: Si el GAS no devuelve URL, loguear y reportar error — no guardar silencioso
        if (!cajaUrl || !puertasUrl || !selloUrl) {
          console.error('[Drive] Una o más fotos no retornaron URL:', { cajaUrl, puertasUrl, selloUrl });
          setUploadError('Drive respondió pero sin URLs. Verifica el GAS script.');
          setUploadStatus('error');
          return;
        }

        // Actualiza Firestore con las URLs reales
        await liberacionService.updateLiberacion(liberacionId, {
          fotos: { cajaUrl, puertasUrl, selloUrl },
          uploadStatus: 'done',
        } as any);

        // Actualiza optimistic local state
        setLiberacionesDelDia(prev =>
          prev.map(l => l.id === liberacionId
            ? { ...l, fotos: { cajaUrl, puertasUrl, selloUrl } }
            : l
          )
        );

        setUploadStatus('done');
        setUploadStatusLabel('3 evidencias subidas correctamente ✔');
        setTimeout(() => setUploadStatus('idle'), 4000);
        return;
      } catch (err: any) {
        console.warn(`Drive upload intento ${attempt}/${MAX_RETRIES}:`, err.message);
        setUploadError(err.message);
        if (attempt < MAX_RETRIES) {
          if (!navigator.onLine) {
            setUploadStatus('waiting-online');
            setUploadStatusLabel('Sin señal — reintentando cuando haya conexión...');
            await waitForOnline();
          }
          setUploadStatus('uploading');
          setUploadStatusLabel(`Reintentando subida (intento ${attempt + 1}/${MAX_RETRIES})...`);
          await new Promise(r => setTimeout(r, 2000 * attempt));
        } else {
          setUploadStatus('error');
          setUploadStatusLabel('Error subiendo evidencias — las URLs quedarán pendientes.');
        }
      }
    }
  }, []);

  // --- VALIDATION AND SAVE ---
  const handleCierreCaja = async () => {
    if (!selectedCaja) return;
    if (!fotoCajaFile || !fotoPuertasFile || !fotoSelloFile) {
      setValidationError('Aún faltan evidencias por capturar.');
      return;
    }
    if (!extractedSello || extractedSello.trim().length < 3) {
      setValidationError('El sello extraído es inválido o muy corto.');
      return;
    }

    setValidationError(null);
    setIsSaving(true);

    try {
      // 1. Valida sello en Firebase
      const assignedSelloRecord = sellosDelDia.find(s => s.numeroCaja === selectedCaja.numeroCaja);
      if (!assignedSelloRecord) {
        throw new Error('⛔ ALERTA: Esta caja NO TIENE NINGÚN SELLO REGISTRADO para el día de hoy. No se puede liberar.');
      }
      if (assignedSelloRecord.selloAsignado !== extractedSello.trim().toUpperCase()) {
        throw new Error(`⛔ ALERTA CRÍTICA: ¡Descuadre de Sello!\n\nSello de Salida: [${assignedSelloRecord.selloAsignado}]\nSello Escaneado Físicamente: [${extractedSello.toUpperCase().trim()}]\n\nPor seguridad, no se puede cerrar la caja. Verifique error y/o escale al responsable del area.`);
      }

      // 2. Guarda el registro de liberación INMEDIATAMENTE con fotos=PENDING
      // La operación queda registrada, las URLs se rellenan en background
      const selloFinal = extractedSello.toUpperCase().trim();
      const selloInicial = assignedSelloRecord.selloAsignado;
      const selloCoincide = selloInicial === selloFinal;

      const liberacionId = `lib_${selectedCaja.id}_${Date.now()}`;
      const newLiberacion: LiberacionRecord = {
        id: liberacionId,
        fechaLiberacion: selectedDate,
        asignacionCajaId: selectedCaja.id || '',
        numeroCaja: selectedCaja.numeroCaja,
        selloValidado: selloFinal,
        coincideConOriginal: selloCoincide,
        usuario: user.email || user.username || 'unknown',
        fechaHoraRegistro: new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }),
        fotos: { cajaUrl: 'PENDING', puertasUrl: 'PENDING', selloUrl: 'PENDING' },
        createdAt: new Date().toISOString(),
      };

      await liberacionService.addLiberacion(newLiberacion);

      // Optimistic update local
      setLiberacionesDelDia(prev => [...prev, newLiberacion]);
      setSaveSuccess(true);

      // 3. Si los sellos no coinciden → mostrar alerta crítica ANTES de cerrar el modal
      if (!selloCoincide) {
        setMismatchAlert({
          numeroCaja: selectedCaja.numeroCaja,
          selloOriginal: selloInicial,
          selloLiberacion: selloFinal,
        });
      } else {
        // Solo cerrar automáticamente si todo está bien
        setTimeout(() => closeModal(), 2500);
      }

      // 4. Sube las 3 fotos en SEGUNDO PLANO (fire & forget)
      const cajaSnap    = fotoCajaFile;
      const puertasSnap = fotoPuertasFile;
      const selloSnap   = fotoSelloFile;
      uploadEvidenciasBackground(cajaSnap, puertasSnap, selloSnap, liberacionId, selectedCaja.numeroCaja);
      // sin await intencionalmente — no bloquea el cierre del modal

    } catch (e: any) {
      setValidationError(e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const closeModal = () => {
      setSelectedCaja(null);
      setFotoCajaFile(null);
      setFotoPuertasFile(null);
      setFotoSelloFile(null);
      setExtractedSello('');
      setValidationError(null);
      setSaveSuccess(false);
      setActiveCameraStep(null);
      setMismatchAlert(null);
  };

  // Helper check
  const getLiberacionForCaja = (cajaId: string) => liberacionesDelDia.find(l => l.asignacionCajaId === cajaId);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col font-sans">
      {/* Banner de red lenta — barra delgada que desaparece sola, sin popup */}
      {networkWarning && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-white
          text-xs font-semibold px-4 py-2 flex items-center justify-between gap-2">
          <span>⚠ {networkWarning}</span>
          <button onClick={() => setNetworkWarning(null)} className="text-white/80 hover:text-white">✕</button>
        </div>
      )}
      <UploadStatusBanner
        status={uploadStatus}
        label={uploadStatusLabel}
        error={uploadError}
        onDismiss={() => setUploadStatus('idle')}
      />
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 p-4 sticky top-0 z-10 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/m/home')} className="p-2 -ml-2 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <ShieldCheck className="text-emerald-500" /> Liberación (Handheld)
            </h1>
            <p className="text-xs text-slate-400 font-mono flex items-center gap-1 mt-0.5"><HardDrive size={10}/> Cierre Operativo</p>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-slate-900 border-b border-slate-800 p-4 sticky top-[68px] z-[9]">
          <div className="flex items-center justify-between bg-slate-800 rounded-xl p-1 border border-slate-700">
             <input 
               type="date"
               value={selectedDate}
               onChange={(e) => setSelectedDate(e.target.value)}
               className="w-full bg-transparent text-slate-300 font-bold px-3 py-2 outline-none focus:ring-0 [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert"
             />
          </div>
      </div>

      {/* Main List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-24">
        {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                <Loader2 className="animate-spin mb-4" size={32} />
                <p>Consultando Cajas Asignadas...</p>
            </div>
        ) : cajasDelDia.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500 text-center px-4 border border-dashed border-slate-800 rounded-2xl bg-slate-900/30">
                <Box size={48} className="mb-4 opacity-50" />
                <p className="font-medium text-lg text-slate-400">Sin Movimientos</p>
                <p className="text-sm mt-1">No hay cajas asignadas en plataforma para esta fecha.</p>
            </div>
        ) : (
            cajasDelDia.map((caja, index) => {
                const lib = getLiberacionForCaja(caja.id!);
                const yaLiberada = !!lib;
                // Also check if it even has a Sello
                const tieneSello = sellosDelDia.some(s => s.numeroCaja === caja.numeroCaja);
                
                return (
                    <div 
                        key={caja.id} 
                        onClick={() => {
                          if (yaLiberada) return; // Ya está cerrada, maybe visualización
                          setSelectedCaja(caja)
                        }}
                        className={`p-4 rounded-xl border relative overflow-hidden transition-all active:scale-[0.98] ${
                            yaLiberada 
                            ? 'bg-emerald-950/20 border-emerald-900/50 opacity-80' 
                            : tieneSello 
                                ? 'bg-slate-800/80 border-slate-700 shadow-lg cursor-pointer' 
                                : 'bg-slate-900/50 border-slate-800 opacity-60 cursor-not-allowed'
                        }`}
                    >
                        {yaLiberada && (
                            <div className="absolute top-0 right-0 bg-emerald-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg flex items-center gap-1 shadow-sm">
                                <CheckCircle size={12} /> LIBERADA
                            </div>
                        )}
                        {!yaLiberada && !tieneSello && (
                            <div className="absolute top-0 right-0 bg-amber-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg shadow-sm">
                                SIN SELLO PUESTO
                            </div>
                        )}
                        
                        <div className="text-3xl font-black font-mono text-white tracking-widest leading-none mb-3 flex items-center gap-3 flex-wrap">
                            <span className="text-blue-400">{caja.horaAsignacion || '--:--'}</span>
                            {caja.numeroOperacion && <span className="text-pink-400">{caja.numeroOperacion}</span>}
                            <span>{caja.numeroCaja}</span>
                        </div>
                        <div className="flex gap-2">
                             <span className="bg-amber-900/30 text-amber-500/90 text-xs px-2.5 py-1 rounded-md font-medium border border-amber-800/50 truncate">
                                {caja.transportista}
                             </span>
                        </div>
                        
                        {yaLiberada && (
                            <div className="mt-3 bg-emerald-900/30 p-2.5 rounded-lg border border-emerald-800/50 flex flex-col gap-1">
                                 <div className="flex items-center justify-between">
                                     <span className="text-[10px] text-emerald-400 uppercase font-bold tracking-widest">Sello Validado</span>
                                     <div className="flex items-center gap-2">
                                         <button
                                            type="button" 
                                            onClick={(e) => { 
                                                e.stopPropagation();
                                                // Bug Fix #2 & #4: Ignorar URL si es 'PENDING' o vacía
                                                const url = lib.fotos?.cajaUrl;
                                                if (url && url !== 'PENDING') setPreviewUrl(url.replace('/view', '/preview'));
                                            }}
                                            className={`p-2.5 bg-slate-800 rounded-xl border transition-colors ${
                                              lib.fotos?.cajaUrl && lib.fotos.cajaUrl !== 'PENDING'
                                                ? 'text-blue-400 hover:text-white border-slate-700 hover:border-blue-500'
                                                : 'text-slate-600 border-slate-800 cursor-not-allowed opacity-40'
                                            }`}
                                            title={lib.fotos?.cajaUrl === 'PENDING' ? 'Foto subiendo...' : 'Ver foto Caja/Placas'}
                                            disabled={!lib.fotos?.cajaUrl || lib.fotos.cajaUrl === 'PENDING'}
                                          >
                                              <Car size={28} />
                                          </button>
                                          <button
                                            type="button" 
                                            onClick={(e) => { 
                                                e.stopPropagation();
                                                const url = lib.fotos?.puertasUrl;
                                                if (url && url !== 'PENDING') setPreviewUrl(url.replace('/view', '/preview'));
                                            }}
                                            className={`p-2.5 bg-slate-800 rounded-xl border transition-colors ${
                                              lib.fotos?.puertasUrl && lib.fotos.puertasUrl !== 'PENDING'
                                                ? 'text-orange-400 hover:text-white border-slate-700 hover:border-orange-500'
                                                : 'text-slate-600 border-slate-800 cursor-not-allowed opacity-40'
                                            }`}
                                            title={lib.fotos?.puertasUrl === 'PENDING' ? 'Foto subiendo...' : 'Ver foto Puertas'}
                                            disabled={!lib.fotos?.puertasUrl || lib.fotos.puertasUrl === 'PENDING'}
                                          >
                                              <DoorOpen size={28} />
                                          </button>
                                          <button
                                            type="button" 
                                            onClick={(e) => { 
                                                e.stopPropagation();
                                                const url = lib.fotos?.selloUrl;
                                                if (url && url !== 'PENDING') setPreviewUrl(url.replace('/view', '/preview'));
                                            }}
                                            className={`p-2.5 bg-slate-800 rounded-xl border transition-colors ${
                                              lib.fotos?.selloUrl && lib.fotos.selloUrl !== 'PENDING'
                                                ? 'text-emerald-400 hover:text-white border-slate-700 hover:border-emerald-500'
                                                : 'text-slate-600 border-slate-800 cursor-not-allowed opacity-40'
                                            }`}
                                            title={lib.fotos?.selloUrl === 'PENDING' ? 'Foto subiendo...' : 'Ver foto Sello Asignado'}
                                            disabled={!lib.fotos?.selloUrl || lib.fotos.selloUrl === 'PENDING'}
                                          >
                                              <ShieldCheck size={28} />
                                          </button>
                                     </div>
                                 </div>
                                 <div className="font-mono text-lg text-white font-bold">{lib.selloValidado}</div>
                                 <span className="text-[10px] text-emerald-500/70 border-t border-emerald-800/50 pt-1 mt-1 block">{lib.fechaHoraRegistro}</span>
                            </div>
                        )}
                    </div>
                )
            })
        )}
      </div>

      {/* CAJA WIZARD MODAL */}
      {selectedCaja && (
          <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col">
              {/* Toolbar Modal */}
              <div className="bg-slate-900 border-b border-slate-800 p-4 sticky top-0 z-10 flex items-center justify-between shadow-md">
                <div className="flex items-center gap-3">
                  <button onClick={closeModal} disabled={isSaving} className="p-2 -ml-2 rounded-full hover:bg-slate-800 text-slate-400 transition-colors">
                    <X size={24} />
                  </button>
                  <h1 className="text-xl font-bold text-white">Liberación</h1>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-5 pb-32">
                 <div className="bg-slate-900 rounded-xl p-4 border border-slate-800 mb-6 shadow-sm">
                    <span className="text-xs text-slate-500 font-bold tracking-widest uppercase mb-1 block">Procesando Caja</span>
                    <div className="text-4xl font-black font-mono text-white tracking-widest">{selectedCaja.numeroCaja}</div>
                 </div>

                 {/* Error Bubble */}
                 {validationError && (
                    <div className="mb-6 bg-red-950/70 border border-red-500/50 p-4 rounded-xl flex items-start gap-3 shadow-lg shadow-red-900/20">
                        <AlertCircle className="text-red-400 shrink-0 mt-0.5" />
                        <div className="text-sm text-red-200 whitespace-pre-wrap font-medium">{validationError}</div>
                    </div>
                 )}

                 {saveSuccess && (
                    <div className="mb-6 bg-emerald-900 border border-emerald-500 p-4 rounded-xl flex flex-col items-center justify-center text-center shadow-lg shadow-emerald-900/20 py-8">
                        <CheckCircle size={48} className="text-emerald-400 mb-3" />
                        <h2 className="text-xl font-bold text-white mb-1">¡Caja Liberada!</h2>
                        <p className="text-emerald-200/70 text-sm">Validación biométrica cruzada completada exitosamente.</p>
                    </div>
                 )}

                 {/* FOTOGRAFÍAS */}
                 {!saveSuccess && (
                     <div className="space-y-4">
                         {/* FOTO CAJA */}
                         <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden p-4 relative">
                             <div className="flex justify-between items-center mb-3">
                                <div className="flex items-center gap-2 text-sm font-bold text-slate-300">
                                   <Car size={18} className="text-blue-400"/> 1. Foto de Placas/Caja
                                </div>
                             </div>
                             <input 
                                type="file" 
                                accept="image/*" 
                                capture="environment" 
                                id="camera-caja"
                                onChange={(e) => handleCaptureFile(e, 'CAJA')}
                                className="hidden" 
                             />
                             <label
                                htmlFor="camera-caja"
                                className={`w-full py-4 rounded-xl cursor-pointer flex items-center justify-center gap-2 font-semibold transition-all shadow-sm ${
                                    fotoCajaFile 
                                       ? 'bg-blue-900/30 text-blue-400 border border-blue-800/50' 
                                       : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-900/20'
                                } ${(isProcessingImage || isSaving) ? 'opacity-50 pointer-events-none' : ''}`}
                             >
                                 <Camera size={20} />
                                 {fotoCajaFile ? 'Tomar Nueva Foto' : 'Abrir Cámara'}
                             </label>
                         </div>

                         {/* FOTO PUERTAS */}
                         <div className={`bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden p-4 relative transition-all ${!fotoCajaFile ? 'opacity-50 grayscale pointer-events-none' : ''}`}>
                             <div className="flex justify-between items-center mb-3">
                                <div className="flex items-center gap-2 text-sm font-bold text-slate-300">
                                   <DoorOpen size={18} className="text-orange-400"/> 2. Foto de Puertas
                                </div>
                             </div>
                             <input 
                                type="file" 
                                accept="image/*" 
                                capture="environment" 
                                id="camera-puertas"
                                onChange={(e) => handleCaptureFile(e, 'PUERTAS')}
                                className="hidden" 
                             />
                             <label
                                htmlFor="camera-puertas"
                                className={`w-full py-4 rounded-xl cursor-pointer flex items-center justify-center gap-2 font-semibold transition-all shadow-sm ${
                                    fotoPuertasFile 
                                       ? 'bg-orange-900/30 text-orange-400 border border-orange-800/50' 
                                       : 'bg-orange-600 hover:bg-orange-500 text-white shadow-orange-900/20'
                                } ${(isProcessingImage || isSaving) ? 'opacity-50 pointer-events-none' : ''}`}
                             >
                                 <Camera size={20} />
                                 {fotoPuertasFile ? 'Tomar Nueva Foto' : 'Abrir Cámara'}
                             </label>
                         </div>

                         {/* FOTO SELLO & ANALISIS */}
                         <div className={`bg-slate-900 border border-slate-800 rounded-2xl p-4 transition-all ${(!fotoCajaFile || !fotoPuertasFile) ? 'opacity-50 grayscale pointer-events-none' : ''}`}>
                             <div className="flex justify-between items-center mb-3">
                                <div className="flex items-center gap-2 text-sm font-bold text-slate-300">
                                   <ShieldCheck size={18} className="text-emerald-400"/> 3. Foto de Sello Físico
                                </div>
                             </div>
                             <input 
                                type="file" 
                                accept="image/*" 
                                capture="environment" 
                                id="camera-sello"
                                onChange={(e) => handleCaptureFile(e, 'SELLO')}
                                className="hidden" 
                             />
                             <label
                                htmlFor="camera-sello"
                                className={`w-full py-4 rounded-xl cursor-pointer flex items-center justify-center gap-2 font-semibold transition-all shadow-sm mb-4 ${
                                    fotoSelloFile 
                                       ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-800/50' 
                                       : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/20'
                                } ${(isProcessingImage || isSaving) ? 'opacity-50 pointer-events-none' : ''}`}
                             >
                                 {isProcessingImage && activeCameraStep === 'SELLO' ? (
                                     <><Loader2 size={20} className="animate-spin" /> Analizando Sello con IA...</>
                                 ) : fotoSelloFile ? (
                                     <><Camera size={20} /> Tomar Nueva Foto de Sello</>
                                 ) : (
                                     <><Camera size={20} /> Capturar y Extraer Sello</>
                                 )}
                             </label>

                             {fotoSelloFile && (
                                <div className="animate-in fade-in slide-in-from-top-4 duration-300 mt-2 bg-slate-950 p-4 rounded-xl border border-slate-800 shadow-inner">
                                    <label className="text-xs text-emerald-500 font-bold tracking-widest uppercase mb-2 block">
                                        REVISIÓN DE SELLO EXTRAÍDO
                                    </label>
                                    <input
                                        key={`sello-input-${aiRenderKey}`}
                                        type="text"
                                        value={extractedSello}
                                        onChange={(e) => setExtractedSello(e.target.value.toUpperCase())}
                                        className="w-full bg-black border border-slate-700 rounded-lg p-4 text-2xl font-mono text-center font-bold text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                                        placeholder="A-123456"
                                        disabled={isSaving}
                                    />
                                    <span className="text-[10px] text-slate-500 text-center block mt-2">Corrija manualmente si la Inteligencia Artificial erró algún carácter.</span>
                                </div>
                             )}
                         </div>

                     </div>
                 )}
              </div>

              {/* FOOTER ACTIONS */}
              {!saveSuccess && (
                  <div className="bg-slate-900 border-t border-slate-800 p-4 pb-8 sticky bottom-0 z-20 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
                      <button
                        onClick={handleCierreCaja}
                        disabled={isSaving || !fotoCajaFile || !fotoPuertasFile || !fotoSelloFile || !extractedSello}
                        className={`w-full py-5 rounded-2xl flex items-center justify-center gap-3 font-bold text-lg transition-all ${
                          (!fotoCajaFile || !fotoPuertasFile || !fotoSelloFile || !extractedSello)
                          ? 'bg-slate-800 text-slate-500 cursor-not-allowed shadow-none border border-slate-700'
                          : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20 shadow-xl'
                        }`}
                      >
                        {isSaving ? (
                            <><Loader2 className="animate-spin" size={24} /> Validando Cruce Operativo...</>
                        ) : (
                            <><Save size={24} /> Cierre de Caja Definitivo</>
                        )}
                      </button>
                      <div className="text-center mt-3 text-xs text-slate-500 flex items-center justify-center gap-1.5 font-medium">
                           <HardDrive size={12} className="opacity-70"/> El cierre validará el sello contra servidor y subirá fotos de evidencia a Drive.
                      </div>
                  </div>
              )}
          </div>
      )}

      {/* Modal de Previsualización de Google Drive Enjaulado (Auditoría) */}
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
                    <iframe 
                      src={previewUrl}
                      className="w-full h-full max-w-4xl max-h-[85vh] rounded-lg bg-slate-800"
                      allow="autoplay"
                      sandbox="allow-scripts allow-same-origin"
                    />
                </div>
            </div>
      )}

      {/* Alerta crítica de sello cambiado */}
      <SelloMismatchAlert
        isOpen={!!mismatchAlert}
        numeroCaja={mismatchAlert?.numeroCaja || ''}
        selloOriginal={mismatchAlert?.selloOriginal || ''}
        selloLiberacion={mismatchAlert?.selloLiberacion || ''}
        onClose={() => {
          setMismatchAlert(null);
          closeModal();
        }}
      />
    </div>
  );
};
