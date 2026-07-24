import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, FileText, ArrowLeft, Loader2, RefreshCw, AlertTriangle, Box, Shield, CheckCircle } from 'lucide-react';
import { geminiService } from '../services/geminiService.ts';
import { asignacionCajaService } from '../services/asignacionCajaService.ts';
import { contratoService } from '../services/contratoService.ts';
import { useAuth } from '../context/useAuth';

export const HandheldContrato: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [cajaValue, setCajaValue] = useState('');
  const [selloValue, setSelloValue] = useState('');
  const [contratoValue, setContratoValue] = useState('');
  
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
    setContratoValue('');
    try {
      const base64Data = await fileToBase64Payload(file);
      const text = await geminiService.extractContratoNumber(base64Data);

      if (text === 'NO_ENCONTRADO' || !text) {
        setAiError('No se detectó un número de contrato. Intenta tomar la foto más de cerca o sin reflejos.');
      } else {
        const cleanedText = text.replace(/[^A-Za-z0-9_-]/g, '').toUpperCase();
        setContratoValue(cleanedText);
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
    if (!cajaValue || !contratoValue) {
      alert("Faltan datos requeridos (Caja y Contrato).");
      return;
    }
    
    setIsSaving(true);
    setAiError(null);
    setSaveSuccess(false);

    try {
      const scannedVal = cajaValue.trim().toUpperCase();
      let caja = await asignacionCajaService.getAsignacionByNumeroCaja(scannedVal);
      if (!caja) {
        caja = await asignacionCajaService.getAsignacionByNumeroOperacion(scannedVal);
      }

      if (!caja || !caja.id) {
        setAiError("La caja especificada no fue encontrada. Verifica el número de caja o NO. OPERACIÓN.");
        setIsSaving(false);
        return;
      }

      // 1. Create ContratoRecord
      const mxDate = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Mexico_City" }));
      const pad = (n: number) => n.toString().padStart(2, '0');
      const fechaHoy = `${mxDate.getFullYear()}-${pad(mxDate.getMonth() + 1)}-${pad(mxDate.getDate())}`;

      await contratoService.addContrato({
        numeroOperacion: caja.numeroOperacion || '',
        numeroCaja: caja.numeroCaja,
        selloAsignado: selloValue.trim(),
        contrato: contratoValue.trim(),
        fecha: fechaHoy,
        createdAt: new Date().toISOString(),
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
    setCurrentImageFile(null);
    setAiError(null);
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

      <div className="flex-1 overflow-y-auto p-5 space-y-6 pb-12">
        {/* Formularios de Escaneo (Caja y Sello) */}
        <div className="space-y-4">
          <div className="bg-slate-900 rounded-2xl p-4 border border-slate-800 focus-within:border-indigo-500/50 transition-colors">
            <div className="flex items-center gap-2 mb-2 text-indigo-400">
              <Box size={16} />
              <span className="text-xs font-bold uppercase tracking-widest">Número de Caja</span>
            </div>
            <input
              autoFocus
              ref={cajaInputRef}
              type="text"
              value={cajaValue}
              onChange={e => setCajaValue(e.target.value)}
              placeholder="Escanea o escribe la caja..."
              className="w-full bg-transparent text-white font-black text-2xl font-mono outline-none"
              onKeyDown={e => {
                if (e.key === 'Enter') selloInputRef.current?.focus();
              }}
            />
          </div>

          <div className="bg-slate-900 rounded-2xl p-4 border border-slate-800 focus-within:border-blue-500/50 transition-colors">
            <div className="flex items-center gap-2 mb-2 text-blue-400">
              <Shield size={16} />
              <span className="text-xs font-bold uppercase tracking-widest">Sello Asignado</span>
            </div>
            <input
              ref={selloInputRef}
              type="text"
              value={selloValue}
              onChange={e => setSelloValue(e.target.value)}
              placeholder="Escanea o escribe el sello..."
              className="w-full bg-transparent text-white font-black text-2xl font-mono outline-none"
              onKeyDown={e => {
                if (e.key === 'Enter') contratoInputRef.current?.focus();
              }}
            />
          </div>
        </div>

        {/* Zona del Contrato (Manual o IA) */}
        <div className="bg-slate-800/50 rounded-3xl p-5 border border-slate-700/50">
          <div className="flex flex-col md:flex-row items-center gap-4">
            
            {/* Input Manual */}
            <div className="flex-1 w-full relative">
              <div className="flex items-center gap-2 mb-2 text-emerald-400">
                <FileText size={16} />
                <span className="text-xs font-bold uppercase tracking-widest">Número de Contrato</span>
              </div>
              <input
                ref={contratoInputRef}
                type="text"
                value={contratoValue}
                onChange={e => setContratoValue(e.target.value)}
                placeholder="Ingresa contrato..."
                className="w-full bg-slate-900 border-2 border-slate-700 rounded-2xl px-4 py-4 text-white font-black text-xl font-mono outline-none focus:border-emerald-500 transition-colors"
              />
              {isAiRunning && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 mt-2">
                  <Loader2 className="animate-spin text-emerald-400" size={24} />
                </div>
              )}
            </div>

            {/* O (Separador) */}
            <div className="text-slate-500 font-bold text-xs uppercase my-2 md:my-0">
              Ó USA IA
            </div>

            {/* Botón de Cámara (INICIO) */}
            <button
              onClick={() => !isProcessingImage && !isAiRunning && fileInputRef.current?.click()}
              className="w-full md:w-auto shrink-0 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-2xl p-4 flex flex-col items-center justify-center gap-1 transition-transform active:scale-95 shadow-lg shadow-indigo-900/40"
            >
              <Camera size={28} className="mb-1" />
              <span className="font-black text-xl tracking-tight leading-none">INICIO</span>
              <span className="text-[10px] text-indigo-200 font-bold uppercase">Tomar Foto</span>
            </button>
          </div>
          
          {/* AI Error */}
          {aiError && !isAiRunning && (
            <div className="mt-4 flex items-start gap-2 p-3 bg-amber-900/30 border border-amber-700/50 rounded-xl text-amber-300 text-xs">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>{aiError}</span>
            </div>
          )}

          {/* Preview de la foto si hay una */}
          {localPreviewUrl && (
            <div className="mt-4 relative rounded-xl overflow-hidden border border-slate-700 bg-slate-900">
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
        <div className="pt-6">
          {saveSuccess ? (
            <div className="w-full py-5 bg-emerald-600/20 text-emerald-400 font-black text-lg rounded-2xl flex items-center justify-center gap-3 border border-emerald-500/50">
              <CheckCircle size={24} />
              ¡CONTRATO GUARDADO!
            </div>
          ) : (
            <button
              onClick={handleSave}
              disabled={!cajaValue || !contratoValue || isSaving}
              className="w-full py-5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 active:bg-emerald-700 text-white font-black text-lg rounded-2xl flex items-center justify-center gap-3 transition-colors shadow-lg shadow-emerald-900/30"
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
