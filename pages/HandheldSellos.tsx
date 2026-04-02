import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { asignacionCajaService } from '../services/asignacionCajaService.ts';
import { selloService } from '../services/selloService.ts';
import { geminiService } from '../services/geminiService.ts';
import { uploadFileToDrive } from '../services/googleDriveService.ts';
import { AsignacionCajaModel } from '../types/asignacionCaja.ts';
import { SelloRecord } from '../types.ts';
import { Camera, Check, ArrowLeft, Loader2, Save, X, Box, ImageIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

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
  const [currentImageFile, setCurrentImageFile] = useState<File | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDataForDate = async (targetDate: string) => {
    setLoading(true);
    
    try {
      const todasLasCajas = await asignacionCajaService.getAllAsignaciones();
      const cajasParaFecha = todasLasCajas.filter(c => c.fecha === targetDate);
      
      const sellosParaFecha = await selloService.getSellosByDate(targetDate);
      
      setCajasDelDia(cajasParaFecha);
      setSellosDelDia(sellosParaFecha);
    } catch (e) {
      console.error("Error fetching data", e);
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
          
          // Max dimension 1200px
          const MAX_DIM = 1200;
          if (width > height) {
            if (width > MAX_DIM) {
              height *= MAX_DIM / width;
              width = MAX_DIM;
            }
          } else {
            if (height > MAX_DIM) {
              width *= MAX_DIM / height;
              height = MAX_DIM;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          
          // Compress as JPEG 70% quality -> usually ~150-300kb
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          resolve(dataUrl.split(',')[1]); // return just the base64 data
        };
        img.onerror = (e) => reject(e);
      };
      reader.onerror = (e) => reject(e);
    });
  };

  const handleImageCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsProcessingImage(true);
      
      // Compress the file right away
      const compressedBase64 = await compressImage(file);
      
      // We store a reconstructed File for Google Drive upload to use
      const byteCharacters = atob(compressedBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/jpeg' });
      const smallFile = new File([blob], file.name, { type: 'image/jpeg' });
      
      setCurrentImageFile(smallFile);

      try {
        // Send tiny base64 to Gemini
        const extractedNumber = await geminiService.extractSelloNumber(compressedBase64);
        if (extractedNumber !== 'NO_DETECTADO') {
            setSelloValue(extractedNumber);
          } else {
            alert("No se pudo detectar un sello claro en la imagen. Por favor, intenta de nuevo o escríbelo manualmente.");
          }
        } catch (aiError) {
          console.error(aiError);
          alert("Error procesando la imagen con IA. Introduce el número manualmente.");
        } finally {
          setIsProcessingImage(false);
          if (fileInputRef.current) fileInputRef.current.value = ""; // Reset input
        }
    } catch (e) {
      console.error(e);
      setIsProcessingImage(false);
    }
  };

  const handleSaveSello = async () => {
    if (!selectedCaja || !selloValue.trim()) {
       alert("Por favor completa el número de sello.");
       return;
    }
    if (!user?.username && !user?.email) {
       alert("Error de sesión: No se detectó un usuario válido.");
       return;
    }
    
    setIsSaving(true);
    try {
      let finalFotoUrl: string | undefined = undefined;

      if (currentImageFile) {
        // Subida estricta a Google Drive (Sin Firebase Fallback)
        try {
            const FOLDER_ID = "1jBIvDIbXAP2eGFyVM3J2i5iZWjaEdO9X";
            const result = await uploadFileToDrive(currentImageFile, `Sello de Caja ${selectedCaja.numeroCaja}`, FOLDER_ID);
            
            const url = result?.webViewLink || (result as any)?.url || (result as any)?.fileUrl;
            if (url && typeof url === 'string' && url.startsWith('http')) {
                finalFotoUrl = url;
            } else {
                throw new Error("Google Drive no devolvió el link de la foto.");
            }
        } catch (driveErr: any) {
            console.error("Fallo definitivo en Drive:", driveErr);
            throw new Error(`Error en Drive: ${driveErr.message}. La foto no se guardó.`);
        }
      }

      const selloExistente = getSelloForCaja(selectedCaja.id || "");

      const newSello: SelloRecord = {
        fechaAsignacion: selectedDate,
        asignacionCajaId: selectedCaja.id || "",
        numeroCaja: selectedCaja.numeroCaja,
        selloAsignado: selloValue.toUpperCase().trim(),
        usuario: user.email || user.username || 'unknown',
        fechaHoraRegistro: new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }),
        fotoUrl: finalFotoUrl,
        createdAt: selloExistente?.createdAt || new Date().toISOString()
      };

      if (selloExistente && selloExistente.id) {
          await selloService.updateSello(selloExistente.id, newSello);
      } else {
          await selloService.addSello(newSello);
      }
      
      // Si no arrojó error, todo salió bien
      setSelloValue("");
      setCurrentImageFile(null);
      setSelectedCaja(null);
      await fetchDataForDate(selectedDate); // Refrescar lista
    } catch (err: any) {
      console.error(err);
      alert("Error inesperado al guardar: " + (err.message || "Desconocido"));
    } finally {
      setIsSaving(false);
    }
  };

  const getSelloForCaja = (cajaId: string) => {
    return sellosDelDia.find(s => s.asignacionCajaId === cajaId);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col font-sans">
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
                        if (isCompleted && !window.confirm("Esta caja ya tiene un sello asegurado. ¿Deseas reemplazarlo de todos modos?")) {
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
                            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 tracking-wider mb-1">
                                <span className="bg-slate-700/50 px-2 py-0.5 rounded text-white font-mono">#{index + 1}</span>
                                <span>{caja.horaAsignacion || '--:--'}</span>
                            </div>
                            <div className="text-2xl font-black tracking-tight text-white">{caja.numeroCaja}</div>
                            <div className="text-sm font-medium text-slate-400 flex items-center gap-2">
                                <span>{caja.carrierCodigo || "SC"}</span> • <span>{caja.placasCaja}</span> 
                            </div>
                        </div>
                        {isCompleted ? (
                            <div className="bg-emerald-500/10 text-emerald-400 p-2 rounded-full ring-1 ring-emerald-500/30">
                                <Check size={20} className="stroke-[3]" />
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
                                {selloExistente.fotoUrl && (
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
                                      className="p-1.5 bg-slate-800 rounded-md text-blue-400 hover:text-white border border-slate-700 hover:border-blue-500 transition-colors"
                                      title="Ver foto del sello"
                                    >
                                        <ImageIcon size={18} />
                                    </button>
                                )}
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
