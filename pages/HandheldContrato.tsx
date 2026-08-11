import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, FileText, ArrowLeft, Loader2, RefreshCw, AlertTriangle, Box, Shield, CheckCircle } from 'lucide-react';
import { geminiService } from '../services/geminiService.ts';
import { asignacionCajaService } from '../services/asignacionCajaService.ts';
import { contratoService } from '../services/contratoService.ts';
import { useAuth } from '../context/useAuth';
import { nowMX } from '../utils/mexTime';

export const HandheldContrato: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [cajaValue, setCajaValue] = useState('');
  const [selloValue, setSelloValue] = useState('');
  const [contratoValue, setContratoValue] = useState('');
  const [contrato2Value, setContrato2Value] = useState('');
  const [activeInputTarget, setActiveInputTarget] = useState<'contrato1' | 'contrato2'>('contrato1');
  
  // Date selector as requested: PDA MUST follow the date in the module
  // No assuming default dates. The user MUST explicitly select it.
  const [dateStart, setDateStart] = useState<string>('');
  
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  const [currentImageFile, setCurrentImageFile] = useState<File | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [isAiRunning, setIsAiRunning] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cajaInputRef = useRef<HTMLInputElement>(null);
  const selloInputRef = useRef<HTMLInputElement>(null);
  const contratoInputRef = useRef<HTMLInputElement>(null);
  const contrato2InputRef = useRef<HTMLInputElement>(null);

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
    if (activeInputTarget === 'contrato1') setContratoValue('');
    else setContrato2Value('');
    try {
      const base64Data = await fileToBase64Payload(file);
      const text = await geminiService.extractContratoNumber(base64Data);

      if (text === 'NO_ENCONTRADO' || !text) {
        setAiError('No se detectó un número de contrato. Intenta tomar la foto más de cerca o sin reflejos.');
      } else {
        const cleanedText = text.replace(/[^A-Za-z0-9_-]/g, '').toUpperCase();
        if (activeInputTarget === 'contrato1') setContratoValue(cleanedText);
        else setContrato2Value(cleanedText);
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
      const compressedFile = new File([blob], `compressed_${file.name}`, { type: 'image/jpeg' });
      setCurrentImageFile(compressedFile);
      setIsProcessingImage(false);
      runGeminiExtraction(compressedFile);
    } catch (error: any) {
      setAiError('Error al procesar la imagen: ' + error.message);
      setIsProcessingImage(false);
    }
  };

  const handleSave = async () => {
    if (!dateStart || !cajaValue || !selloValue || !contratoValue) {
      alert("Faltan datos requeridos. Es obligatorio llenar la Fecha, Número de Caja, Sello Asignado y Número de Contrato antes de guardar.");
      return;
    }
    
    setIsSaving(true);
    setAiError(null);
    setSaveSuccess(false);

    try {
      const mxDate = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Mexico_City" }));

      const scannedVal = cajaValue.trim().toUpperCase();
      let caja = await asignacionCajaService.getAsignacionByNumeroCaja(scannedVal, dateStart);
      if (!caja) {
        caja = await asignacionCajaService.getAsignacionByNumeroOperacion(scannedVal, dateStart);
      }

      if (!caja || !caja.id) {
        setAiError(`La caja o NO. OPERACIÓN especificada no fue encontrada para la fecha ${dateStart}. Por favor revise la fecha o pida a Tráfico que cree la asignación.`);
        setIsSaving(false);
        return;
      }

      await contratoService.addContrato({
        numeroOperacion: caja.numeroOperacion || '',
        numeroCaja: caja.numeroCaja,
        selloAsignado: selloValue.trim(),
        contrato: contratoValue.trim(),
        contrato2: contrato2Value.trim(),
        fecha: dateStart,
        createdAt: nowMX(),
        usuario: user?.email || 'Handheld Contrato'
      });
      
      setSaveSuccess(true);
      setTimeout(() => {
        clearAll();
        setSaveSuccess(false);
      }, 2000);

    } catch (error: any) {
      setAiError("Error al guardar: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const clearAll = () => {
    setCajaValue('');
    setSelloValue('');
    setContratoValue('');
    setContrato2Value('');
    setCurrentImageFile(null);
    setAiError(null);
    setActiveInputTarget('contrato1');
    if (cajaInputRef.current) cajaInputRef.current.focus();
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col font-sans">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleImageCapture}
        className="hidden"
      />

      {/* Header */}
      <div className="flex items-center gap-4 px-5 py-4 bg-slate-900 border-b border-slate-800 shrink-0">
        <button
          onClick={() => navigate('/m/home')}
          className="p-2 rounded-xl bg-slate-800 text-slate-300 active:bg-slate-700"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-white font-black text-lg tracking-tight truncate">
            Módulo Contrato
          </h1>
          <p className="text-slate-400 text-xs">Escanea y obtén el contrato</p>
        </div>
        <button onClick={clearAll} className="p-2 rounded-xl bg-slate-800 text-indigo-400 active:bg-slate-700" title="Limpiar todo">
          <RefreshCw size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pb-24 relative bg-slate-50/50">
        
        {/* Date Selector Header */}
        <div className="px-4 py-3 bg-white border-b border-slate-200">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Fecha de Operación</label>
          <input
            type="date"
            value={dateStart}
            onChange={(e) => setDateStart(e.target.value)}
            className="w-full p-2.5 border-2 border-slate-200 rounded-xl text-slate-700 font-bold focus:border-indigo-500 outline-none transition-colors"
          />
        </div>

        <div className="px-4 pt-4 pb-2 grid grid-cols-2 gap-3">
          <div className="bg-slate-900 rounded-2xl p-3 border border-slate-800 focus-within:border-indigo-500/50 transition-colors flex flex-col justify-center">
            <div className="flex items-center gap-1.5 mb-1.5 text-indigo-400">
              <Box size={14} />
              <span className="text-[10px] font-bold uppercase tracking-widest">Número Caja</span>
            </div>
            <input
              autoFocus
              ref={cajaInputRef}
              type="text"
              value={cajaValue}
              onChange={e => setCajaValue(e.target.value)}
              placeholder="Ej. 1234"
              className="w-full bg-transparent text-white font-black text-xl font-mono outline-none placeholder:text-slate-600"
              onKeyDown={e => {
                if (e.key === 'Enter') selloInputRef.current?.focus();
              }}
            />
          </div>

          <div className="bg-slate-900 rounded-2xl p-3 border border-slate-800 focus-within:border-blue-500/50 transition-colors flex flex-col justify-center">
            <div className="flex items-center gap-1.5 mb-1.5 text-blue-400">
              <Shield size={14} />
              <span className="text-[10px] font-bold uppercase tracking-widest">Sello Asign.</span>
            </div>
            <input
              ref={selloInputRef}
              type="text"
              value={selloValue}
              onChange={e => setSelloValue(e.target.value)}
              placeholder="Ej. A-12"
              className="w-full bg-transparent text-white font-black text-xl font-mono outline-none placeholder:text-slate-600"
              onKeyDown={e => {
                if (e.key === 'Enter') contratoInputRef.current?.focus();
              }}
            />
          </div>
        </div>

        {/* Zona del Contrato (Manual o IA) */}
        <div className="px-4">
          <div className="bg-slate-800/80 rounded-3xl p-4 border border-slate-700/50 shadow-sm">
            
            {/* Contrato 1 */}
            <div className="flex items-stretch gap-3 border-b border-slate-700/50 pb-5 mb-5">
              <div className="flex-1 relative">
                <div className="flex items-center gap-1.5 mb-2 text-emerald-400">
                  <FileText size={14} />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Contrato 1</span>
                </div>
                <input
                  ref={contratoInputRef}
                  type="text"
                  value={contratoValue}
                  onChange={e => setContratoValue(e.target.value)}
                  placeholder="Ingresa contrato..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-3 text-white font-black text-lg font-mono outline-none focus:border-emerald-500 transition-colors placeholder:text-slate-600"
                  onKeyDown={e => {
                    if (e.key === 'Enter') contrato2InputRef.current?.focus();
                  }}
                />
                {isAiRunning && activeInputTarget === 'contrato1' && (
                  <div className="absolute right-3 bottom-3">
                    <Loader2 className="animate-spin text-emerald-400" size={20} />
                  </div>
                )}
              </div>

              <div className="flex flex-col justify-end">
                <button
                  onClick={() => {
                    if (isProcessingImage || isAiRunning) return;
                    setActiveInputTarget('contrato1');
                    setTimeout(() => fileInputRef.current?.click(), 0);
                  }}
                  className="w-[84px] h-[52px] bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-xl flex flex-col items-center justify-center gap-0.5 transition-transform active:scale-95 shadow-md shadow-indigo-900/40"
                >
                  <Camera size={20} />
                  <span className="font-black text-sm tracking-tight leading-none">INICIO</span>
                  <span className="text-[8px] text-indigo-200 font-bold uppercase leading-none">Foto 1</span>
                </button>
              </div>
            </div>

            {/* Contrato 2 */}
            <div className="flex items-stretch gap-3">
              <div className="flex-1 relative">
                <div className="flex items-center gap-1.5 mb-2 text-slate-400">
                  <FileText size={14} />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Contrato 2 (Opcional)</span>
                </div>
                <input
                  ref={contrato2InputRef}
                  type="text"
                  value={contrato2Value}
                  onChange={e => setContrato2Value(e.target.value)}
                  placeholder="Opcional..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-3 text-white font-black text-lg font-mono outline-none focus:border-indigo-500 transition-colors placeholder:text-slate-600"
                />
                {isAiRunning && activeInputTarget === 'contrato2' && (
                  <div className="absolute right-3 bottom-3">
                    <Loader2 className="animate-spin text-indigo-400" size={20} />
                  </div>
                )}
              </div>

              <div className="flex flex-col justify-end">
                <button
                  onClick={() => {
                    if (isProcessingImage || isAiRunning) return;
                    setActiveInputTarget('contrato2');
                    setTimeout(() => fileInputRef.current?.click(), 0);
                  }}
                  className="w-[84px] h-[52px] bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-xl flex flex-col items-center justify-center gap-0.5 transition-transform active:scale-95 shadow-md shadow-indigo-900/40"
                >
                  <Camera size={20} />
                  <span className="font-black text-sm tracking-tight leading-none">INICIO</span>
                  <span className="text-[8px] text-indigo-200 font-bold uppercase leading-none">Foto 2</span>
                </button>
              </div>
            </div>
          </div>
          
          {/* AI Error */}
          {aiError && !isAiRunning && (
            <div className="mt-4 flex items-start gap-2 p-3 bg-amber-900/30 border border-amber-700/50 rounded-xl text-amber-300 text-xs">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>{aiError}</span>
            </div>
          )}

          {localPreviewUrl && (
            <div className="mt-4 relative rounded-xl overflow-hidden border border-slate-700 bg-slate-900 mx-4">
              <img src={localPreviewUrl} alt="Contrato capturado" className="w-full h-32 object-cover opacity-60" />
              <div className="absolute inset-0 flex items-center justify-center">
                {isProcessingImage ? (
                  <span className="bg-slate-900/80 px-3 py-1 rounded-lg text-xs font-bold text-white flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" /> Procesando...
                  </span>
                ) : (
                  <button onClick={() => fileInputRef.current?.click()} className="bg-indigo-600/90 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-lg backdrop-blur-sm">
                    Reintentar Foto
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Guardar Botón */}
        <div className="pt-5 px-4">
          {saveSuccess ? (
            <div className="w-full py-4 bg-emerald-600/20 text-emerald-400 font-black text-lg rounded-2xl flex items-center justify-center gap-3 border border-emerald-500/50">
              <CheckCircle size={24} />
              ¡CONTRATO GUARDADO!
            </div>
          ) : (
            <button
              onClick={handleSave}
              disabled={!cajaValue || !contratoValue || isSaving}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 active:bg-emerald-700 text-white font-black text-lg rounded-2xl flex items-center justify-center gap-3 transition-colors shadow-lg shadow-emerald-900/30"
            >
              {isSaving ? <Loader2 className="animate-spin" size={24} /> : <CheckCircle size={24} />}
              {isSaving ? 'GUARDANDO...' : 'GUARDAR CONTRATO'}
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
