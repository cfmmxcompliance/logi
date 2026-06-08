import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import JSZip from 'jszip';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area, ComposedChart, Line } from 'recharts';
import { storageService } from '../services/storageService.ts';
import { PedimentoRecord, UserRole } from '../types.ts';
import { Database, Play, Anchor, Ship, Container, ClipboardCheck, TrendingUp, AlertTriangle, Loader2, RefreshCw, Calendar, X, Upload, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.tsx';
import { useLanguage } from '../context/LanguageContext.tsx';
import { SpecialistsPerformanceTable } from '../components/SpecialistsPerformanceTable.tsx';
import { ProcessingModal, ProcessingState, INITIAL_PROCESSING_STATE } from '../components/ProcessingModal.tsx';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const CS = { grid: { strokeDasharray:'3 3', vertical:false, stroke:'#f1f5f9' }, axis: { axisLine:false, tickLine:false, tick:{fill:'#64748b',fontSize:11} }, tt: { contentStyle:{borderRadius:'8px',border:'none',boxShadow:'0 4px 6px -1px rgb(0 0 0/.1)',fontSize:12} } };

// Helpers — tipoOperacion is now normalized to 'IMP' | 'EXP' by the parser
const isImport = (r: PedimentoRecord) => (r.tipoOperacion || '').toUpperCase() === 'IMP';
const isExport = (r: PedimentoRecord) => (r.tipoOperacion || '').toUpperCase() === 'EXP';

// Robust SAT date parser — maneja ISO (YYYY-MM-DD), DD/MM/YYYY y YYYYMMDD sin separadores
const parseSATDateObj = (s: string): Date | null => {
  if (!s || !s.trim()) return null;
  let raw = s.trim();
  raw = raw.replace(' ', 'T');
  
  let d = new Date(raw.length > 10 ? raw : raw + 'T12:00:00');
  if (!isNaN(d.getTime())) return d;
  
  let datePart = raw.split('T')[0];
  const sl = datePart.split('/');
  if (sl.length === 3) {
    d = new Date(`${sl[2]}-${sl[1].padStart(2,'0')}-${sl[0].padStart(2,'0')}T12:00:00`);
    if (!isNaN(d.getTime())) return d;
  }
  
  if (/^\d{8}$/.test(datePart)) {
    d = new Date(`${datePart.slice(0,4)}-${datePart.slice(4,6)}-${datePart.slice(6,8)}T12:00:00`);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
};

const parseSATMonth = (s: string): number => {
  const d = parseSATDateObj(s);
  return d ? d.getMonth() : -1;
};

const parseSATYear = (s: string): number => {
  const d = parseSATDateObj(s);
  return d ? d.getFullYear() : -1;
};

const recordMonth = (r: PedimentoRecord) => {
  const m = parseSATMonth(r.fechaPago);
  return m !== -1 ? m : parseSATMonth(r.fechaEntrada);
};
const recordYear = (r: PedimentoRecord) => {
  const y = parseSATYear(r.fechaPago);
  return y !== -1 ? y : parseSATYear(r.fechaEntrada);
};

const StatCard = ({title,value,sub,color,icon:Icon}:any) => (
  <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex items-start justify-between">
    <div>
      <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wider">{title}</h3>
      <div className="mt-2"><span className={`text-3xl font-bold ${color}`}>{value}</span></div>
      <span className="text-xs text-slate-400 mt-1 block">{sub}</span>
    </div>
    {Icon && <div className={`p-3 rounded-lg bg-slate-50 ${color}`}><Icon size={22}/></div>}
  </div>
);

const ChartCard = ({title,subtitle,children}:{title:string;subtitle?:string;children:React.ReactNode}) => (
  <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
    <div className="mb-4">
      <h3 className="font-semibold text-slate-800">{title}</h3>
      {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
    </div>
    <div className="h-64 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>{children as any}</ResponsiveContainer>
    </div>
  </div>
);

const VALUE_COLORS: Record<string,string> = {
  // — IMPORTACIÓN —
  IN: '#3b82f6',  // Importación definitiva normal
  A1: '#93c5fd',  // Importación temporal (IMMEX)
  AF: '#f59e0b',  // Activo Fijo
  A3: '#8b5cf6',  // Importación definitiva (de A1 temporal)
  A4: '#7c3aed',  // Importación temporal → definitiva
  V1: '#0ea5e9',  // Extracción depósito fiscal (imp)
  V2: '#38bdf8',  // Extracción depósito fiscal variante
  V3: '#06b6d4',  // Extracción depósito fiscal (otra)
  CI: '#64748b',  // Operación con COVE
  // — EXPORTACIÓN —
  RT: '#10b981',  // Retorno de importación temporal (más común)
  F1: '#34d399',  // Exportación definitiva
  F2: '#6ee7b7',  // Exportación temporal
  F3: '#a7f3d0',  // Retorno de exportación temporal
  F4: '#f43f5e',  // Retorno exportación temporal (variante)
  F5: '#fb7185',  // Retorno exportación temporal (variante 2)
  H1: '#14b8a6',  // Exportación definitiva IMMEX
  H2: '#2dd4bf',  // Exportación temporal IMMEX
  H3: '#5eead4',  // Retorno exportación temporal IMMEX
  G1: '#f97316',  // Exportación definitiva (otro régimen)
  G2: '#fb923c',  // Exportación temporal (otro régimen)
  default: '#94a3b8',
};

const SPECIAL_CLAVES = ['A3','A4','F4','F5','V3'];

const ValueByClaveCard = ({ title, color, total, breakdown }: {
  title: string; color: string;
  total: string;
  breakdown: { clave: string; usd: number; count: number }[];
}) => {
  const maxVal = Math.max(...breakdown.map(b => b.usd), 1);
  return (
    <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wider">{title}</h3>
          <div className="mt-1"><span className={`text-3xl font-bold ${color}`}>~${total}M</span></div>
          <span className="text-xs text-slate-400 mt-0.5 block">USD acumulado</span>
        </div>
        <div className={`p-3 rounded-lg bg-slate-50 ${color}`}><TrendingUp size={22}/></div>
      </div>
      {breakdown.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
          {breakdown.map(b => (
            <div key={b.clave}>
              <div className="flex justify-between items-center mb-0.5">
                <span className="text-xs font-bold" style={{ color: VALUE_COLORS[b.clave] || VALUE_COLORS.default }}>
                  {b.clave}
                </span>
                <span className="text-xs text-slate-500 font-mono">${(b.usd/1e6).toFixed(1)}M
                  <span className="text-slate-300 ml-1">({b.count} ped.)</span>
                </span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.round((b.usd/maxVal)*100)}%`, backgroundColor: VALUE_COLORS[b.clave] || VALUE_COLORS.default }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const CountByClaveCard = ({ title, color, total, sub, breakdown, unit = 'ped.' }: {
  title: string; color: string; total: string; sub: string;
  breakdown: { clave: string; count: number }[];
  unit?: string;
}) => {
  const maxCount = Math.max(...breakdown.map(b => b.count), 1);
  return (
    <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wider">{title}</h3>
          <div className="mt-1"><span className={`text-3xl font-bold ${color}`}>{total}</span></div>
          <span className="text-xs text-slate-400 mt-0.5 block">{sub}</span>
        </div>
        <div className={`p-3 rounded-lg bg-slate-50 ${color}`}><TrendingUp size={22}/></div>
      </div>
      {breakdown.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
          {breakdown.map(b => (
            <div key={b.clave}>
              <div className="flex justify-between items-center mb-0.5">
                <span className="text-xs font-bold" style={{ color: VALUE_COLORS[b.clave] || VALUE_COLORS.default }}>{b.clave}</span>
                <span className="text-xs text-slate-500 font-mono">{b.count.toLocaleString()} {unit}</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.round((b.count/maxCount)*100)}%`, backgroundColor: VALUE_COLORS[b.clave] || VALUE_COLORS.default }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const Dashboard = () => {
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();
  const { t } = useLanguage();
  const isAdmin = hasRole([UserRole.ADMIN]);

  const [vessels, setVessels] = useState(storageService.getVesselTracking());
  const [equipment, setEquipment] = useState(storageService.getEquipmentTracking());
  const [customs, setCustoms] = useState(storageService.getCustomsClearance());
  const [costs, setCosts] = useState(storageService.getCosts());
  const [reports, setReports] = useState<any[]>([]);
  const [allRecordsHydrated, setAllRecordsHydrated] = useState<PedimentoRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [procState, setProcState] = useState<ProcessingState>(INITIAL_PROCESSING_STATE);
  const curYear = new Date().getFullYear();
  const [startDate, setStartDate] = useState(`${curYear}-01-01`);
  const [endDate,   setEndDate]   = useState(`${curYear}-12-31`);



  useEffect(() => {
    if (user?.role === UserRole.AGENT) { navigate('/database'); return; }
    const refresh = () => {
      setVessels([...storageService.getVesselTracking()]);
      setEquipment([...storageService.getEquipmentTracking()]);
      setCustoms([...storageService.getCustomsClearance()]);
      setCosts([...storageService.getCosts()]);
    };
    refresh();
    return storageService.subscribe(refresh);
  }, []);



  // Live KPIs
  const now = new Date();
  const [cm, cy] = [now.getMonth(), now.getFullYear()];
  const vesselsOnWater = vessels.filter(v => v.etd && !v.ataPort).length;
  const customsPending = customs.filter(c => c.ataPort && !c.pedimentoPaymentDate).length;
  const deliveredMonth = customs.filter(c => { if(!c.ataFactory) return false; const d=new Date(c.ataFactory); return d.getMonth()===cm&&d.getFullYear()===cy; }).length;
  const totalCost = costs.reduce((s,c)=>s+(c.amount||0),0);

  // All PedimentoRecords dentro del rango de fechas seleccionado
  const allRecords = useMemo<PedimentoRecord[]>(() => {
    const start = startDate ? new Date(startDate + 'T00:00:00') : null;
    const end   = endDate   ? new Date(endDate   + 'T23:59:59') : null;
    return allRecordsHydrated.filter(r => {
      // Sin filtro de fecha activo → incluir todos
      if (!start && !end) return true;
      // Usar parser robusto para SAT (YYYY-MM-DD, DD/MM/YYYY, YYYYMMDD)
      const raw = (r.fechaPago || r.fechaEntrada || '').trim();
      if (!raw) return true; // sin fecha → incluir
      let d: Date | null = null;
      if (raw.length > 10) { d = new Date(raw); }
      else if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) { d = new Date(raw + 'T12:00:00'); }
      else if (/^\d{8}$/.test(raw)) { d = new Date(`${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}T12:00:00`); }
      else { const sl = raw.split('/'); if (sl.length===3) d = new Date(`${sl[2]}-${sl[1].padStart(2,'0')}-${sl[0].padStart(2,'0')}T12:00:00`); }
      if (!d || isNaN(d.getTime())) return true; // no parseable → incluir
      if (start && d < start) return false;
      if (end   && d > end)   return false;
      return true;
    });
  }, [allRecordsHydrated, startDate, endDate]);

  const hasLiveData = allRecords.length > 0;
  const isHydrating = loadingRecords && allRecordsHydrated.length === 0;

  // Rango legible para el subtítulo
  const rangeLabel = useMemo(() => {
    if (!startDate && !endDate) return 'Todo el historial';
    const fmt = (s: string) => s ? new Date(s + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '...';
    return `${fmt(startDate)} — ${fmt(endDate)}`;
  }, [startDate, endDate]);

  // ── COMPUTED CHART DATA ──────────────────────────────────────────
  const importVolumeData = useMemo(() => MONTHS.map((name,i) => {
    const recs = allRecords.filter(r => recordMonth(r)===i && isImport(r));
    return {
      name,
      IN:  recs.filter(r => (r.claveDocumento||'').toUpperCase()==='IN' && !r.isFixedAsset).length,
      A1:  recs.filter(r => (r.claveDocumento||'').toUpperCase()==='A1').length,
      AF:  recs.filter(r => r.isFixedAsset).length,
    };
  }), [allRecords]);

  const exportVolumeData = useMemo(() => MONTHS.map((name,i) => ({
    name,
    RT: allRecords.filter(r => recordMonth(r)===i && isExport(r)).length,
  })), [allRecords]);

  const importValueData = useMemo(() => MONTHS.map((name,i) => {
    const recs = allRecords.filter(r => recordMonth(r)===i && isImport(r));
    const af  = recs.filter(r=>r.isFixedAsset).reduce((s,r)=>s+r.totalValueUsd,0);
    const rest = recs.filter(r=>!r.isFixedAsset).reduce((s,r)=>s+r.totalValueUsd,0);
    return { name, 'Mat. Prima + Indir.': parseFloat((rest/1e6).toFixed(3)), 'Activo Fijo': parseFloat((af/1e6).toFixed(3)) };
  }), [allRecords]);

  const exportValueData = useMemo(() => MONTHS.map((name,i) => ({
    name,
    'Valor (M USD)': parseFloat((allRecords.filter(r=>recordMonth(r)===i&&isExport(r)).reduce((s,r)=>s+r.totalValueUsd,0)/1e6).toFixed(3)),
  })), [allRecords]);

  // Duties — 3 rutas en orden de prioridad:
  // 1) monthlyDuties precomputado (reportes guardados después del fix de mayo 2025)
  // 2) Reconstruir desde rawFiles[510] ya almacenados en Firestore (sin re-subir)
  // 3) Último recurso: leer igiTotal/ivaPrvTotal/dtaTotal de allRecordsHydrated
  const dutiesData = useMemo(() => {
    const ZERO = { 'IGI Import':0,'IVA Import':0,'IVA Import Efectivo':0,'IVA Import Fianza':0,'DTA Import':0,'IGI Export':0,'IVA Export':0,'DTA Export':0 };
    const acc = MONTHS.map((name) => ({ name, ...ZERO }));

    // ── RUTA 1: monthlyDuties precomputado (óptimo) ───────────────────────
    const hasPrecomputed = reports.some(rep => rep.monthlyDuties && rep.monthlyDuties.length > 0);
    if (hasPrecomputed) {
      reports.forEach(rep => {
        if (!rep.monthlyDuties) return;
        rep.monthlyDuties.forEach((row, i) => {
          if (!acc[i]) return;
          acc[i]['IGI Import'] += row['IGI Import'] || 0;
          acc[i]['IVA Import'] += row['IVA Import'] || 0;
          acc[i]['IVA Import Efectivo'] += row['IVA Import Efectivo'] || 0;
          acc[i]['IVA Import Fianza'] += row['IVA Import Fianza'] || 0;
          acc[i]['DTA Import'] += row['DTA Import'] || 0;
          acc[i]['IGI Export'] += row['IGI Export'] || 0;
          acc[i]['IVA Export'] += row['IVA Export'] || 0;
          acc[i]['DTA Export'] += row['DTA Export'] || 0;
        });
      });
    } else {
      // ── RUTA 2: Recalcular desde rawFiles[510] ya guardados ────────────
      // Esto evita tener que re-subir archivos. Se cruza 510 (impuestos) con 501 (fechaPago + tipoOperacion).
      let recomputedFromRaw = false;
      reports.forEach(rep => {
        const rawFiles = (rep as any).rawFiles as Array<{code:string; rows:string[][]}> | undefined;
        if (!rawFiles) return;
        const file510 = rawFiles.find(f => f.code === '510');
        const file501 = rawFiles.find(f => f.code === '501');
        if (!file510 || !file501) return;

        // Construir mapa de claves de pedimento → { tipoOperacion, fechaPago }
        const pedMap = new Map<string, { tipo: string; fecha: string }>();
        file501.rows.forEach(row => {
          if (!row || row.length < 4) return;
          if ((row[0]||'').startsWith('Patente')) return;
          const key = `${row[0]}-${row[1]}-${row[2]}`;
          const tipo = (row[3]||'').trim().toUpperCase();
          const tipoNorm = (tipo==='1'||tipo==='IMP'||tipo.startsWith('I')) ? 'IMP' : 'EXP';
          const fecha = (row[30]||row[29]||'').trim(); // fechaPago col[30], fechaEntrada col[29]
          pedMap.set(key, { tipo: tipoNorm, fecha });
        });

        // Acumular contribuciones del 510 cruzadas con el 501
        file510.rows.forEach(row => {
          if (!row || row.length < 8) return;
          if ((row[0]||'').startsWith('Patente')) return;
          const key = `${row[0]}-${row[1]}-${row[2]}`;
          const ped = pedMap.get(key);
          if (!ped) return;
          const clave = (row[3]||'').trim().toUpperCase();
          const fp = (row[6]||'').trim(); // Forma de pago
          const importe = parseFloat(row[7]||'0') || 0;
          if (!importe) return;
          if (fp !== '0' && fp !== '22') return; // Solo efectivo y fianza

          const month = parseSATMonth(ped.fecha);
          if (month < 0 || month > 11) return;
          recomputedFromRaw = true;
          const isExp = ped.tipo === 'EXP';

          if (clave === 'IGI' || clave === 'DBA') {
            if (fp === '0') isExp ? (acc[month]['IGI Export'] += importe) : (acc[month]['IGI Import'] += importe);
          } else if (clave === 'IVA' || clave === 'PRV') {
            if (isExp) {
              if (fp === '0') acc[month]['IVA Export'] += importe;
            } else {
              if (fp === '0') {
                acc[month]['IVA Import'] += importe;
                acc[month]['IVA Import Efectivo'] += importe;
              } else if (fp === '22') {
                acc[month]['IVA Import'] += importe;
                acc[month]['IVA Import Fianza'] += importe;
              }
            }
          } else if (clave === 'DTA') {
            if (fp === '0') isExp ? (acc[month]['DTA Export'] += importe) : (acc[month]['DTA Import'] += importe);
          }
        });
      });

      // ── RUTA 3: Último recurso desde igiTotal/ivaPrvTotal/dtaTotal ─────
      // Usa allRecordsHydrated (SIN filtro de fecha) para no excluir datos de años anteriores
      if (!recomputedFromRaw) {
        allRecordsHydrated.forEach(r => {
          const i = recordMonth(r);
          if (i < 0 || i > 11) return;
          const isExp = isExport(r);
          if (isExp) {
            acc[i]['IGI Export'] += r.igiTotal   || 0;
            acc[i]['IVA Export'] += r.ivaPrvTotal || 0;
            acc[i]['DTA Export'] += r.dtaTotal    || 0;
          } else {
            acc[i]['IGI Import'] += r.igiTotal   || 0;
            acc[i]['IVA Import'] += r.ivaPrvTotal || 0;
            acc[i]['DTA Import'] += r.dtaTotal    || 0;
          }
        });
      }
    }

    return acc.map(row => ({
      ...row,
      'IGI Import': parseFloat(row['IGI Import'].toFixed(1)),
      'IVA Import': parseFloat(row['IVA Import'].toFixed(1)),
      'IVA Import Efectivo': parseFloat(row['IVA Import Efectivo'].toFixed(1)),
      'IVA Import Fianza': parseFloat(row['IVA Import Fianza'].toFixed(1)),
      'DTA Import': parseFloat(row['DTA Import'].toFixed(1)),
      'IGI Export': parseFloat(row['IGI Export'].toFixed(1)),
      'IVA Export': parseFloat(row['IVA Export'].toFixed(1)),
      'DTA Export': parseFloat(row['DTA Export'].toFixed(1)),
    }));
  }, [reports, allRecordsHydrated]);


  // Contenedores por mes (504 → 501)
  const containerVolumeData = useMemo(() => MONTHS.map((name, i) => ({
    name,
    'Imp.': allRecords.filter(r => recordMonth(r)===i && isImport(r)).reduce((s,r) => s+(r.containerCount||0), 0),
    'Exp.': allRecords.filter(r => recordMonth(r)===i && isExport(r)).reduce((s,r) => s+(r.containerCount||0), 0),
  })), [allRecords]);

  // Always-static charts (no field in DataStage for these)
  const gidSavingsData: any[] = [];

  // Operaciones Especiales — live desde DataStage por claves A3, A4, F4, F5, V3
  const liveSpecialOpsData = useMemo(() => {
    if (!hasLiveData) return null;
    return MONTHS.map((name, i) => {
      const base: Record<string, number> = { name: 0 };
      SPECIAL_CLAVES.forEach(k => { base[k] = 0; });
      allRecords
        .filter(r => recordMonth(r) === i && SPECIAL_CLAVES.includes((r.claveDocumento||'').toUpperCase()))
        .forEach(r => {
          const k = (r.claveDocumento||'').toUpperCase();
          base[k] = (base[k] || 0) + 1;
        });
      const total = SPECIAL_CLAVES.reduce((s, k) => s + (base[k] || 0), 0);
      return { name, ...base, Pedimentos: total };
    });
  }, [allRecords, hasLiveData]);

  const specialOpsData = liveSpecialOpsData ?? [];
  const hasLiveSpecial = liveSpecialOpsData !== null;

  // Revisiones aduanales — prioridad: reports con reviewsByMonth (guardados en DataStage)
  const liveRevisionsData = useMemo(() => {
    const combined: { imp: number; exp: number }[] = Array.from({ length: 12 }, () => ({ imp: 0, exp: 0 }));
    let hasAnyRevisionData = false;
    reports.forEach(report => {
      if (!report.reviewsByMonth) return;
      hasAnyRevisionData = true;
      report.reviewsByMonth.forEach((m: any, i: number) => {
        combined[i].imp += m.Import || 0;
        combined[i].exp += m.Export || 0;
      });
    });
    if (!hasAnyRevisionData) return null;
    return combined.map((m, i) => ({
      name: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][i],
      Import: m.imp,
      Export: m.exp,
    }));
  }, [reports]);

  const revisionsData = liveRevisionsData ?? [];
  const hasLiveRevisions = liveRevisionsData !== null;

  const ivData     = hasLiveData ? importVolumeData : [];
  const evData     = hasLiveData ? exportVolumeData : [];
  const ivalData   = hasLiveData ? importValueData  : [];
  const evalData   = hasLiveData ? exportValueData  : [];
  const dutData    = hasLiveData ? dutiesData        : [];

  const handleHydrateAll = async () => {
    setProcState({
        isOpen: true,
        status: 'loading',
        title: 'Sincronizando Pedimentos',
        message: 'Buscando reportes en Firebase...',
        progress: 0
    });
    setLoadingRecords(true);

    try {
      let reportsToProcess = [...reports]; // Fallback to local if offline

      // ALWAYS force download from Firebase to guarantee we get all historical data
      if (storageService.isCloudMode ? storageService.isCloudMode() : true) {
        try {
          const { collection, getDocs } = await import('firebase/firestore');
          const { db } = await import('../services/firebaseConfig.ts');
          if (db) {
            const snap = await getDocs(collection(db, 'data_stage_reports'));
            if (!snap.empty) {
               // Reemplazamos lo local con la verdad absoluta de Firebase
               reportsToProcess = snap.docs.map(d => ({ ...d.data(), id: d.id })) as any[];
            }
          }
        } catch (e) {
          console.error("Error fetching reports from Firebase:", e);
        }
      }

      if (!reportsToProcess || reportsToProcess.length === 0) {
        alert("No hay reportes de DataStage disponibles en Firebase para descargar.");
        setProcState(INITIAL_PROCESSING_STATE);
        setLoadingRecords(false);
        return;
      }

      const total = reportsToProcess.length;
      let loadedCount = 0;
      const allRecs: PedimentoRecord[] = [];

      for (const report of reportsToProcess) {
        setProcState(prev => ({ ...prev, message: `Descargando reporte ${loadedCount + 1} de ${total}...` }));
        const recs = report.records && report.records.length > 0
          ? report.records
          : await (storageService as any).getDataStageReportWithRecords(report.id);
        
        allRecs.push(...recs);
        loadedCount++;
        setProcState(prev => ({ ...prev, progress: Math.round((loadedCount / total) * 100) }));
      }

      setProcState(prev => ({ ...prev, message: 'Cruzando ED con expedientes...' }));

      // === CRUCE 507→501 EN VIVO ===
      const recordMap = new Map<string, PedimentoRecord>();
      allRecs.forEach(r => recordMap.set(r.id, r));

      for (const report of reports) {
        const rawFiles = (report as any).rawFiles as Array<{code:string; rows:string[][]}> | undefined;
        if (!rawFiles) continue;
        const file507 = rawFiles.find(f => f.code === '507');
        if (!file507) continue;

        const edCounts = new Map<string, number>();
        file507.rows.forEach(row => {
          if (!row || row.length < 4) return;
          if ((row[0]||'').startsWith('Patente')) return; 
          const clave = (row[3]||'').trim().toUpperCase();
          if (clave !== 'ED') return;
          const id = `${row[0]}-${row[1]}-${row[2]}`;
          edCounts.set(id, (edCounts.get(id)||0) + 1);
        });

        edCounts.forEach((count, id) => {
          const record = recordMap.get(id);
          if (record && record.tipoOperacion === 'EXP') {
            record.edDocuments = (record.edDocuments||0) + count;
          }
        });
      }

      setReports(reportsToProcess);
      setAllRecordsHydrated([...allRecs]);
      setProcState({
        isOpen: true,
        status: 'success',
        title: '¡Sincronización Completa!',
        message: `Se cargaron ${allRecs.length} pedimentos exitosamente.`,
        progress: 100
      });
      setTimeout(() => setProcState(INITIAL_PROCESSING_STATE), 2000);
    } catch(err: any) {
      console.error(err);
      setProcState({
        isOpen: true,
        status: 'error',
        title: 'Error de Descarga',
        message: err.message || 'Error al descargar datos de Firebase',
        progress: 0
      });
    } finally {
      setLoadingRecords(false);
    }
  };

  // Summary KPIs from live data
  const totalImport = allRecords.filter(isImport).length;
  const totalExport = allRecords.filter(isExport).length;
  const totalImportUSD = (allRecords.filter(isImport).reduce((s,r)=>s+r.totalValueUsd,0)/1e6).toFixed(1);
  const totalExportUSD = (allRecords.filter(isExport).reduce((s,r)=>s+r.totalValueUsd,0)/1e6).toFixed(1);

  // Breakdown by claveDocumento (count + value)
  const importByKey = useMemo(() => {
    const map = new Map<string,{usd:number;count:number}>();
    allRecords.filter(isImport).forEach(r => {
      const k = (r.claveDocumento||'?').toUpperCase();
      const cur = map.get(k) || {usd:0,count:0};
      map.set(k, {usd: cur.usd + r.totalValueUsd, count: cur.count + 1});
    });
    return Array.from(map.entries()).map(([clave,v]) => ({clave,...v})).sort((a,b) => b.count - a.count);
  }, [allRecords]);

  const exportByKey = useMemo(() => {
    const map = new Map<string,{usd:number;count:number}>();
    allRecords.filter(isExport).forEach(r => {
      const k = (r.claveDocumento||'?').toUpperCase();
      const cur = map.get(k) || {usd:0,count:0};
      map.set(k, {usd: cur.usd + r.totalValueUsd, count: cur.count + 1});
    });
    return Array.from(map.entries()).map(([clave,v]) => ({clave,...v})).sort((a,b) => b.count - a.count);
  }, [allRecords]);

  // Alias para las tarjetas de valor (ordenadas por USD)
  const importValueByKey = useMemo(() => [...importByKey].sort((a,b) => b.usd - a.usd), [importByKey]);
  const exportValueByKey = useMemo(() => [...exportByKey].sort((a,b) => b.usd - a.usd), [exportByKey]);

  // Facturas por clave de pedimento
  // IMPORTACIÓN: solo del 505 (facturas comerciales de proveedor extranjero)
  const importInvoicesByKey = useMemo(() => {
    const map = new Map<string,number>();
    allRecords.filter(isImport).forEach(r => {
      const k = (r.claveDocumento||'?').toUpperCase();
      map.set(k, (map.get(k)||0) + (r.invoices?.length||0));
    });
    return Array.from(map.entries())
      .map(([clave, count]) => ({ clave, count }))
      .sort((a,b) => b.count - a.count);
  }, [allRecords]);

  // EXPORTACIÓN: 505 (factura comercial) + 507-ED (CFDIs declarados)
  const exportInvoicesByKey = useMemo(() => {
    const map = new Map<string,number>();
    allRecords.filter(isExport).forEach(r => {
      const k = (r.claveDocumento||'?').toUpperCase();
      const total = (r.invoices?.length||0) + (r.edDocuments||0);
      map.set(k, (map.get(k)||0) + total);
    });
    return Array.from(map.entries())
      .map(([clave, count]) => ({ clave, count }))
      .sort((a,b) => b.count - a.count);
  }, [allRecords]);

  const totalImportInvoices = importInvoicesByKey.reduce((s,b) => s+b.count, 0);
  const totalExportInvoices = exportInvoicesByKey.reduce((s,b) => s+b.count, 0);

  // === CONTENEDORES (504 → 501) ===
  // containerCount viene del 504, tipoOperacion del 501
  const importContainersByKey = useMemo(() => {
    const map = new Map<string,number>();
    allRecords.filter(isImport).forEach(r => {
      if (!(r.containerCount||0)) return;
      const k = (r.claveDocumento||'?').toUpperCase();
      map.set(k, (map.get(k)||0) + (r.containerCount||0));
    });
    return Array.from(map.entries()).map(([clave,count]) => ({clave,count})).sort((a,b)=>b.count-a.count);
  }, [allRecords]);

  const exportContainersByKey = useMemo(() => {
    const map = new Map<string,number>();
    allRecords.filter(isExport).forEach(r => {
      if (!(r.containerCount||0)) return;
      const k = (r.claveDocumento||'?').toUpperCase();
      map.set(k, (map.get(k)||0) + (r.containerCount||0));
    });
    return Array.from(map.entries()).map(([clave,count]) => ({clave,count})).sort((a,b)=>b.count-a.count);
  }, [allRecords]);

  const totalImportContainers = importContainersByKey.reduce((s,b)=>s+b.count,0);
  const totalExportContainers = exportContainersByKey.reduce((s,b)=>s+b.count,0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-start gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard Operacional</h1>
          <p className="text-sm text-slate-500 mt-1">
            {hasLiveData ? `DataStage — ${allRecords.length} pedimentos cargados` : 'Customs Report — Sin datos cargados'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Date range selector */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-3 py-1.5 shadow-sm">
            <Calendar size={13} className="text-slate-400 shrink-0" />
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="text-sm text-slate-700 font-medium bg-transparent border-none focus:ring-0 outline-none w-[120px]"
              title="Fecha inicial"
            />
            <span className="text-slate-300 font-medium">—</span>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="text-sm text-slate-700 font-medium bg-transparent border-none focus:ring-0 outline-none w-[120px]"
              title="Fecha final"
            />
            {(startDate !== `${curYear}-01-01` || endDate !== `${curYear}-12-31`) && (
              <button
                onClick={() => { setStartDate(`${curYear}-01-01`); setEndDate(`${curYear}-12-31`); }}
                className="ml-1 text-slate-400 hover:text-red-500 transition-colors"
                title="Restablecer al año actual"
              >
                <X size={13} />
              </button>
            )}
          </div>
          {hasLiveData && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-bold">
              <RefreshCw size={12}/> Datos en Vivo
            </span>
          )}
          <span className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${storageService.isCloudMode()?'bg-orange-50 text-orange-700 border-orange-200':'bg-slate-100 text-slate-600 border-slate-200'}`}>
            <Database size={12}/>{storageService.isCloudMode()?'Firebase Cloud':'Local'}
          </span>
        </div>
      </div>

      {/* Empty state / Manual Sync Banner */}
      {!hasLiveData && isAdmin && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 flex items-center justify-between gap-4">
          <p className="text-blue-700 text-sm font-medium">Los datos no se han cargado. Sincroniza desde la nube.</p>
          <button onClick={handleHydrateAll} disabled={loadingRecords} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50">
            {loadingRecords?<Loader2 size={16} className="animate-spin"/>:<Database size={16} fill="currentColor"/>}{loadingRecords?'Sincronizando...':'Descargar Datos'}
          </button>
        </div>
      )}



      {/* Customs YTD Summary */}
      <section>
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          {t('dash.sec_ytd')} {hasLiveData ? rangeLabel : ''}
          {isHydrating && <span className="flex items-center gap-1 text-blue-500 normal-case font-normal"><Loader2 size={12} className="animate-spin"/> {t('dash.loading')}</span>}
        </h2>
        {/* — Pedimentos & Contenedores — */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <CountByClaveCard
            title={t('dash.imp_ped')}
            color="text-blue-600"
            total={hasLiveData ? totalImport.toLocaleString() : '0'}
            sub={t('dash.ytd_sub')}
            breakdown={hasLiveData ? importByKey : []}
          />
          <CountByClaveCard
            title={t('dash.exp_ped')}
            color="text-indigo-600"
            total={hasLiveData ? totalExport.toLocaleString() : '0'}
            sub="RT, F1, F2, H1, G1 y más"
            breakdown={hasLiveData ? exportByKey : []}
          />
          <CountByClaveCard
            title="CONTENEDORES IMPORTACIÓN"
            color="text-sky-600"
            total={hasLiveData ? totalImportContainers.toLocaleString() : '0'}
            sub="504 — contenedores IMP"
            unit="cont."
            breakdown={hasLiveData ? importContainersByKey : []}
          />
          <CountByClaveCard
            title="CONTENEDORES EXPORTACIÓN"
            color="text-teal-600"
            total={hasLiveData ? totalExportContainers.toLocaleString() : '0'}
            sub="504 — contenedores EXP"
            unit="cont."
            breakdown={hasLiveData ? exportContainersByKey : []}
          />
        </div>

        {/* — Gráfica mensual de contenedores — */}
        <ChartCard title="CONTENEDORES POR MES" subtitle={hasLiveData ? 'DataStage — 504 cruzado con 501 (IMP/EXP)' : 'Sin datos — sube ZIPs en DataStage'}>
          <BarChart data={containerVolumeData}>
            <CartesianGrid {...CS.grid}/><XAxis dataKey="name" {...CS.axis}/><YAxis {...CS.axis} allowDecimals={false}/>
            <Tooltip {...CS.tt}/><Legend iconType="circle" wrapperStyle={{fontSize:12}}/>
            <Bar dataKey="Imp." fill="#0ea5e9" radius={[4,4,0,0]}/>
            <Bar dataKey="Exp." fill="#14b8a6" radius={[4,4,0,0]}/>
          </BarChart>
        </ChartCard>

        {/* — Valores & Facturas — */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <ValueByClaveCard
            title={t('dash.imp_val')}
            color="text-emerald-600"
            total={hasLiveData ? totalImportUSD : '0'}
            breakdown={hasLiveData ? importValueByKey : []}
          />
          <ValueByClaveCard
            title={t('dash.exp_val')}
            color="text-purple-600"
            total={hasLiveData ? totalExportUSD : '0'}
            breakdown={hasLiveData ? exportValueByKey : []}
          />
          <CountByClaveCard
            title="FACTURAS IMPORTACIÓN"
            color="text-cyan-600"
            total={hasLiveData ? totalImportInvoices.toLocaleString() : '0'}
            sub="505 — facturas comerciales"
            unit="fact."
            breakdown={hasLiveData ? importInvoicesByKey : []}
          />
          <CountByClaveCard
            title="FACTURAS EXPORTACIÓN"
            color="text-violet-600"
            total={hasLiveData ? totalExportInvoices.toLocaleString() : '0'}
            sub="505 (comerciales) + 507-ED (CFDIs)"
            unit="fact."
            breakdown={hasLiveData ? exportInvoicesByKey : []}
          />
        </div>
        {!hasLiveData && (
          <div className="mt-3 flex items-center gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <AlertTriangle size={13}/>
            {t('dash.no_data_warn')}
          </div>
        )}
      </section>

      {/* Import Section */}
      <section>
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">{t('dash.sec_import')}</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <ChartCard title={t('dash.chart_imp_vol')} subtitle={t('dash.chart_imp_vol_sub')}>
            <BarChart data={ivData}>
              <CartesianGrid {...CS.grid}/><XAxis dataKey="name" {...CS.axis}/><YAxis {...CS.axis}/>
              <Tooltip {...CS.tt}/><Legend iconType="circle" wrapperStyle={{fontSize:12}}/>
              <Bar dataKey="IN" name="Import Normal (IN)" fill="#3b82f6" stackId="a"/>
              <Bar dataKey="A1" name="Temporal (A1)" fill="#93c5fd" stackId="a"/>
              <Bar dataKey="AF" name="Activo Fijo (AF)" fill="#f59e0b" stackId="a" radius={[4,4,0,0]}/>
            </BarChart>
          </ChartCard>
          <ChartCard title={t('dash.chart_imp_val')} subtitle={t('dash.chart_imp_val_sub')}>
            <BarChart data={ivalData}>
              <CartesianGrid {...CS.grid}/><XAxis dataKey="name" {...CS.axis}/><YAxis {...CS.axis} tickFormatter={v=>`$${v}M`}/>
              <Tooltip {...CS.tt} formatter={(v:any)=>[`$${Number(v).toFixed(2)}M`]}/>
              <Legend iconType="circle" wrapperStyle={{fontSize:12}}/>
              <Bar dataKey="Mat. Prima + Indir." fill="#1d4ed8" stackId="a"/>
              <Bar dataKey="Activo Fijo" fill="#f59e0b" stackId="a" radius={[4,4,0,0]}/>
            </BarChart>
          </ChartCard>
        </div>
      </section>

      {/* Export Section */}
      <section>
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">{t('dash.sec_export')}</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <ChartCard title={t('dash.chart_exp_vol')} subtitle={t('dash.chart_exp_vol_sub')}>
            <BarChart data={evData}>
              <CartesianGrid {...CS.grid}/><XAxis dataKey="name" {...CS.axis}/><YAxis {...CS.axis}/>
              <Tooltip {...CS.tt}/><Bar dataKey="RT" name="Exportación RT" fill="#10b981" radius={[4,4,0,0]}/>
            </BarChart>
          </ChartCard>
          <ChartCard title={t('dash.chart_exp_val')} subtitle={t('dash.chart_exp_val_sub')}>
            <AreaChart data={evalData}>
              <defs><linearGradient id="eg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.15}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient></defs>
              <CartesianGrid {...CS.grid}/><XAxis dataKey="name" {...CS.axis}/><YAxis {...CS.axis} tickFormatter={v=>`$${v}M`}/>
              <Tooltip {...CS.tt} formatter={(v:any)=>[`$${v}M`,'Valor']}/>
              <Area type="monotone" dataKey="Valor (M USD)" stroke="#10b981" strokeWidth={2} fill="url(#eg)"/>
            </AreaChart>
          </ChartCard>
        </div>
      </section>

      {/* Special Ops + Duties */}
      <section>
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">{t('dash.sec_special')}</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <ChartCard
            title={t('dash.chart_special')}
            subtitle={hasLiveSpecial ? `DataStage — claves: ${SPECIAL_CLAVES.join(', ')}` : t('dash.chart_special_sub')}
          >
            <BarChart data={specialOpsData}>
              <CartesianGrid {...CS.grid}/><XAxis dataKey="name" {...CS.axis}/><YAxis {...CS.axis}/>
              <Tooltip {...CS.tt}/>
              {hasLiveSpecial ? (
                <>
                  <Legend iconType="circle" wrapperStyle={{fontSize:11}}/>
                  {SPECIAL_CLAVES.map((k, idx) => (
                    <Bar
                      key={k}
                      dataKey={k}
                      name={k}
                      fill={VALUE_COLORS[k]}
                      stackId="a"
                      radius={idx === SPECIAL_CLAVES.length - 1 ? [4,4,0,0] : [0,0,0,0]}
                    />
                  ))}
                </>
              ) : (
                <Bar dataKey="Pedimentos" fill="#8b5cf6" radius={[4,4,0,0]}/>
              )}
            </BarChart>
          </ChartCard>
          <ChartCard title={t('dash.chart_contrib')} subtitle={hasLiveData ? 'DataStage — 510 contribuciones (IGI/IVA/DTA) cruce 501×510' : t('dash.chart_contrib_sub_static')}>
            <BarChart data={dutData}>
              <CartesianGrid {...CS.grid}/><XAxis dataKey="name" {...CS.axis}/><YAxis {...CS.axis} tickFormatter={(val: number) => val.toLocaleString('en-US')}/>
              <Tooltip {...CS.tt} formatter={(val: number) => val.toLocaleString('en-US')}/><Legend iconType="circle" wrapperStyle={{fontSize:12}}/>
              <Bar dataKey="IGI Import" name="IGI Imp (Efectivo)" fill="#ef4444" radius={[4,4,0,0]}/>
              <Bar dataKey="IVA Import Efectivo" name="IVA Imp (Efectivo)" fill="#ea580c" radius={[4,4,0,0]}/>
              <Bar dataKey="IVA Import Fianza" name="IVA Imp (Fianza)" fill="#fb923c" radius={[4,4,0,0]}/>
              <Bar dataKey="DTA Import" name="DTA Imp (Efectivo)" fill="#f59e0b" radius={[4,4,0,0]}/>
              <Bar dataKey="IGI Export" name="IGI Exp" fill="#3b82f6" radius={[4,4,0,0]}/>
              <Bar dataKey="IVA Export" name="IVA Exp" fill="#06b6d4" radius={[4,4,0,0]}/>
              <Bar dataKey="DTA Export" name="DTA Exp" fill="#0ea5e9" radius={[4,4,0,0]}/>
            </BarChart>
          </ChartCard>
        </div>
      </section>

      {/* GID Savings + Revisions */}
      <section>
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">{t('dash.sec_savings')}</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <ChartCard title={t('dash.chart_gid')} subtitle={t('dash.chart_gid_sub')}>
            <AreaChart data={gidSavingsData}>
              <defs><linearGradient id="gg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#7c3aed" stopOpacity={0.15}/><stop offset="95%" stopColor="#7c3aed" stopOpacity={0}/></linearGradient></defs>
              <CartesianGrid {...CS.grid}/><XAxis dataKey="name" {...CS.axis}/><YAxis {...CS.axis} tickFormatter={v=>`$${v}K`}/>
              <Tooltip {...CS.tt} formatter={(v:any)=>[`$${Number(v).toFixed(1)}K USD`,'Ahorro']}/>
              <Area type="monotone" dataKey="Ahorro Acum.(K USD)" stroke="#7c3aed" strokeWidth={2.5} fill="url(#gg)" dot={{r:4,fill:'#7c3aed'}}/>
            </AreaChart>
          </ChartCard>
          <ChartCard
            title={t('dash.chart_rev')}
            subtitle={hasLiveRevisions ? 'DataStage — _Sel.asc (semáforo) + _Inci.asc (incidencias)' : t('dash.chart_rev_sub')}
          >
            <ComposedChart data={revisionsData}>
              <CartesianGrid {...CS.grid}/><XAxis dataKey="name" {...CS.axis}/><YAxis {...CS.axis}/>
              <Tooltip {...CS.tt}/><Legend iconType="circle" wrapperStyle={{fontSize:12}}/>
              <Bar dataKey="Import" name={t('dash.rev_import')} fill="#3b82f6" radius={[4,4,0,0]}/>
              <Line type="monotone" dataKey="Export" name={t('dash.rev_export')} stroke="#f43f5e" strokeWidth={2} dot={{r:3}}/>
            </ComposedChart>
          </ChartCard>
        </div>
      </section>

      {/* Specialists Table */}
      <section>
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">{t('dash.sec_specialists')}</h2>
        <SpecialistsPerformanceTable customs={customs}/>
      </section>

      <ProcessingModal state={procState} onClose={() => setProcState(INITIAL_PROCESSING_STATE)} />
    </div>
  );
};