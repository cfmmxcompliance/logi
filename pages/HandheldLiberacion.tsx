import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { asignacionCajaService } from '../services/asignacionCajaService.ts';
import { selloService } from '../services/selloService.ts';
import { liberacionService } from '../services/liberacionService.ts';
import { geminiService } from '../services/geminiService.ts';
import { uploadFileToDrive } from '../services/googleDriveService.ts';
import { AsignacionCajaModel } from '../types/asignacionCaja.ts';
import { LiberacionRecord, SelloRecord } from '../types.ts';
import { Camera, ArrowLeft, Loader2, Save, X, Box, ShieldCheck, HardDrive, AlertCircle, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useUploadGuard } from '../hooks/useUploadGuard.ts';
import { waitForOnline } from '../hooks/useOnlineStatus.ts';
import { UploadStatusBanner, UploadStatus } from '../components/UploadStatusBanner.tsx';

export const HandheldLiberacion = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [cajasDelDia, setCajasDelDia] = useState<AsignacionCajaModel[]>([]);
  const [sellosDelDia, setSellosDelDia] = useState<SelloRecord[]>([]);
  const [liberacionesDelDia, setLiberacionesDelDia] = useState<LiberacionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [networkWarning, setNetworkWarning] = useState<string | null>(null);

  const getLocalToday = () =>
    new Date().toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' });

  const [selectedDate, setSelectedDate] = useState<string>(getLocalToday());
  const [selectedCaja, setSelectedCaja] = useState<AsignacionCajaModel | null>(null);

  // Solo foto de sello
  const [fotoSelloFile, setFotoSelloFile] = useState<File | null>(null);
  const [extractedSello, setExtractedSello] = useState<string>('');
  const [aiRenderKey, setAiRenderKey] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [uploadStatusLabel, setUploadStatusLabel] = useState<string | undefined>(undefined);
  const [uploadError, setUploadError] = useState<string | undefined>(undefined);

  useUploadGuard(uploadStatus === 'uploading' || uploadStatus === 'waiting-online');

  const fetchWithTimeout = <T,>(promise: Promise<T>, ms = 10000): Promise<T> =>
    Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_EXCEEDED')), ms))]);

  const fetchDataForDate = async (targetDate: string) => {
    setLoading(true);
    try {
      const [cc, cs, cl] = await Promise.all([
        asignacionCajaService.getAsignacionesByDateCached(targetDate),
        selloService.getSellosByDateCached(targetDate),
        liberacionService.getLiberacionesByDateCached(targetDate),
      ]);
      if (cc.length > 0) {
        cc.sort((a, b) => (a.horaAsignacion || '') < (b.horaAsignacion || '') ? -1 : 1);
        setCajasDelDia(cc); setSellosDelDia(cs); setLiberacionesDelDia(cl);
        setLoading(false);
      }
    } catch { /* cache miss */ }
    try {
      const [cajas, sellos, libs] = await fetchWithTimeout(Promise.all([
        asignacionCajaService.getAsignacionesByDate(targetDate),
        selloService.getSellosByDate(targetDate),
        liberacionService.getLiberacionesByDate(targetDate),
      ]), 12000);
      cajas.sort((a, b) => (a.horaAsignacion || '') < (b.horaAsignacion || '') ? -1 : 1);
      setCajasDelDia(cajas); setSellosDelDia(sellos); setLiberacionesDelDia(libs);
    } catch (e: any) {
      if (cajasDelDia.length === 0) {
        setNetworkWarning(e.message === 'TIMEOUT_EXCEEDED' ? 'Señal lenta — datos en caché.' : 'Sin conexión — datos en caché.');
        setTimeout(() => setNetworkWarning(null), 5000);
      }
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchDataForDate(selectedDate); }, [selectedDate]);

  const compressImage = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (ev) => {
        const img = new Image();
        img.src = ev.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let { width, height } = img;
          const MAX = 1440;
          if (width > height) { if (width > MAX) { height *= MAX / width; width = MAX; } }
          else { if (height > MAX) { width *= MAX / height; height = MAX; } }
          canvas.width = Math.round(width); canvas.height = Math.round(height);
          const ctx = canvas.getContext('2d');
          if (!ctx) { reject(new Error('canvas')); return; }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = () => reject(new Error('img load'));
      };
      reader.onerror = () => reject(new Error('file read'));
    });

  const handleCaptureSello = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setIsProcessingImage(true);
    try {
      const compressed = await compressImage(file);
      const blob = await (await fetch(compressed)).blob();
      setFotoSelloFile(new File([blob], `compressed_${file.name}`, { type: 'image/jpeg' }));
      setExtractedSello('Analizando...');
      setIsProcessingImage(false);
      const base64Data = compressed.split(',')[1];
      geminiService.extractSelloNumber(base64Data)
        .then(r => { setExtractedSello(r && r.trim() !== 'NO_DETECTADO' && r.trim().length > 0 ? r.trim() : ''); setValidationError(null); })
        .catch(() => setExtractedSello(''))
        .finally(() => setAiRenderKey(k => k + 1));
    } catch {
      alert('No se pudo procesar la foto.');
      setIsProcessingImage(false);
    }
  };

  const uploadSelloBackground = useCallback(async (selloFile: File, liberacionId: string, numeroCaja: string) => {
    const FOLDER_ID = '1jBIvDIbXAP2eGFyVM3J2i5iZWjaEdO9X';
    const MAX_RETRIES = 3;
    if (!navigator.onLine) { setUploadStatus('waiting-online'); setUploadStatusLabel('Sin señal — esperando conexión...'); await waitForOnline(); }
    setUploadStatus('uploading'); setUploadStatusLabel('Subiendo evidencia de sello a Drive...'); setUploadError(undefined);
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const ts = Date.now();
        const selloRes = await uploadFileToDrive(selloFile, `lib_${numeroCaja}_SELLO_${ts}.jpg`, FOLDER_ID);
        const selloUrl = selloRes?.webViewLink || (selloRes as any)?.url || '';
        if (!selloUrl) { setUploadError('Drive respondió sin URL.'); setUploadStatus('error'); return; }
        await liberacionService.updateLiberacion(liberacionId, { fotos: { selloUrl }, uploadStatus: 'done' } as any);
        setLiberacionesDelDia(prev => prev.map(l => l.id === liberacionId ? { ...l, fotos: { ...l.fotos, selloUrl } } : l));
        setUploadStatus('done'); setUploadStatusLabel('Evidencia subida correctamente ✔');
        setTimeout(() => setUploadStatus('idle'), 4000); return;
      } catch (err: any) {
        setUploadError(err.message);
        if (attempt < MAX_RETRIES) {
          if (!navigator.onLine) { setUploadStatus('waiting-online'); await waitForOnline(); }
          setUploadStatus('uploading'); setUploadStatusLabel(`Reintentando (${attempt + 1}/${MAX_RETRIES})...`);
          await new Promise(r => setTimeout(r, 2000 * attempt));
        } else { setUploadStatus('error'); }
      }
    }
  }, []);

  const handleCierreCaja = async () => {
    if (!selectedCaja) return;
    if (!fotoSelloFile) { setValidationError('Captura la foto del sello antes de continuar.'); return; }
    if (!extractedSello || extractedSello.trim().length < 3) { setValidationError('El sello extraído es inválido o muy corto.'); return; }
    setValidationError(null); setIsSaving(true);
    try {
      const assignedSelloRecord = sellosDelDia.find(s => s.numeroCaja === selectedCaja.numeroCaja);
      if (!assignedSelloRecord) throw new Error('⛔ Esta caja NO TIENE SELLO REGISTRADO para hoy. No se puede liberar.');
      const selloFinal = extractedSello.toUpperCase().trim();
      if (assignedSelloRecord.selloAsignado !== selloFinal)
        throw new Error(`⛔ DESCUADRE DE SELLO\n\nSello registrado: [${assignedSelloRecord.selloAsignado}]\nSello físico escaneado: [${selloFinal}]\n\nVerifique y escale al responsable del área.`);

      const liberacionId = `lib_${selectedCaja.id}_${Date.now()}`;
      const newLiberacion: LiberacionRecord = {
        id: liberacionId,
        fechaLiberacion: selectedDate,
        asignacionCajaId: selectedCaja.id || '',
        numeroCaja: selectedCaja.numeroCaja,
        selloValidado: selloFinal,
        coincideConOriginal: true,
        usuario: user.email || user.username || 'unknown',
        fechaHoraRegistro: new Date().toLocaleString('es-MX', { timeZone: 'America/Monterrey', hour12: false }),
        fotos: { selloUrl: 'PENDING' },
        createdAt: new Date().toISOString(),
      };
      await liberacionService.addLiberacion(newLiberacion);
      setLiberacionesDelDia(prev => [...prev, newLiberacion]);
      setSaveSuccess(true);
      setTimeout(() => closeModal(), 2500);
      uploadSelloBackground(fotoSelloFile, liberacionId, selectedCaja.numeroCaja);
    } catch (e: any) {
      setValidationError(e.message);
    } finally { setIsSaving(false); }
  };

  const closeModal = () => {
    setSelectedCaja(null); setFotoSelloFile(null); setExtractedSello('');
    setValidationError(null); setSaveSuccess(false);
  };

  const getLiberacionForCaja = (cajaId: string) => liberacionesDelDia.find(l => l.asignacionCajaId === cajaId);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col font-sans">
      {networkWarning && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-white text-xs font-semibold px-4 py-2 flex items-center justify-between">
          <span>⚠ {networkWarning}</span>
          <button onClick={() => setNetworkWarning(null)}>✕</button>
        </div>
      )}
      <UploadStatusBanner status={uploadStatus} label={uploadStatusLabel} error={uploadError} onDismiss={() => setUploadStatus('idle')} />

      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 p-4 sticky top-0 z-10 flex items-center gap-3 shadow-md">
        <button onClick={() => navigate('/m/home')} className="p-2 -ml-2 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
          <ArrowLeft size={24} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <ShieldCheck className="text-emerald-500" /> Liberación de Caja
          </h1>
          <p className="text-xs text-slate-400 font-mono mt-0.5"><HardDrive size={10} className="inline mr-1" />Cierre Definitivo — Sello</p>
        </div>
      </div>

      {/* Date selector */}
      <div className="bg-slate-900 border-b border-slate-800 p-4 sticky top-[68px] z-[9]">
        <div className="bg-slate-800 rounded-xl p-1 border border-slate-700">
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
            className="w-full bg-transparent text-slate-300 font-bold px-3 py-2 outline-none [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert" />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-24">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <Loader2 className="animate-spin mb-4" size={32} /><p>Consultando Cajas Asignadas...</p>
          </div>
        ) : cajasDelDia.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500 text-center px-4 border border-dashed border-slate-800 rounded-2xl bg-slate-900/30">
            <Box size={48} className="mb-4 opacity-50" />
            <p className="font-medium text-lg text-slate-400">Sin Movimientos</p>
            <p className="text-sm mt-1">No hay cajas asignadas para esta fecha.</p>
          </div>
        ) : cajasDelDia.map(caja => {
          const lib = getLiberacionForCaja(caja.id!);
          const yaLiberada = !!lib;
          const tieneSello = sellosDelDia.some(s => s.numeroCaja === caja.numeroCaja);
          return (
            <div key={caja.id}
              onClick={() => { if (!yaLiberada && tieneSello) setSelectedCaja(caja); }}
              className={`p-4 rounded-xl border relative overflow-hidden transition-all active:scale-[0.98] ${
                yaLiberada ? 'bg-emerald-950/20 border-emerald-900/50 opacity-80'
                : tieneSello ? 'bg-slate-800/80 border-slate-700 shadow-lg cursor-pointer'
                : 'bg-slate-900/50 border-slate-800 opacity-60 cursor-not-allowed'
              }`}>
              {yaLiberada && (
                <div className="absolute top-0 right-0 bg-emerald-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg flex items-center gap-1">
                  <CheckCircle size={12} /> LIBERADA
                </div>
              )}
              {!yaLiberada && !tieneSello && (
                <div className="absolute top-0 right-0 bg-amber-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg">SIN SELLO PUESTO</div>
              )}
              <div className="text-3xl font-black font-mono text-white tracking-widest leading-none mb-3 flex items-center gap-3 flex-wrap">
                <span className="text-blue-400">{caja.horaAsignacion || '--:--'}</span>
                {caja.numeroOperacion && <span className="text-pink-400">{caja.numeroOperacion}</span>}
                <span>{caja.numeroCaja}</span>
              </div>
              <div className="flex gap-2">
                <span className="bg-amber-900/30 text-amber-500/90 text-xs px-2.5 py-1 rounded-md font-medium border border-amber-800/50 truncate">{caja.transportista}</span>
              </div>
              {yaLiberada && (
                <div className="mt-3 bg-emerald-900/30 p-2.5 rounded-lg border border-emerald-800/50 flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-emerald-400 uppercase font-bold tracking-widest">Sello Validado</span>
                    <button type="button"
                      onClick={e => { e.stopPropagation(); const url = lib.fotos?.selloUrl; if (url && url !== 'PENDING') setPreviewUrl(url.replace('/view', '/preview')); }}
                      disabled={!lib.fotos?.selloUrl || lib.fotos.selloUrl === 'PENDING'}
                      className={`p-2.5 bg-slate-800 rounded-xl border transition-colors ${lib.fotos?.selloUrl && lib.fotos.selloUrl !== 'PENDING' ? 'text-emerald-400 hover:text-white border-slate-700 hover:border-emerald-500' : 'text-slate-600 border-slate-800 cursor-not-allowed opacity-40'}`}
                      title={lib.fotos?.selloUrl === 'PENDING' ? 'Foto subiendo...' : 'Ver foto Sello'}>
                      <ShieldCheck size={28} />
                    </button>
                  </div>
                  <div className="font-mono text-lg text-white font-bold">{lib.selloValidado}</div>
                  <span className="text-[10px] text-emerald-500/70 border-t border-emerald-800/50 pt-1 mt-1 block">{lib.fechaHoraRegistro}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* MODAL */}
      {selectedCaja && (
        <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col">
          <div className="bg-slate-900 border-b border-slate-800 p-4 sticky top-0 z-10 flex items-center gap-3 shadow-md">
            <button onClick={closeModal} disabled={isSaving} className="p-2 -ml-2 rounded-full hover:bg-slate-800 text-slate-400 transition-colors"><X size={24} /></button>
            <h1 className="text-xl font-bold text-white">Cierre de Caja</h1>
          </div>
          <div className="flex-1 overflow-y-auto p-5 pb-32">
            <div className="bg-slate-900 rounded-xl p-4 border border-slate-800 mb-6">
              <span className="text-xs text-slate-500 font-bold tracking-widest uppercase mb-1 block">Procesando Caja</span>
              <div className="text-4xl font-black font-mono text-white tracking-widest">{selectedCaja.numeroCaja}</div>
            </div>

            {validationError && (
              <div className="mb-6 bg-red-950/70 border border-red-500/50 p-4 rounded-xl flex items-start gap-3">
                <AlertCircle className="text-red-400 shrink-0 mt-0.5" />
                <div className="text-sm text-red-200 whitespace-pre-wrap font-medium">{validationError}</div>
              </div>
            )}

            {saveSuccess ? (
              <div className="mb-6 bg-emerald-900 border border-emerald-500 p-4 rounded-xl flex flex-col items-center text-center py-8">
                <CheckCircle size={48} className="text-emerald-400 mb-3" />
                <h2 className="text-xl font-bold text-white mb-1">¡Caja Liberada!</h2>
                <p className="text-emerald-200/70 text-sm">Validación biométrica cruzada completada exitosamente.</p>
              </div>
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-300 mb-3">
                  <ShieldCheck size={18} className="text-emerald-400" /> 1. Foto de Sello Físico
                </div>
                <input type="file" accept="image/*" capture="environment" id="camera-sello"
                  onChange={handleCaptureSello} className="hidden" />
                <label htmlFor="camera-sello"
                  className={`w-full py-4 rounded-xl cursor-pointer flex items-center justify-center gap-2 font-semibold transition-all shadow-sm mb-4 ${
                    fotoSelloFile ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-800/50' : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  } ${(isProcessingImage || isSaving) ? 'opacity-50 pointer-events-none' : ''}`}>
                  {isProcessingImage ? <><Loader2 size={20} className="animate-spin" /> Analizando Sello con IA...</>
                    : fotoSelloFile ? <><Camera size={20} /> Tomar Nueva Foto de Sello</>
                    : <><Camera size={20} /> Capturar y Extraer Sello</>}
                </label>
                {fotoSelloFile && (
                  <div className="animate-in fade-in slide-in-from-top-4 duration-300 mt-2 bg-slate-950 p-4 rounded-xl border border-slate-800">
                    <label className="text-xs text-emerald-500 font-bold tracking-widest uppercase mb-2 block">REVISIÓN DE SELLO EXTRAÍDO</label>
                    <input key={`sello-input-${aiRenderKey}`} type="text" value={extractedSello}
                      onChange={e => setExtractedSello(e.target.value.toUpperCase())}
                      className="w-full bg-black border border-slate-700 rounded-lg p-4 text-2xl font-mono text-center font-bold text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                      placeholder="A-123456" disabled={isSaving} />
                    <span className="text-[10px] text-slate-500 text-center block mt-2">Corrija manualmente si la IA erró algún carácter.</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {!saveSuccess && (
            <div className="bg-slate-900 border-t border-slate-800 p-4 pb-8 sticky bottom-0 z-20 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
              <button onClick={handleCierreCaja}
                disabled={isSaving || !fotoSelloFile || !extractedSello}
                className={`w-full py-5 rounded-2xl flex items-center justify-center gap-3 font-bold text-lg transition-all ${
                  (!fotoSelloFile || !extractedSello)
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                    : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20 shadow-xl'
                }`}>
                {isSaving ? <><Loader2 className="animate-spin" size={24} /> Validando Cruce Operativo...</>
                  : <><Save size={24} /> Cierre de Caja Definitivo</>}
              </button>
              <div className="text-center mt-3 text-xs text-slate-500 flex items-center justify-center gap-1.5">
                <HardDrive size={12} className="opacity-70" /> Valida sello contra servidor y sube evidencia a Drive.
              </div>
            </div>
          )}
        </div>
      )}

      {previewUrl && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col backdrop-blur-sm" onClick={() => setPreviewUrl(null)}>
          <div className="p-4 flex justify-between items-center bg-slate-900 border-b border-white/10">
            <span className="text-white font-semibold">Evidencia — Sello (Solo Lectura)</span>
            <button onClick={() => setPreviewUrl(null)} className="bg-red-500/20 text-red-400 p-2 rounded-full hover:bg-red-500/40"><X size={24} /></button>
          </div>
          <div className="flex-1 w-full h-full p-2 bg-black flex justify-center items-center">
            <iframe src={previewUrl} className="w-full h-full max-w-4xl max-h-[85vh] rounded-lg bg-slate-800"
              allow="autoplay" sandbox="allow-scripts allow-same-origin" />
          </div>
        </div>
      )}
    </div>
  );
};
