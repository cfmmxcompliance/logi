import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { asignacionCajaService } from '../services/asignacionCajaService.ts';
import { vigilanciaService } from '../services/vigilanciaService.ts';
import { uploadFileToDrive } from '../services/googleDriveService.ts';
import { geminiService } from '../services/geminiService.ts';
import { AsignacionCajaModel } from '../types/asignacionCaja.ts';
import { VigilanciaRecord } from '../types/vigilancia.ts';
import {
  Camera, ArrowLeft, Loader2, CheckCircle, Shield,
  AlertCircle, Truck, Box, Search, XCircle,
  AlertTriangle, Check, X
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useUploadGuard } from '../hooks/useUploadGuard.ts';
import { waitForOnline } from '../hooks/useOnlineStatus.ts';
import { UploadStatusBanner, UploadStatus } from '../components/UploadStatusBanner.tsx';
import { HandheldToolbar } from '../components/HandheldToolbar.tsx';

// ── Carpeta Drive exclusiva de Vigilancia ──
const VIGILANCIA_FOLDER_ID = '1GuT11oaQaws1WGpPgQdqpZeJfRf6U_iU';

// ── Secciones de inspección (orden mostrado al operario) ──
const SECTIONS: { key: keyof VigilanciaRecord; label: string; emoji: string; colorClass: string }[] = [
  { key: 'fotoPlacasCaja',      label: 'Placas Caja',                emoji: '🚛', colorClass: 'violet' },
  { key: 'fotoPlacasTracto',    label: 'Placas Tracto',              emoji: '🚚', colorClass: 'blue'   },
  { key: 'fotoLicencia',        label: 'Licencia de Conducir',       emoji: '🪪', colorClass: 'indigo' },
  { key: 'fotoLadoIzquierdo',   label: 'Lado Izquierdo Caja',        emoji: '◀️',  colorClass: 'emerald'},
  { key: 'fotoLadoDerecho',     label: 'Lado Derecho Caja',          emoji: '▶️',  colorClass: 'teal'  },
  { key: 'fotoTecho',           label: 'Techo / Roof Caja',          emoji: '⬆️',  colorClass: 'sky'   },
  { key: 'fotoParedFrontal',    label: 'Pared Frontal Caja',         emoji: '🔲',  colorClass: 'amber' },
  { key: 'fotoPuertas',         label: 'Puertas Int / Ext Caja',     emoji: '🚪',  colorClass: 'orange'},
  { key: 'fotoPisoInterior',    label: 'Piso Interior Caja',         emoji: '⬇️',  colorClass: 'yellow'},
  { key: 'fotoParteBaja',       label: 'Parte Baja / Chassis Caja',  emoji: '🔩',  colorClass: 'red'   },
];

const COLOR_MAP: Record<string, string> = {
  violet: 'bg-violet-500  shadow-[0_0_18px_rgba(139,92,246,0.35)]',
  indigo: 'bg-indigo-500  shadow-[0_0_18px_rgba(99,102,241,0.35)]',
  blue:   'bg-blue-500    shadow-[0_0_18px_rgba(59,130,246,0.35)]',
  emerald:'bg-emerald-500 shadow-[0_0_18px_rgba(16,185,129,0.35)]',
  teal:   'bg-teal-500    shadow-[0_0_18px_rgba(20,184,166,0.35)]',
  sky:    'bg-sky-500     shadow-[0_0_18px_rgba(14,165,233,0.35)]',
  amber:  'bg-amber-500   shadow-[0_0_18px_rgba(245,158,11,0.35)]',
  orange: 'bg-orange-500  shadow-[0_0_18px_rgba(249,115,22,0.35)]',
  yellow: 'bg-yellow-500  shadow-[0_0_18px_rgba(234,179,8,0.35)]',
  red:    'bg-red-500     shadow-[0_0_18px_rgba(239,68,68,0.35)]',
};

type SectionKey = keyof VigilanciaRecord;

