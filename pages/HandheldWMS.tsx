import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, ArrowLeft, Loader2, FileText, CheckCircle, Box, Calendar, Grid } from 'lucide-react';
import { geminiService } from '../services/geminiService.ts';
import { useAuth } from '../context/useAuth';

export const HandheldWMS: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [dateStart, setDateStart] = useState<string>('');
  const [contratoValue, setContratoValue] = useState('');
  const [contrato2Value, setContrato2Value] = useState('');
  const [facturaValue, setFacturaValue] = useState('');
  const [estadosValue, setEstadosValue] = useState('');
  
  // Popup state
  const [popupCount, setPopupCount] = useState<number | null>(null);
  const [popupValues, setPopupValues] = useState<string[]>([]);
  
  const [activeInputTarget, setActiveInputTarget] = useState<'contrato' | 'contrato2' | 'factura' | 'estados' | `popup_${number}`>('contrato');
  const [currentImageFile, setCurrentImageFile] = useState<File | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [isAiRunning, setIsAiRunning] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!currentImageFile) { setLocalPreviewUrl(null); return; }
    const url = URL.createObjectURL(currentImageFile);
    setLocalPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [currentImageFile]);

  const compressImage = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
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
          if (!ctx) { reject(new Error("Failed to get context")); return; }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = () => reject(new Error("Failed to load image"));
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
    });

  const fileToBase64Payload = (file: File): Promise<string> => 
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = reader.result as string;
        resolve(base64String.split(',')[1]);
      };
      reader.onerror = error => reject(error);
    });

  const runGeminiExtraction = async (file: File) => {
    setIsAiRunning(true);
    setAiError(null);
    try {
      const base64Data = await fileToBase64Payload(file);
      
      let text = '';
      if (activeInputTarget === 'contrato' || activeInputTarget === 'contrato2') {
          // Utiliza la lógica actual de contrato
          text = await geminiService.extractContratoNumber(base64Data);
      } else if (activeInputTarget === 'factura') {
          // Utiliza la lógica actual de factura
          text = await geminiService.extractFacturaNumber(base64Data);
      } else if (activeInputTarget === 'estados') {
          // TODO: Definir lógica específica de Gemini para Estados
          text = await geminiService.extractFacturaNumber(base64Data); // Placeholder
      } else if (String(activeInputTarget).startsWith('popup_')) {
          // TODO: Definir lógica específica de Gemini para los popups
          text = await geminiService.extractFacturaNumber(base64Data); // Placeholder
      }

      if (text === 'NO_ENCONTRADO' || !text || text === 'NO_DETECTADO') {
        setAiError('No se detectó el valor. Intenta tomar la foto más de cerca.');
      } else {
        const cleanedText = text.replace(/[^A-Za-z0-9_-]/g, '').toUpperCase();
        if (activeInputTarget === 'contrato') setContratoValue(cleanedText);
        else if (activeInputTarget === 'contrato2') setContrato2Value(cleanedText);
        else if (activeInputTarget === 'factura') setFacturaValue(cleanedText);
        else if (activeInputTarget === 'estados') setEstadosValue(cleanedText);
        else if (String(activeInputTarget).startsWith('popup_')) {
            const idx = parseInt(String(activeInputTarget).split('_')[1], 10);
            setPopupValues(prev => {
                const nw = [...prev];
                nw[idx] = cleanedText;
                return nw;
            });
        }
      }
    } catch (err: any) {
      setAiError(err.message || 'Error al comunicar con la IA.');
    } finally {
      setIsAiRunning(false);
    }
  };

  const handleImageCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setIsProcessingImage(true);
    setAiError(null);
    try {
      const compressedBase64 = await compressImage(file);
      const res = await fetch(compressedBase64);
      const blob = await res.blob();
      const compressedFile = new File([blob], `wms_capture.jpg`, { type: 'image/jpeg' });
      setCurrentImageFile(compressedFile);
      setIsProcessingImage(false);
      runGeminiExtraction(compressedFile);
    } catch (error: any) {
      setAiError('Error al procesar la imagen: ' + error.message);
      setIsProcessingImage(false);
    }
  };

  const openPopup = (count: number) => {
      setPopupCount(count);
      setPopupValues(Array(count).fill(''));
  };

  const closePopup = () => {
      setPopupCount(null);
      setPopupValues([]);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col font-sans relative">
      <input 
        type="file" 
        accept="image/*" 
        capture="environment" 
        ref={fileInputRef} 
        onChange={handleImageCapture} 
        className="hidden" 
      />

      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 px-4 py-4 flex items-center sticky top-0 z-10 shadow-md">
        <button onClick={() => navigate('/')} className="text-slate-400 hover:text-white p-2 mr-2">
          <ArrowLeft size={24} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Box className="text-purple-400" size={22} /> WMS
          </h1>
          <p className="text-xs text-slate-400 font-medium">Captura de información WMS</p>
        </div>
      </div>

      <div className="flex-1 p-4 pb-32">
        {aiError && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3 animate-fade-in">
            <div className="p-2 bg-red-500/20 rounded-lg shrink-0">
              <CheckCircle className="text-red-400" size={20} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-red-400 mb-1">Error de captura</h3>
              <p className="text-xs text-red-300 leading-relaxed">{aiError}</p>
            </div>
          </div>
        )}

        {/* Global Loading Overlay */}
        {(isProcessingImage || isAiRunning) && (
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
            <div className="w-20 h-20 bg-slate-800 rounded-2xl border border-slate-700 flex items-center justify-center mb-4 shadow-2xl">
              <Loader2 className="animate-spin text-purple-500" size={40} />
            </div>
            <p className="text-white font-bold text-lg">
              {isProcessingImage ? 'Optimizando foto...' : 'Procesando con Gemini...'}
            </p>
            <p className="text-slate-400 text-sm mt-2">Por favor mantén la pantalla encendida</p>
          </div>
        )}

        {/* Form Container */}
        <div className="bg-slate-800/50 p-5 rounded-[24px] border border-slate-700 shadow-xl space-y-8">
          
          {/* FECHA DE OPERACIÓN */}
          <div>
            <label className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
              <Calendar size={14} className="text-emerald-400" />
              FECHA DE OPERACIÓN
            </label>
            <input
              type="date"
              value={dateStart}
              onChange={(e) => setDateStart(e.target.value)}
              className="w-full bg-slate-900 border-2 border-slate-700 text-white font-bold px-4 py-4 rounded-xl focus:outline-none focus:border-purple-500 transition-colors"
            />
          </div>

          <div className="h-[1px] w-full bg-slate-700/50"></div>

          {/* CONTRATO */}
          <div>
            <label className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wider mb-3">
              <FileText size={14} /> CONTRATO
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Ingresa contrato..."
                value={contratoValue}
                onChange={(e) => setContratoValue(e.target.value.toUpperCase())}
                className="flex-1 bg-slate-900 border-2 border-slate-700 text-white font-mono font-bold text-lg px-4 py-4 rounded-xl focus:outline-none focus:border-emerald-500 transition-colors uppercase placeholder:text-slate-600 placeholder:font-sans placeholder:font-normal w-full"
              />
              <button 
                onClick={() => { setActiveInputTarget('contrato'); fileInputRef.current?.click(); }}
                className="bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white px-6 rounded-xl font-bold flex flex-col items-center justify-center shadow-[0_4px_20px_rgba(79,70,229,0.4)] transition-all shrink-0 w-[100px]"
              >
                <Camera size={24} className="mb-1" />
                <span className="text-[10px] uppercase tracking-wider">Foto 1</span>
              </button>
            </div>
          </div>

          <div className="h-[1px] w-full bg-slate-700/50"></div>

          {/* CONTRATO 2 */}
          <div>
            <label className="flex items-center gap-2 text-xs font-bold text-indigo-400 uppercase tracking-wider mb-3">
              <FileText size={14} /> CONTRATO 2 (OPCIONAL)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Opcional..."
                value={contrato2Value}
                onChange={(e) => setContrato2Value(e.target.value.toUpperCase())}
                className="flex-1 bg-slate-900 border-2 border-slate-700 text-white font-mono font-bold text-lg px-4 py-4 rounded-xl focus:outline-none focus:border-indigo-500 transition-colors uppercase placeholder:text-slate-600 placeholder:font-sans placeholder:font-normal w-full"
              />
              <button 
                onClick={() => { setActiveInputTarget('contrato2'); fileInputRef.current?.click(); }}
                className="bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white px-6 rounded-xl font-bold flex flex-col items-center justify-center shadow-[0_4px_20px_rgba(79,70,229,0.4)] transition-all shrink-0 w-[100px]"
              >
                <Camera size={24} className="mb-1" />
                <span className="text-[10px] uppercase tracking-wider">Foto 2</span>
              </button>
            </div>
          </div>

          <div className="h-[1px] w-full bg-slate-700/50"></div>

          {/* FACTURA */}
          <div>
            <label className="flex items-center gap-2 text-xs font-bold text-yellow-500 uppercase tracking-wider mb-3">
              <FileText size={14} /> FACTURA
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="No. Factura..."
                value={facturaValue}
                onChange={(e) => setFacturaValue(e.target.value.toUpperCase())}
                className="flex-1 bg-slate-900 border-2 border-slate-700 text-white font-mono font-bold text-lg px-4 py-4 rounded-xl focus:outline-none focus:border-yellow-500 transition-colors uppercase placeholder:text-slate-600 placeholder:font-sans placeholder:font-normal w-full"
              />
              <button 
                onClick={() => { setActiveInputTarget('factura'); fileInputRef.current?.click(); }}
                className="bg-yellow-600 hover:bg-yellow-500 active:bg-yellow-700 text-white px-6 rounded-xl font-bold flex flex-col items-center justify-center shadow-[0_4px_20px_rgba(202,138,4,0.4)] transition-all shrink-0 w-[100px]"
              >
                <Camera size={24} className="mb-1" />
                <span className="text-[10px] uppercase tracking-wider">Foto 3</span>
              </button>
            </div>
          </div>

          <div className="h-[1px] w-full bg-slate-700/50"></div>

          {/* ESTADOS */}
          <div>
            <label className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider mb-3">
              <FileText size={14} /> ESTADOS
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Ingresa estados..."
                value={estadosValue}
                onChange={(e) => setEstadosValue(e.target.value.toUpperCase())}
                className="flex-1 bg-slate-900 border-2 border-slate-700 text-white font-mono font-bold text-lg px-4 py-4 rounded-xl focus:outline-none focus:border-amber-500 transition-colors uppercase placeholder:text-slate-600 placeholder:font-sans placeholder:font-normal w-full"
              />
              <button 
                onClick={() => { setActiveInputTarget('estados'); fileInputRef.current?.click(); }}
                className="bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white px-6 rounded-xl font-bold flex flex-col items-center justify-center shadow-[0_4px_20px_rgba(217,119,6,0.4)] transition-all shrink-0 w-[100px]"
              >
                <Camera size={24} className="mb-1" />
                <span className="text-[10px] uppercase tracking-wider">Foto</span>
              </button>
            </div>
          </div>
          
        </div>
        
        {/* ACTION BUTTONS (4, 5, 8, 10) */}
        <div className="mt-8">
            <label className="flex items-center gap-2 text-lg font-black text-slate-300 uppercase tracking-wider mb-4 justify-center">
              <Grid size={18} className="text-purple-400" />
              VEHICULOS A PROCESAR
            </label>
            <div className="grid grid-cols-4 gap-3">
                {[4, 5, 8, 10].map(num => (
                    <button 
                        key={num}
                        onClick={() => openPopup(num)}
                        className="bg-slate-800 border-2 border-slate-700 text-slate-300 font-black text-2xl py-6 rounded-2xl hover:bg-purple-600 hover:text-white hover:border-purple-500 transition-all shadow-lg active:scale-95"
                    >
                        {num}
                    </button>
                ))}
            </div>
        </div>
      </div>

      {/* POPUP MODAL */}
      {popupCount !== null && (
          <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-md z-40 flex flex-col p-4 overflow-hidden">
              <div className="flex justify-between items-center mb-6 pt-4">
                  <div>
                      <h2 className="text-2xl font-black text-white">Espacios WMS</h2>
                      <p className="text-purple-400 font-bold text-sm">{popupCount} registros habilitados</p>
                  </div>
                  <button onClick={closePopup} className="text-slate-400 hover:text-white bg-slate-800 p-3 rounded-full border border-slate-700">
                      <ArrowLeft size={20} />
                  </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 pb-32 no-scrollbar px-1">
                  {Array.from({ length: popupCount }).map((_, idx) => (
                      <div key={idx} className="bg-slate-800 rounded-xl p-3 flex gap-2 items-center border border-slate-700 shadow-md">
                          <div className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center text-slate-500 font-black text-xs shrink-0 border border-slate-700">
                              {idx + 1}
                          </div>
                          <input
                            type="text"
                            placeholder="Escanea valor..."
                            value={popupValues[idx] || ''}
                            onChange={(e) => {
                                const newVals = [...popupValues];
                                newVals[idx] = e.target.value.toUpperCase();
                                setPopupValues(newVals);
                            }}
                            className="flex-1 bg-transparent text-white font-mono font-bold px-2 py-2 focus:outline-none uppercase placeholder:text-slate-600 text-sm w-full"
                          />
                          <button 
                            onClick={() => { setActiveInputTarget(`popup_${idx}`); fileInputRef.current?.click(); }}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white w-14 h-12 rounded-lg flex flex-col items-center justify-center shrink-0 shadow-md active:scale-95"
                          >
                            <Camera size={18} />
                          </button>
                      </div>
                  ))}
              </div>

              {/* Guardar Button */}
              <div className="absolute bottom-6 left-6 right-6">
                  <button onClick={() => {
                      // TODO: Save logic
                      alert("Registro guardado (Lógica en construcción)");
                      closePopup();
                  }} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black text-lg py-5 rounded-2xl shadow-[0_0_30px_rgba(16,185,129,0.3)] transition-all active:scale-95 flex items-center justify-center gap-2">
                      <CheckCircle size={24} /> GUARDAR REGISTROS
                  </button>
              </div>
          </div>
      )}
    </div>
  );
};
