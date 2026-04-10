import React, { useEffect, useState, useRef } from 'react';
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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  
  // Flow State
  const [activeCameraStep, setActiveCameraStep] = useState<'CAJA' | 'PUERTAS' | 'SELLO' | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchWithTimeout = <T,>(promise: Promise<T>, ms: number = 10000): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_EXCEEDED')), ms))
    ]);
  };

  const fetchDataForDate = async (targetDate: string) => {
    setLoading(true);
    try {
      const [cajasParaFecha, sellosParaFecha, liberacionesParaFecha] = await fetchWithTimeout(
        Promise.all([
          asignacionCajaService.getAsignacionesByDate(targetDate),
          selloService.getSellosByDate(targetDate),
          liberacionService.getLiberacionesByDate(targetDate)
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
      setLiberacionesDelDia(liberacionesParaFecha);
    } catch (e: any) {
      console.error("Error fetching data", e);
      if (e.message === 'TIMEOUT_EXCEEDED') {
          alert('La conexión de internet es muy lenta o inestable. Intente moverse a un área con mejor señal y recargue la página.');
      } else {
          alert('Hubo un problema al consultar la base de datos. Verifique su red.');
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

          // Reduced to 800px for handheld performance
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 800;

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
          // Lower quality 60% - faster upload on handheld
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6);
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

  // --- CAMERA FLOW ---
  const handleLaunchCamera = (step: 'CAJA' | 'PUERTAS' | 'SELLO') => {
    setActiveCameraStep(step);
    if (fileInputRef.current) {
        fileInputRef.current.value = ""; // Reset value so onChange triggers even for same file
        fileInputRef.current.click();
    }
  };

  const handleCaptureFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeCameraStep) return;
    if (fileInputRef.current) fileInputRef.current.value = '';

    setIsProcessingImage(true);

    try {
      // 1. Compress Image
      const compressedBase64 = await compressImage(file);
      const byteArray = Uint8Array.from(atob(compressedBase64.split(',')[1]), c => c.charCodeAt(0));
      const compressedFile = new File([byteArray], `compressed_${file.name}`, { type: 'image/jpeg' });

      // 2. Set State based on Step - unblock UI immediately
      if (activeCameraStep === 'CAJA') {
        setFotoCajaFile(compressedFile);
        setIsProcessingImage(false);
      } else if (activeCameraStep === 'PUERTAS') {
        setFotoPuertasFile(compressedFile);
        setIsProcessingImage(false);
      } else if (activeCameraStep === 'SELLO') {
        setFotoSelloFile(compressedFile);
        setExtractedSello("Analizando...");
        setIsProcessingImage(false); // Unblock UI
        
        // Run Gemini in background without blocking
        const base64Data = compressedBase64.split(',')[1];
        geminiService.extractSelloNumber(base64Data)
          .then(result => {
            if (result && result.trim().length > 0) {
              setExtractedSello(result.trim());
            } else {
              setExtractedSello('');
              setValidationError("No se pudo detectar el sello. Escríbalo manualmente.");
            }
          })
          .catch(() => {
            setExtractedSello('');
            setValidationError("IA no disponible. Escriba el sello manualmente.");
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

  // --- VALIDATION AND SAVE ---
  const handleCierreCaja = async () => {
    if (!selectedCaja) return;
    if (!fotoCajaFile || !fotoPuertasFile || !fotoSelloFile) {
      setValidationError("Aún faltan evidencias por capturar.");
      return;
    }
    if (!extractedSello || extractedSello.trim().length < 3) {
      setValidationError("El sello extraído es inválido o muy corto.");
      return;
    }

    setValidationError(null);
    setIsSaving(true);

    try {
      // 1. Validate Sello in Firebase
      // Find the recorded sello assigned to this particular Caja on this selectedDate
      const assignedSelloRecord = sellosDelDia.find(s => s.numeroCaja === selectedCaja.numeroCaja);
      if (!assignedSelloRecord) {
        throw new Error("⛔ ALERTA: Esta caja NO TIENE NINGÚN SELLO REGISTRADO para el día de hoy. No se puede liberar.");
      }

      if (assignedSelloRecord.selloAsignado !== extractedSello.trim().toUpperCase()) {
        throw new Error(`⛔ ALERTA CRÍTICA: ¡Descuadre de Sello!\n\nSello de Salida: [${assignedSelloRecord.selloAsignado}]\nSello Escaneado Físicamente: [${extractedSello.toUpperCase().trim()}]\n\nPor seguridad, no se puede cerrar la caja. Verifique error y/o escale al responsable del area.`);
      }

      // 2. Validation Passed. Upload 3 photos in PARALLEL to Google Drive
      const FOLDER_ID = "1jBIvDIbXAP2eGFyVM3J2i5iZWjaEdO9X";
      let cajaUrl = "";
      let puertasUrl = "";
      let selloUrl = "";

      try {
          // ⚡ Parallel upload — 3x faster than sequential
          const [cajaRes, puertasRes, selloRes] = await Promise.all([
              uploadFileToDrive(fotoCajaFile,   `Liberacion_${selectedCaja.numeroCaja}_CAJA`,    FOLDER_ID),
              uploadFileToDrive(fotoPuertasFile, `Liberacion_${selectedCaja.numeroCaja}_PUERTAS`, FOLDER_ID),
              uploadFileToDrive(fotoSelloFile,   `Liberacion_${selectedCaja.numeroCaja}_SELLO`,   FOLDER_ID),
          ]);

          cajaUrl    = cajaRes?.webViewLink    || (cajaRes    as any)?.url || "";
          puertasUrl = puertasRes?.webViewLink  || (puertasRes as any)?.url || "";
          selloUrl   = selloRes?.webViewLink    || (selloRes   as any)?.url || "";
      } catch (driveErr: any) {
          console.error("Error subiendo evidencias a Drive:", driveErr);
          throw new Error("Error en Drive: " + driveErr.message + "\n\nLa caja NO fue liberada. Reintente presionar Cierre de Caja.");
      }

      if (!cajaUrl || !puertasUrl || !selloUrl) {
          throw new Error("No se obtuvieron todas las URLs de Google Drive. Abortando cierre.");
      }

      // 3. Save Final Record in Database
      const newLiberacion: LiberacionRecord = {
        fechaLiberacion: selectedDate,
        asignacionCajaId: selectedCaja.id || "",
        numeroCaja: selectedCaja.numeroCaja,
        selloValidado: extractedSello.toUpperCase().trim(),
        coincideConOriginal: true,
        usuario: user.email || user.username || 'unknown',
        fechaHoraRegistro: new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }),
        fotos: {
            cajaUrl,
            puertasUrl,
            selloUrl
        },
        createdAt: new Date().toISOString()
      };

      await liberacionService.addLiberacion(newLiberacion);

      // Optimistic local update - no need to reload full list
      setLiberacionesDelDia(prev => [...prev, { ...newLiberacion, id: `temp_${Date.now()}` }]);
      setSaveSuccess(true);

      // Auto-close modal after 3 seconds
      setTimeout(() => {
        closeModal();
      }, 3000);


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
  };

  // Helper check
  const getLiberacionForCaja = (cajaId: string) => liberacionesDelDia.find(l => l.asignacionCajaId === cajaId);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col font-sans">
      <input 
        type="file" 
        accept="image/*" 
        capture="environment" 
        ref={fileInputRef} 
        onChange={handleCaptureFile}
        className="hidden" 
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
                             <span className="bg-slate-700/50 text-slate-300 text-xs px-2.5 py-1 rounded-md font-medium border border-slate-600/50 shrink-0">
                                ECO {caja.tracto}
                             </span>
                             <span className="bg-amber-900/30 text-amber-500/90 text-xs px-2.5 py-1 rounded-md font-medium border border-amber-800/50 truncate">
                                {caja.transportista}
                             </span>
                        </div>
                        
                        {yaLiberada && (
                            <div className="mt-3 bg-emerald-900/30 p-2.5 rounded-lg border border-emerald-800/50 flex flex-col gap-1">
                                 <span className="text-[10px] text-emerald-400 uppercase font-bold tracking-widest">Sello Validado</span>
                                 <div className="font-mono text-lg text-white font-bold">{lib.selloValidado}</div>
                                 <span className="text-[10px] text-emerald-500/70 border-t border-emerald-800/50 pt-1 mt-1 block">{lib.fechaHoraRegistro}</span>
                                 
                                 {/* BOTONES DE AUDITORÍA */}
                                 <div className="flex items-center gap-2 mt-2 pt-2 border-t border-emerald-800/30">
                                     <span className="text-[10px] text-emerald-500/80 uppercase font-bold tracking-widest flex-1">Evidencias:</span>
                                     <button
                                        type="button" 
                                        onClick={(e) => { 
                                            e.stopPropagation();
                                            if (lib.fotos?.cajaUrl) setPreviewUrl(lib.fotos.cajaUrl.replace('/view', '/preview'));
                                        }}
                                        className="p-1.5 bg-slate-800 rounded-md text-emerald-400 hover:text-white border border-slate-700 hover:border-emerald-500 transition-colors"
                                        title="Ver foto Caja/Placas"
                                      >
                                          <Car size={16} />
                                      </button>
                                      <button
                                        type="button" 
                                        onClick={(e) => { 
                                            e.stopPropagation();
                                            if (lib.fotos?.puertasUrl) setPreviewUrl(lib.fotos.puertasUrl.replace('/view', '/preview'));
                                        }}
                                        className="p-1.5 bg-slate-800 rounded-md text-emerald-400 hover:text-white border border-slate-700 hover:border-emerald-500 transition-colors"
                                        title="Ver foto Puertas"
                                      >
                                          <DoorOpen size={16} />
                                      </button>
                                      <button
                                        type="button" 
                                        onClick={(e) => { 
                                            e.stopPropagation();
                                            if (lib.fotos?.selloUrl) setPreviewUrl(lib.fotos.selloUrl.replace('/view', '/preview'));
                                        }}
                                        className="p-1.5 bg-slate-800 rounded-md text-emerald-400 hover:text-white border border-slate-700 hover:border-emerald-500 transition-colors"
                                        title="Ver foto Sello Asignado"
                                      >
                                          <ShieldCheck size={16} />
                                      </button>
                                 </div>
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
                                {fotoCajaFile && <CheckCircle size={18} className="text-blue-500" />}
                             </div>
                             
                             <button
                                onClick={() => handleLaunchCamera('CAJA')}
                                disabled={isProcessingImage || isSaving}
                                className={`w-full py-4 rounded-xl flex items-center justify-center gap-2 font-semibold transition-all shadow-sm ${
                                    fotoCajaFile 
                                       ? 'bg-blue-900/30 text-blue-400 border border-blue-800/50' 
                                       : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-900/20'
                                }`}
                             >
                                 <Camera size={20} />
                                 {fotoCajaFile ? 'Tomar Nueva Foto' : 'Abrir Cámara'}
                             </button>
                         </div>

                         {/* FOTO PUERTAS */}
                         <div className={`bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden p-4 relative transition-all ${!fotoCajaFile ? 'opacity-50 grayscale pointer-events-none' : ''}`}>
                             <div className="flex justify-between items-center mb-3">
                                <div className="flex items-center gap-2 text-sm font-bold text-slate-300">
                                   <DoorOpen size={18} className="text-orange-400"/> 2. Foto de Puertas
                                </div>
                                {fotoPuertasFile && <CheckCircle size={18} className="text-orange-500" />}
                             </div>
                             
                             <button
                                onClick={() => handleLaunchCamera('PUERTAS')}
                                disabled={isProcessingImage || isSaving}
                                className={`w-full py-4 rounded-xl flex items-center justify-center gap-2 font-semibold transition-all shadow-sm ${
                                    fotoPuertasFile 
                                       ? 'bg-orange-900/30 text-orange-400 border border-orange-800/50' 
                                       : 'bg-orange-600 hover:bg-orange-500 text-white shadow-orange-900/20'
                                }`}
                             >
                                 <Camera size={20} />
                                 {fotoPuertasFile ? 'Tomar Nueva Foto' : 'Abrir Cámara'}
                             </button>
                         </div>

                         {/* FOTO SELLO & ANALISIS */}
                         <div className={`bg-slate-900 border border-slate-800 rounded-2xl p-4 transition-all ${(!fotoCajaFile || !fotoPuertasFile) ? 'opacity-50 grayscale pointer-events-none' : ''}`}>
                             <div className="flex justify-between items-center mb-3">
                                <div className="flex items-center gap-2 text-sm font-bold text-slate-300">
                                   <ShieldCheck size={18} className="text-emerald-400"/> 3. Foto de Sello Físico
                                </div>
                                {fotoSelloFile && <CheckCircle size={18} className="text-emerald-500" />}
                             </div>
                             
                             <button
                                onClick={() => handleLaunchCamera('SELLO')}
                                disabled={isProcessingImage || isSaving}
                                className={`w-full py-4 rounded-xl flex items-center justify-center gap-2 font-semibold transition-all shadow-sm mb-4 ${
                                    fotoSelloFile 
                                       ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-800/50' 
                                       : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/20'
                                }`}
                             >
                                 {isProcessingImage && activeCameraStep === 'SELLO' ? (
                                     <><Loader2 size={20} className="animate-spin" /> Analizando Sello con IA...</>
                                 ) : fotoSelloFile ? (
                                     <><Camera size={20} /> Tomar Nueva Foto de Sello</>
                                 ) : (
                                     <><Camera size={20} /> Capturar y Extraer Sello</>
                                 )}
                             </button>

                             {fotoSelloFile && (
                                <div className="animate-in fade-in slide-in-from-top-4 duration-300 mt-2 bg-slate-950 p-4 rounded-xl border border-slate-800 shadow-inner">
                                    <label className="text-xs text-emerald-500 font-bold tracking-widest uppercase mb-2 block">
                                        REVISIÓN DE SELLO EXTRAÍDO
                                    </label>
                                    <input
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
    </div>
  );
};