export const HandheldVigilancia = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  // ── Date ──
  const getLocalToday = () =>
    new Date().toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' });
  const [dateStart, setDateStart] = useState(getLocalToday());
  const [dateEnd, setDateEnd] = useState(getLocalToday());

  // ── Data ──
  const [cajasDelDia, setCajasDelDia]         = useState<AsignacionCajaModel[]>([]);
  const [vigilancias, setVigilancias]         = useState<VigilanciaRecord[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [networkWarning, setNetworkWarning]   = useState<string | null>(null);

  // ── Modal ──
  const [selectedCaja, setSelectedCaja]       = useState<AsignacionCajaModel | null>(null);
  const [photos, setPhotos]                   = useState<Partial<Record<SectionKey, File>>>({});
  const [previews, setPreviews]               = useState<Partial<Record<SectionKey, string>>>({});
  const [isProcessing, setIsProcessing]       = useState(false);
  const [isSaving, setIsSaving]               = useState(false);
  const [saveSuccess, setSaveSuccess]         = useState(false);
  const [searchQuery, setSearchQuery]         = useState('');
  const [licenciaData, setLicenciaData]       = useState<VigilanciaRecord['licenciaExtraida']>({});
  const [isExtractingLicencia, setIsExtractingLicencia] = useState(false);

  // ── Validation step ──
  type ModalStep = 'validation' | 'inspection';
  const [modalStep, setModalStep]             = useState<ModalStep>('validation');
  const [confirmChofer, setConfirmChofer]     = useState<boolean | null>(null);
  const [confirmCaja, setConfirmCaja]         = useState<boolean | null>(null);
  const [confirmTracto, setConfirmTracto]     = useState<boolean | null>(null);
  const [validPlacasCaja, setValidPlacasCaja] = useState('');
  const [validPlacasTracto, setValidPlacasTracto] = useState('');
  const [showDiscrepancia, setShowDiscrepancia] = useState(false);
  const [discrepanciaNote, setDiscrepanciaNote] = useState('');
  const [isSavingDiscrep, setIsSavingDiscrep] = useState(false);

  // ── Upload ──
  const [uploadStatus, setUploadStatus]       = useState<UploadStatus>('idle');
  const [uploadLabel, setUploadLabel]         = useState<string | undefined>(undefined);
  const [uploadError, setUploadError]         = useState<string | undefined>(undefined);

  useUploadGuard(uploadStatus === 'uploading' || uploadStatus === 'waiting-online');

  // File refs — one per section
  const fileRefs = useRef<Partial<Record<SectionKey, HTMLInputElement | null>>>({});

  // ── Fetch ──
  const fetchWithTimeout = <T,>(p: Promise<T>, ms = 12000): Promise<T> =>
    Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('TIMEOUT_EXCEEDED')), ms))]);

  const fetchDataForRange = async () => {
    setLoading(true);
    if (dateStart === dateEnd) {
      try {
        const [cc, vv] = await Promise.all([
          asignacionCajaService.getAsignacionesByDateCached(dateStart),
          vigilanciaService.getByDateCached(dateStart),
        ]);
        if (cc.length > 0) {
          cc.sort((a, b) => (a.horaAsignacion || '00:00') < (b.horaAsignacion || '00:00') ? -1 : 1);
          setCajasDelDia(cc);
          setVigilancias(vv);
          setLoading(false);
        }
      } catch { /* cache miss */ }
    }

    try {
      const [cajas, vigs] = await fetchWithTimeout(Promise.all([
        dateStart === dateEnd ? asignacionCajaService.getAsignacionesByDate(dateStart) : asignacionCajaService.getAsignacionesByDateRange(dateStart, dateEnd),
        dateStart === dateEnd ? vigilanciaService.getByDate(dateStart) : vigilanciaService.getByDateRange(dateStart, dateEnd),
      ]));
      cajas.sort((a, b) => (a.horaAsignacion || '00:00') < (b.horaAsignacion || '00:00') ? -1 : 1);
      setCajasDelDia(cajas);
      setVigilancias(vigs);
    } catch (e: any) {
      if (cajasDelDia.length === 0) {
        setNetworkWarning(e.message === 'TIMEOUT_EXCEEDED'
          ? 'Señal lenta — mostrando datos en caché.'
          : 'Sin conexión — mostrando datos en caché.');
        setTimeout(() => setNetworkWarning(null), 5000);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDataForRange(); }, [dateStart, dateEnd]);

  const filteredCajas = searchQuery.trim()
    ? cajasDelDia.filter(c => {
        const q = searchQuery.toLowerCase();
        return (
          (c.numeroCaja || '').toLowerCase().includes(q) ||
          (c.numeroOperacion || '').toLowerCase().includes(q) ||
          (c.nombreDriver || '').toLowerCase().includes(q) ||
          (c.placasCaja || '').toLowerCase().includes(q) ||
          (c.placasTracto || '').toLowerCase().includes(q)
        );
      })
    : cajasDelDia;

  // ── Image compression ──
  const compress = (file: File): Promise<string> =>
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
          canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = () => reject(new Error('Image load error'));
      };
      reader.onerror = () => reject(new Error('File read error'));
    });

  // ── Capture handler ──
  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>, key: SectionKey) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setIsProcessing(true);
    try {
      const dataUrl = await compress(file);
      const blob = await (await fetch(dataUrl)).blob();
      const compressed = new File([blob], `${String(key)}_${Date.now()}.jpg`, { type: 'image/jpeg' });
      setPhotos(prev => ({ ...prev, [key]: compressed }));
      setPreviews(prev => ({ ...prev, [key]: dataUrl }));

      // ── AI extraction for driver's license ──
      if (key === 'fotoLicencia') {
        setIsExtractingLicencia(true);
        const base64 = dataUrl.split(',')[1];
        geminiService.extractLicenciaData(base64)
          .then(data => setLicenciaData(data))
          .catch(() => {})
          .finally(() => setIsExtractingLicencia(false));
      }
    } catch {
      alert('No se pudo procesar la foto.');
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Background upload of all captured photos ──
  const uploadAllBackground = useCallback(async (
    capturedPhotos: Partial<Record<SectionKey, File>>,
    vigId: string,
    numeroCaja: string,
  ) => {
    const MAX_RETRIES = 3;
    const entries = Object.entries(capturedPhotos) as [SectionKey, File][];
    if (entries.length === 0) return;

    if (!navigator.onLine) {
      setUploadStatus('waiting-online');
      setUploadLabel('Sin señal — esperando para subir evidencias...');
      await waitForOnline();
    }

    setUploadStatus('uploading');
    setUploadLabel(`Subiendo ${entries.length} foto(s) a Drive...`);
    setUploadError(undefined);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const ts = Date.now();
        const uploadResults = await Promise.all(
          entries.map(([key, file]) =>
            uploadFileToDrive(
              file,
              `vig_${numeroCaja}_${String(key)}_${ts}.jpg`,
              VIGILANCIA_FOLDER_ID
            )
          )
        );

        // Build URL map
        const urlMap: Partial<Record<SectionKey, string>> = {};
        entries.forEach(([key], idx) => {
          const url = uploadResults[idx]?.webViewLink || (uploadResults[idx] as any)?.url || '';
          if (url) urlMap[key] = url;
        });

        if (Object.keys(urlMap).length === 0) {
          setUploadError('Drive respondió pero sin URLs.');
          setUploadStatus('error');
          return;
        }

        await vigilanciaService.update(vigId, urlMap as any);
        setVigilancias(prev =>
          prev.map(v => v.id === vigId ? { ...v, ...urlMap } : v)
        );

        setUploadStatus('done');
        setUploadLabel(`${entries.length} foto(s) subidas ✔`);
        setTimeout(() => setUploadStatus('idle'), 4000);
        return;
      } catch (err: any) {
        setUploadError(err.message);
        if (attempt < MAX_RETRIES) {
          if (!navigator.onLine) { setUploadStatus('waiting-online'); await waitForOnline(); }
          setUploadStatus('uploading');
          setUploadLabel(`Reintentando (${attempt + 1}/${MAX_RETRIES})...`);
          await new Promise(r => setTimeout(r, 2000 * attempt));
        } else {
          setUploadStatus('error');
        }
      }
    }
  }, []);

  // ── Save inspection ──
  const handleSave = async () => {
    if (!selectedCaja) return;
    if (Object.keys(photos).length === 0) {
      alert('Captura al menos 1 foto para guardar.');
      return;
    }

    setIsSaving(true);
    try {
      const record: VigilanciaRecord = {
        fecha: dateEnd,
        asignacionCajaId: selectedCaja.id || '',
        numeroCaja: selectedCaja.numeroCaja,
        usuario: user?.email || user?.username || 'unknown',
        fechaHoraRegistro: new Date().toLocaleString('es-MX', { timeZone: 'America/Monterrey' }),
        validacionChofer: true,
        validacionCaja: true,
        validacionTracto: true,
        placasCajaFisica: validPlacasCaja,
        placasTractoFisica: validPlacasTracto,
        discrepancia: false,
      };

      const vigId = await vigilanciaService.create(record);

      // Optimistic local update
      const newRec = { ...record, id: vigId };
      setVigilancias(prev => {
        const idx = prev.findIndex(v => v.id === vigId);
        return idx >= 0 ? prev.map(v => v.id === vigId ? newRec : v) : [...prev, newRec];
      });

      const capturedPhotos = { ...photos };
      const caja = selectedCaja;

      // Close modal immediately
      setSaveSuccess(true);
      setPhotos({});
      setPreviews({});
      setSelectedCaja(null);
      setTimeout(() => setSaveSuccess(false), 3000);

      // Upload in background
      uploadAllBackground(capturedPhotos, vigId, caja.numeroCaja);

    } catch (err: any) {
      alert('Error al guardar: ' + (err.message || 'Desconocido'));
    } finally {
      setIsSaving(false);
    }
  };

  // ── Helpers ──
  const getVigilanciaForCaja = (cajaId: string) =>
    vigilancias.find(v => v.asignacionCajaId === cajaId);

  const countPhotos = (v?: VigilanciaRecord) => {
    if (!v) return 0;
    return SECTIONS.filter(s => !!v[s.key]).length;
  };

  const openModal = (caja: AsignacionCajaModel) => {
    setSelectedCaja(caja);
    setPhotos({});
    setPreviews({});
    setSaveSuccess(false);
    setLicenciaData({});
    // Reset validation
    setModalStep('validation');
    setConfirmChofer(null);
    setConfirmCaja(null);
    setConfirmTracto(null);
    setValidPlacasCaja(caja.placasCaja || '');
    setValidPlacasTracto(caja.placasTracto || '');
    setShowDiscrepancia(false);
    setDiscrepanciaNote('');
  };

  // ── Confirm validation → decide if proceed or show discrepancy ──
  const handleConfirmValidation = () => {
    if (confirmChofer === true && confirmCaja === true && confirmTracto === true) {
      setModalStep('inspection');
    } else {
      setShowDiscrepancia(true);
    }
  };

  // ── Save discrepancy report and close ──
  const handleSaveDiscrepancia = async () => {
    if (!selectedCaja) return;
    setIsSavingDiscrep(true);
    const items: string[] = [];
    if (confirmChofer === false) items.push('Chofer');
    if (confirmCaja === false)   items.push('Caja');
    if (confirmTracto === false) items.push('Tracto');
    const detalle = `Discrepancia en: ${items.join(', ')}. ${discrepanciaNote}`.trim();
    try {
      const record: VigilanciaRecord = {
        fecha: dateEnd,
        asignacionCajaId: selectedCaja.id || '',
        numeroCaja: selectedCaja.numeroCaja,
        usuario: user?.email || user?.username || 'unknown',
        fechaHoraRegistro: new Date().toLocaleString('es-MX', { timeZone: 'America/Monterrey' }),
        validacionChofer: confirmChofer ?? false,
        validacionCaja: confirmCaja ?? false,
        validacionTracto: confirmTracto ?? false,
        placasCajaFisica: validPlacasCaja,
        placasTractoFisica: validPlacasTracto,
        discrepancia: true,
        discrepanciaDetalle: detalle,
      };
      await vigilanciaService.create(record);
    } catch (e) {
      console.error('Error guardando discrepancia', e);
    } finally {
      setIsSavingDiscrep(false);
      setShowDiscrepancia(false);
      setSelectedCaja(null);
    }
  };

  // ── RENDER ──
  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">
      <UploadStatusBanner status={uploadStatus} error={uploadError} label={uploadLabel} />

      {/* ── HEADER ── */}
      <div className="flex-shrink-0 bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center gap-3 sticky top-0 z-30">
        <button onClick={() => navigate('/m/home')} className="p-2 text-slate-400 hover:text-white rounded-xl active:scale-95 transition-all">
          <ArrowLeft size={22} />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold tracking-tight flex items-center gap-2">
            <Shield size={20} className="text-red-400" /> Vigilancia
          </h1>
          <p className="text-xs text-slate-400">Inspección 7 puntos + Placas</p>
        </div>
      </div>

      {!selectedCaja && (
        <HandheldToolbar
          dateStart={dateStart} setDateStart={setDateStart}
          dateEnd={dateEnd} setDateEnd={setDateEnd}
          searchTerm={searchQuery} setSearchTerm={setSearchQuery}
        />
      )}

      {/* ── placeholder to close the original header div ── */}
      <div style={{display:'none'}}>
      </div>

      {/* ── NETWORK WARNING ── */}
      {networkWarning && (
        <div className="bg-amber-900/60 border-b border-amber-700/50 px-4 py-2 flex items-center gap-2 text-amber-300 text-sm">
          <AlertCircle size={16} /> {networkWarning}
        </div>
      )}

      {/* ── CAJA LIST ── */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-32 space-y-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <Loader2 className="animate-spin mb-3" size={32} />
            <p className="text-sm">Cargando asignaciones...</p>
          </div>
        ) : filteredCajas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-600">
            <Truck size={40} className="mb-3 opacity-40" />
            <p className="text-sm font-medium">
              {searchQuery ? `Sin resultados para "${searchQuery}"` : 'Sin asignaciones para esta fecha'}
            </p>
          </div>
        ) : (
          filteredCajas.map(caja => {
            const vig = getVigilanciaForCaja(caja.id || '');
            const done = countPhotos(vig);
            const total = SECTIONS.length;
            const pct = Math.round((done / total) * 100);
            const complete = done === total;

            return (
              <button
                key={caja.id}
                onClick={() => openModal(caja)}
                className={`w-full text-left bg-slate-800 border rounded-2xl p-4 flex items-center gap-4 transition-all active:scale-95 ${
                  vig?.discrepancia
                    ? 'border-red-500/60 shadow-[0_0_16px_rgba(239,68,68,0.2)]'
                    : complete
                      ? 'border-emerald-500/40 shadow-[0_0_16px_rgba(16,185,129,0.15)]'
                      : 'border-slate-700 hover:border-slate-600'
                }`}
              >
                {/* Icon */}
                <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-white flex-shrink-0 ${
                  vig?.discrepancia
                    ? 'bg-red-600 shadow-[0_0_16px_rgba(239,68,68,0.5)]'
                    : complete
                      ? 'bg-emerald-500 shadow-[0_0_16px_rgba(16,185,129,0.4)]'
                      : 'bg-red-500/20 border border-red-500/30'
                }`}>
                  {vig?.discrepancia
                    ? <AlertTriangle size={26} />
                    : complete
                      ? <CheckCircle size={28} />
                      : <Shield size={26} className="text-red-400" />
                  }
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-white font-mono tracking-wider text-lg">{caja.numeroCaja}</span>
                    {caja.numeroOperacion && (
                      <span className="text-xs font-bold text-pink-400 bg-pink-900/30 border border-pink-700/40 px-2 py-0.5 rounded-full">
                        {caja.numeroOperacion}
                      </span>
                    )}
                    {vig?.discrepancia && (
                      <span className="text-xs font-bold text-red-300 bg-red-900/50 border border-red-500/50 px-2 py-0.5 rounded-full animate-pulse">
                        ⚠ DISCREPANCIA
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-1 gap-2">
                    <p className="text-slate-200 text-sm font-medium truncate">{caja.nombreDriver || '—'}</p>
                    {caja.subLinea && (
                      <span className="text-xs text-blue-400 font-bold bg-blue-900/30 border border-blue-700/40 px-2 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap">
                        {caja.subLinea}
                      </span>
                    )}
                  </div>
                  {/* Progress */}
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${complete ? 'bg-emerald-500' : 'bg-red-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className={`text-xs font-bold ${complete ? 'text-emerald-400' : 'text-slate-500'}`}>
                      {done}/{total}
                    </span>
                  </div>
                </div>

                {/* Time */}
                <div className="flex-shrink-0 text-right">
                  <span className="text-blue-400 font-mono font-bold text-sm">{caja.horaAsignacion || '—'}</span>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* ── STEP 1: VALIDATION MODAL ── */}
      {selectedCaja && modalStep === 'validation' && (
        <div className="fixed inset-0 bg-slate-950/98 z-50 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex-shrink-0 bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center gap-3">
            <button onClick={() => setSelectedCaja(null)} className="p-2 text-slate-400 hover:text-white rounded-xl active:scale-95">
              <ArrowLeft size={22} />
            </button>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Shield size={16} className="text-amber-400" />
                <span className="font-bold text-white font-mono text-lg">{selectedCaja.numeroCaja}</span>
                {selectedCaja.numeroOperacion && (
                  <span className="text-xs font-bold text-pink-400 bg-pink-900/30 border border-pink-700/40 px-2 py-0.5 rounded-full">
                    {selectedCaja.numeroOperacion}
                  </span>
                )}
              </div>
              <p className="text-amber-400 text-xs font-medium">Validación de Identidad</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pt-5 pb-6 space-y-5">

            {/* System data card */}
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4">
              <p className="text-slate-400 text-xs uppercase tracking-widest font-semibold mb-3">Datos en Sistema</p>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500 text-sm">Chofer</span>
                  <span className="text-white text-sm font-bold">{selectedCaja.nombreDriver}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 text-sm">Caja</span>
                  <span className="text-white text-sm font-mono font-bold">{selectedCaja.numeroCaja}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 text-sm">Sub-Línea</span>
                  <span className="text-blue-400 text-sm font-bold">{selectedCaja.subLinea || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 text-sm">Placas Caja (Sistema)</span>
                  <span className="text-white text-sm font-mono">{selectedCaja.placasCaja || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 text-sm">Placas Tracto (Sistema)</span>
                  <span className="text-white text-sm font-mono">{selectedCaja.placasTracto || '—'}</span>
                </div>
              </div>
            </div>

            {/* Physical plates inputs */}
            <div className="bg-slate-800 border border-amber-600/30 rounded-2xl p-4 space-y-3">
              <p className="text-amber-400 text-xs uppercase tracking-widest font-semibold mb-1">Placas Físicas (captura lo que ves)</p>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">Placas Caja Físicas</label>
                <input
                  type="text"
                  value={validPlacasCaja}
                  onChange={e => setValidPlacasCaja(e.target.value.toUpperCase())}
                  placeholder="Ej: ABC1234"
                  className="w-full bg-slate-900 border border-slate-600 focus:border-amber-500 text-white rounded-xl px-4 py-3 text-sm font-mono uppercase outline-none transition-colors"
                />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">Placas Tracto Físicas</label>
                <input
                  type="text"
                  value={validPlacasTracto}
                  onChange={e => setValidPlacasTracto(e.target.value.toUpperCase())}
                  placeholder="Ej: XYZ9876"
                  className="w-full bg-slate-900 border border-slate-600 focus:border-amber-500 text-white rounded-xl px-4 py-3 text-sm font-mono uppercase outline-none transition-colors"
                />
              </div>
            </div>

            {/* Confirmation toggles */}
            <div className="space-y-3">
              <p className="text-slate-400 text-xs uppercase tracking-widest font-semibold">¿Los datos físicos coinciden con el sistema?</p>

              {[
                { label: '¿El Chofer es el correcto?',    value: confirmChofer,  set: setConfirmChofer  },
                { label: '¿La Caja es la asignada?',      value: confirmCaja,    set: setConfirmCaja    },
                { label: '¿El Tracto corresponde?',       value: confirmTracto,  set: setConfirmTracto  },
              ].map(({ label, value, set }) => (
                <div key={label} className="bg-slate-800 border border-slate-700 rounded-2xl p-4 flex items-center justify-between gap-4">
                  <p className="text-sm text-white font-medium flex-1">{label}</p>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => set(true)}
                      className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold transition-all active:scale-95 ${
                        value === true
                          ? 'bg-emerald-500 text-white shadow-[0_0_14px_rgba(16,185,129,0.5)]'
                          : 'bg-slate-700 text-slate-400 border border-slate-600'
                      }`}
                    >
                      <Check size={20} />
                    </button>
                    <button
                      onClick={() => set(false)}
                      className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold transition-all active:scale-95 ${
                        value === false
                          ? 'bg-red-500 text-white shadow-[0_0_14px_rgba(239,68,68,0.5)]'
                          : 'bg-slate-700 text-slate-400 border border-slate-600'
                      }`}
                    >
                      <X size={20} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="flex-shrink-0 bg-slate-900 border-t border-slate-800 p-4">
            <button
              onClick={handleConfirmValidation}
              disabled={confirmChofer === null || confirmCaja === null || confirmTracto === null}
              className="w-full h-14 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 disabled:text-slate-500 text-slate-900 font-bold text-base rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-95"
            >
              <Shield size={20} />
              Confirmar y Continuar
            </button>
          </div>
        </div>
      )}

      {/* ── DISCREPANCIA POPUP ── */}
      {showDiscrepancia && selectedCaja && (
        <div className="fixed inset-0 bg-slate-950/95 z-[60] flex items-center justify-center p-5">
          <div className="bg-slate-900 border border-red-500/50 rounded-3xl shadow-2xl shadow-red-900/30 w-full max-w-sm overflow-hidden">
            {/* Top danger bar */}
            <div className="bg-red-600 px-5 py-4 flex items-center gap-3">
              <AlertTriangle size={26} className="text-white flex-shrink-0" />
              <div>
                <p className="text-white font-bold text-lg leading-tight">Discrepancia Detectada</p>
                <p className="text-red-200 text-xs">Los datos no coinciden con el sistema</p>
              </div>
            </div>

            <div className="px-5 py-4 space-y-3">
              {/* Which items failed */}
              <div className="space-y-2">
                {[
                  { label: 'Chofer', value: confirmChofer },
                  { label: 'Caja',   value: confirmCaja   },
                  { label: 'Tracto', value: confirmTracto },
                ].map(({ label, value }) => (
                  <div key={label} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${
                    value === false ? 'bg-red-900/40 border border-red-500/40' : 'bg-emerald-900/20 border border-emerald-500/20'
                  }`}>
                    {value === false
                      ? <X size={16} className="text-red-400 flex-shrink-0" />
                      : <Check size={16} className="text-emerald-400 flex-shrink-0" />
                    }
                    <span className={`text-sm font-bold ${value === false ? 'text-red-300' : 'text-emerald-400'}`}>
                      {label} {value === false ? '— NO COINCIDE' : '— OK'}
                    </span>
                  </div>
                ))}
              </div>

              {/* Note */}
              <div>
                <label className="text-slate-400 text-xs mb-1 block">Detalle / Notas (opcional)</label>
                <textarea
                  value={discrepanciaNote}
                  onChange={e => setDiscrepanciaNote(e.target.value)}
                  rows={3}
                  placeholder="Ej: El tracto físico tiene placas XYZ diferente al sistema..."
                  className="w-full bg-slate-800 border border-slate-700 focus:border-red-500 text-white rounded-xl px-3 py-2 text-sm outline-none resize-none transition-colors"
                />
              </div>
            </div>

            <div className="px-5 pb-5 flex gap-3">
              <button
                onClick={() => setShowDiscrepancia(false)}
                className="flex-1 h-12 bg-slate-700 hover:bg-slate-600 text-white rounded-2xl font-bold text-sm transition-all active:scale-95"
              >
                Corregir
              </button>
              <button
                onClick={handleSaveDiscrepancia}
                disabled={isSavingDiscrep}
                className="flex-1 h-12 bg-red-600 hover:bg-red-500 disabled:bg-slate-700 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95"
              >
                {isSavingDiscrep
                  ? <Loader2 size={16} className="animate-spin" />
                  : <AlertTriangle size={16} />
                }
                Reportar y Salir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 2: INSPECTION MODAL ── */}
      {selectedCaja && modalStep === 'inspection' && (
        <div className="fixed inset-0 bg-slate-950/95 z-50 flex flex-col overflow-hidden">
          {/* Modal header */}
          <div className="flex-shrink-0 bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center gap-3">
            <button
              onClick={() => setSelectedCaja(null)}
              className="p-2 text-slate-400 hover:text-white rounded-xl active:scale-95"
            >
              <ArrowLeft size={22} />
            </button>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Box size={16} className="text-violet-400" />
                <span className="font-bold text-white font-mono text-lg">{selectedCaja.numeroCaja}</span>
                {selectedCaja.numeroOperacion && (
                  <span className="text-xs font-bold text-pink-400 bg-pink-900/30 border border-pink-700/40 px-2 py-0.5 rounded-full">
                    {selectedCaja.numeroOperacion}
                  </span>
                )}
              </div>
              <p className="text-slate-400 text-xs">Inspección 7 puntos + Placas</p>
            </div>
          </div>

          {/* Sections list */}
          <div className="flex-1 overflow-y-auto px-4 pt-4 pb-4 space-y-3">
            {SECTIONS.map((section, idx) => {
              const existingUrl = getVigilanciaForCaja(selectedCaja.id || '')?.[section.key] as string | undefined;
              const capturedFile = photos[section.key];
              const previewUrl = previews[section.key];
              const hasDone = !!existingUrl || !!capturedFile;
              const colorCls = COLOR_MAP[section.colorClass] || 'bg-slate-500';

              return (
                <div
                  key={section.key}
                  className={`bg-slate-800/80 border rounded-2xl p-4 flex items-center gap-4 ${
                    hasDone ? 'border-emerald-500/40' : 'border-slate-700'
                  }`}
                >
                  {/* Section icon */}
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${colorCls}`}>
                    {section.emoji}
                  </div>

                  {/* Label + status */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white">{idx + 1}. {section.label}</p>
                    {hasDone ? (
                      <p className="text-xs text-emerald-400 font-medium mt-0.5 flex items-center gap-1">
                        <CheckCircle size={12} /> Foto capturada
                      </p>
                    ) : (
                      <p className="text-xs text-slate-500 mt-0.5">Sin foto</p>
                    )}
                    {/* Thumbnail preview */}
                    {previewUrl && (
                      <img
                        src={previewUrl}
                        alt={section.label}
                        className="mt-2 w-full max-h-28 object-cover rounded-xl border border-slate-600"
                      />
                    )}
                    {existingUrl && !previewUrl && (
                      <p className="text-xs text-blue-400 mt-1 truncate">📎 Ya guardada en Drive</p>
                    )}

                    {/* ── Tarjeta de datos extraídos (solo para licencia) ── */}
                    {section.key === 'fotoLicencia' && (
                      isExtractingLicencia ? (
                        <div className="mt-2 flex items-center gap-2 text-indigo-400 text-xs">
                          <Loader2 size={12} className="animate-spin" />
                          Extrayendo datos con IA...
                        </div>
                      ) : licenciaData && Object.values(licenciaData).some(Boolean) ? (
                        <div className="mt-3 bg-indigo-950/60 border border-indigo-500/30 rounded-xl p-3 space-y-1.5">
                          <p className="text-indigo-300 text-xs font-bold uppercase tracking-wide mb-2">🪪 Datos extraídos</p>
                          {licenciaData.nombre && (
                            <div className="flex gap-2">
                              <span className="text-slate-500 text-xs w-24 flex-shrink-0">Nombre</span>
                              <span className="text-white text-xs font-medium">{licenciaData.nombre}</span>
                            </div>
                          )}
                          {licenciaData.numeroLicencia && (
                            <div className="flex gap-2">
                              <span className="text-slate-500 text-xs w-24 flex-shrink-0">No. Licencia</span>
                              <span className="text-white text-xs font-mono font-bold">{licenciaData.numeroLicencia}</span>
                            </div>
                          )}
                          {licenciaData.tipo && (
                            <div className="flex gap-2">
                              <span className="text-slate-500 text-xs w-24 flex-shrink-0">Tipo</span>
                              <span className="text-indigo-300 text-xs font-bold">{licenciaData.tipo}</span>
                            </div>
                          )}
                          {licenciaData.fechaVencimiento && (
                            <div className="flex gap-2">
                              <span className="text-slate-500 text-xs w-24 flex-shrink-0">Vencimiento</span>
                              <span className="text-amber-300 text-xs font-bold">{licenciaData.fechaVencimiento}</span>
                            </div>
                          )}
                          {licenciaData.fechaNacimiento && (
                            <div className="flex gap-2">
                              <span className="text-slate-500 text-xs w-24 flex-shrink-0">Nacimiento</span>
                              <span className="text-white text-xs">{licenciaData.fechaNacimiento}</span>
                            </div>
                          )}

                        </div>
                      ) : null
                    )}
                  </div>

                  {/* Capture button */}
                  <div className="flex-shrink-0">
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      ref={el => { fileRefs.current[section.key] = el; }}
                      onChange={e => handleCapture(e, section.key)}
                    />
                    <button
                      onClick={() => fileRefs.current[section.key]?.click()}
                      disabled={isProcessing}
                      className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all active:scale-95 ${
                        hasDone
                          ? 'bg-emerald-900/40 border border-emerald-500/40 text-emerald-400'
                          : 'bg-slate-700 border border-slate-600 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      {isProcessing ? <Loader2 size={20} className="animate-spin" /> : <Camera size={20} />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Save button */}
          <div className="flex-shrink-0 bg-slate-900 border-t border-slate-800 p-4">
            <button
              onClick={handleSave}
              disabled={isSaving || Object.keys(photos).length === 0}
              className="w-full h-14 bg-red-600 hover:bg-red-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-2xl font-bold text-lg flex items-center justify-center gap-3 transition-all active:scale-95 shadow-[0_0_24px_rgba(239,68,68,0.35)]"
            >
              {isSaving
                ? <><Loader2 size={22} className="animate-spin" /> Guardando...</>
                : <><Shield size={22} /> Guardar Inspección ({Object.keys(photos).length} foto{Object.keys(photos).length !== 1 ? 's' : ''})</>
              }
            </button>
          </div>
        </div>
      )}

      {/* Success toast */}
      {saveSuccess && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-6 py-3 rounded-2xl shadow-xl flex items-center gap-2 z-50 animate-fade-in">
          <CheckCircle size={20} /> Inspección guardada
        </div>
      )}
    </div>
  );
};
