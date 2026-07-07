import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import JSZip from 'jszip';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area, ComposedChart, Line } from 'recharts';
import { storageService } from '../services/storageService.ts';
import { PedimentoRecord, UserRole } from '../types.ts';
import { Database, Play, Anchor, Ship, Container, ClipboardCheck, TrendingUp, AlertTriangle, Loader2, RefreshCw, Calendar, X, Upload, CheckCircle2, Presentation } from 'lucide-react';
import { exportDashboardPpt } from '../utils/exportDashboardPpt.ts';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
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

// Gráfica con scroll horizontal — un punto por mes-año en orden cronológico
const ScrollableChartCard = ({title,subtitle,n,children}:{title:string;subtitle?:string;n:number;children:(w:number)=>React.ReactNode}) => {
  const w = Math.max(640, n * 62);
  return (
    <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
      <div className="mb-3">
        <h3 className="font-semibold text-slate-800">{title}</h3>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      <div className="overflow-x-auto" style={{height:288}}>
        <div style={{minWidth:w,height:256}}>{children(w)}</div>
      </div>
    </div>
  );
};
// Eje X inclinado para etiquetas mes-año
const XSA = {angle:-40,textAnchor:'end' as const,height:60,interval:0,tick:{fill:'#64748b',fontSize:10},axisLine:false,tickLine:false} as const;
const CM  = {top:4,right:16,left:0,bottom:48} as const; // chart margin

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
  const { t, language } = useLanguage();
  const isAdmin = hasRole([UserRole.ADMIN]);
  const [exportingPpt, setExportingPpt] = useState(false);

  const handleExportPpt = async () => {
    setExportingPpt(true);
    try {
      await exportDashboardPpt({
        t, rangeLabel,
        hasLiveData,
        totalImport,
        totalExport,
        totalImportUSD,
        totalExportUSD,
        totalImportContainers,
        totalExportContainers,
        totalImportInvoices,
        totalExportInvoices,
        // Breakdowns by clave
        importByKey,
        exportByKey,
        importValueByKey,
        exportValueByKey,
        importContainersByKey,
        exportContainersByKey,
        importInvoicesByKey,
        exportInvoicesByKey,
        // Chart series
        containerVolume160,
        containerVolume240,
        containerVolumeOther,
        importVolumeData:   hasLiveData ? importVolumeData  : [],
        exportVolumeData:   hasLiveData ? exportVolumeData  : [],
        importValueData:    hasLiveData ? importValueData   : [],
        exportValueData:    hasLiveData ? exportValueData   : [],
        dutiesData:         hasLiveData ? dutiesData        : [],
        specialOpsData,
        revisionsData,
        hasLiveSpecial,
      });
    } catch (e) {
      console.error('PPT export error:', e);
      alert('Error al generar el PPT. Revisa la consola.');
    } finally {
      setExportingPpt(false);
    }
  };

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
    if (!startDate && !endDate) return t('dash.all_history');
    const locale = language === 'en' ? 'en-US' : 'es-MX';
    const fmt = (s: string) => s ? new Date(s + 'T12:00:00').toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' }) : '...';
    return `${fmt(startDate)} — ${fmt(endDate)}`;
  }, [startDate, endDate, language, t]);

  // ── COMPUTED CHART DATA ──────────────────────────────────────────
  const mkKey = (y:number,m:number) => `${y}-${String(m).padStart(2,'0')}`;
  const sortBuckets = <T extends {year:number;month:number}>(b:Map<string,T>) =>
    Array.from(b.values()).sort((a,b)=>a.year!==b.year?a.year-b.year:a.month-b.month);

  const importVolumeData = useMemo(() => {
    const b = new Map<string,{year:number;month:number;IN:number;A1:number;AF:number}>();
    allRecords.filter(isImport).forEach(r => {
      const m=recordMonth(r),y=recordYear(r);
      if(m<0||m>11||y<2000) return;
      const k=mkKey(y,m);
      if(!b.has(k)) b.set(k,{year:y,month:m,IN:0,A1:0,AF:0});
      const s=b.get(k)!;
      if(r.isFixedAsset) s.AF++;
      else if((r.claveDocumento||'').toUpperCase()==='IN') s.IN++;
      else if((r.claveDocumento||'').toUpperCase()==='A1') s.A1++;
    });
    return sortBuckets(b).map(({year,month,IN,A1,AF})=>({name:`${MONTHS[month]} ${year}`,IN,A1,AF}));
  }, [allRecords]);

  const exportVolumeData = useMemo(() => {
    const b = new Map<string,{year:number;month:number;RT:number}>();
    allRecords.filter(isExport).forEach(r => {
      const m=recordMonth(r),y=recordYear(r);
      if(m<0||m>11||y<2000) return;
      const k=mkKey(y,m);
      if(!b.has(k)) b.set(k,{year:y,month:m,RT:0});
      b.get(k)!.RT++;
    });
    return sortBuckets(b).map(({year,month,RT})=>({name:`${MONTHS[month]} ${year}`,RT}));
  }, [allRecords]);

  const importValueData = useMemo(() => {
    const b = new Map<string,{year:number;month:number;mat:number;af:number}>();
    allRecords.filter(isImport).forEach(r => {
      const m=recordMonth(r),y=recordYear(r);
      if(m<0||m>11||y<2000) return;
      const k=mkKey(y,m);
      if(!b.has(k)) b.set(k,{year:y,month:m,mat:0,af:0});
      const s=b.get(k)!;
      if(r.isFixedAsset) s.af+=r.totalValueUsd; else s.mat+=r.totalValueUsd;
    });
    return sortBuckets(b).map(({year,month,mat,af})=>({
      name:`${MONTHS[month]} ${year}`,
      'Mat. Prima + Indir.':parseFloat((mat/1e6).toFixed(3)),
      'Activo Fijo':parseFloat((af/1e6).toFixed(3))
    }));
  }, [allRecords]);

  const exportValueData = useMemo(() => {
    const b = new Map<string,{year:number;month:number;val:number}>();
    allRecords.filter(isExport).forEach(r => {
      const m=recordMonth(r),y=recordYear(r);
      if(m<0||m>11||y<2000) return;
      const k=mkKey(y,m);
      if(!b.has(k)) b.set(k,{year:y,month:m,val:0});
      b.get(k)!.val+=r.totalValueUsd;
    });
    return sortBuckets(b).map(({year,month,val})=>({
      name:`${MONTHS[month]} ${year}`,
      'Valor (M USD)':parseFloat((val/1e6).toFixed(3))
    }));
  }, [allRecords]);

  // Duties — 3 rutas en orden de prioridad:
  // 1) monthlyDuties precomputado (reportes guardados después del fix de mayo 2025)
  // 2) Reconstruir desde rawFiles[510] ya almacenados en Firestore (sin re-subir)
  // 3) Último recurso: leer igiTotal/ivaPrvTotal/dtaTotal de allRecordsHydrated
  const dutiesData = useMemo(() => {
    const ZERO = { 'IGI Import':0,'IVA Import':0,'IVA Import Efectivo':0,'IVA Import Fianza':0,'DTA Import':0,'IGI Export':0,'IVA Export':0,'DTA Export':0 };
    type DB = typeof ZERO & {year:number;month:number};
    const acc = new Map<string,DB>();
    const getB = (y:number,m:number):DB => {
      const k=mkKey(y,m);
      if(!acc.has(k)) acc.set(k,{year:y,month:m,...ZERO});
      return acc.get(k)!;
    };

    // ── RUTA 1: monthlyDuties precomputado (óptimo) ───────────────────────
    const sm = startDate ? new Date(startDate+'T12:00:00').getMonth() : 0;
    const em = endDate   ? new Date(endDate  +'T12:00:00').getMonth() : 11;
    const sy = startDate ? new Date(startDate+'T12:00:00').getFullYear() : curYear;
    const ey = endDate   ? new Date(endDate  +'T12:00:00').getFullYear() : curYear;
    const inRange = (y:number,m:number) => {
      if(y<sy||y>ey) return false;
      if(y===sy&&m<sm) return false;
      if(y===ey&&m>em) return false;
      return true;
    };
    const hasPrecomputed = reports.some(rep => rep.monthlyDuties && rep.monthlyDuties.length > 0);
    if (hasPrecomputed) {
      reports.forEach(rep => {
        if (!rep.monthlyDuties) return;
        rep.monthlyDuties.forEach((row:any, i:number) => {
          const rowYear: number = row.year
            || (() => {
                const m=(rep.name||'').match(/\b(20\d{2})\b/);
                return m?parseInt(m[1],10):(rep.timestamp?new Date(rep.timestamp).getFullYear():curYear);
              })();
          if(!inRange(rowYear,i)) return;
          const b=getB(rowYear,i);
          b['IGI Import']          += row['IGI Import']          || 0;
          b['IVA Import']          += row['IVA Import']          || 0;
          b['IVA Import Efectivo'] += row['IVA Import Efectivo'] || 0;
          b['IVA Import Fianza']   += row['IVA Import Fianza']   || 0;
          b['DTA Import']          += row['DTA Import']          || 0;
          b['IGI Export']          += row['IGI Export']          || 0;
          b['IVA Export']          += row['IVA Export']          || 0;
          b['DTA Export']          += row['DTA Export']          || 0;
        });
      });
    } else {
      // ── RUTA 2: rawFiles[510] ya guardados ────────────────────────────
      let recomputedFromRaw = false;
      reports.forEach(rep => {
        const rawFiles = (rep as any).rawFiles as Array<{code:string;rows:string[][]}> | undefined;
        if (!rawFiles) return;
        const file510 = rawFiles.find(f => f.code === '510');
        const file501 = rawFiles.find(f => f.code === '501');
        if (!file510 || !file501) return;
        const pedMap = new Map<string,{tipo:string;fecha:string}>();
        file501.rows.forEach(row => {
          if (!row || row.length < 4 || (row[0]||'').startsWith('Patente')) return;
          const key=`${row[0]}-${row[1]}-${row[2]}`;
          const tipo=(row[3]||'').trim().toUpperCase();
          const tipoNorm=(tipo==='1'||tipo==='IMP'||tipo.startsWith('I'))?'IMP':'EXP';
          pedMap.set(key,{tipo:tipoNorm,fecha:(row[30]||row[29]||'').trim()});
        });
        file510.rows.forEach(row => {
          if (!row||row.length<8||(row[0]||'').startsWith('Patente')) return;
          const ped=pedMap.get(`${row[0]}-${row[1]}-${row[2]}`);
          if (!ped) return;
          const clave=(row[3]||'').trim().toUpperCase();
          const fp=(row[6]||'').trim();
          const importe=parseFloat(row[7]||'0')||0;
          if (!importe||!(fp==='0'||fp==='22')) return;
          const month=parseSATMonth(ped.fecha);
          const year=parseSATYear(ped.fecha);
          if (month<0||month>11||year<2000||!inRange(year,month)) return;
          recomputedFromRaw=true;
          const isExp=ped.tipo==='EXP';
          const b=getB(year,month);
          if (clave==='IGI'||clave==='DBA') {
            if (fp==='0') isExp?(b['IGI Export']+=importe):(b['IGI Import']+=importe);
          } else if (clave==='IVA'||clave==='PRV') {
            if (isExp) { if(fp==='0') b['IVA Export']+=importe; }
            else {
              if(fp==='0'){b['IVA Import']+=importe;b['IVA Import Efectivo']+=importe;}
              else if(fp==='22'){b['IVA Import']+=importe;b['IVA Import Fianza']+=importe;}
            }
          } else if (clave==='DTA') {
            if(fp==='0') isExp?(b['DTA Export']+=importe):(b['DTA Import']+=importe);
          }
        });
      });
      // ── RUTA 3: igiTotal/ivaPrvTotal/dtaTotal ─────────────────────────
      if (!recomputedFromRaw) {
        allRecordsHydrated.forEach(r => {
          const m=recordMonth(r),y=recordYear(r);
          if(m<0||m>11||y<2000) return;
          const isExp=isExport(r);
          const b=getB(y,m);
          if(isExp){b['IGI Export']+=r.igiTotal||0;b['IVA Export']+=r.ivaPrvTotal||0;b['DTA Export']+=r.dtaTotal||0;}
          else     {b['IGI Import']+=r.igiTotal||0;b['IVA Import']+=r.ivaPrvTotal||0;b['DTA Import']+=r.dtaTotal||0;}
        });
      }
    }
    return sortBuckets(acc).map(({year,month,...d})=>({
      name:`${MONTHS[month]} ${year}`,
      'IGI Import':parseFloat(d['IGI Import'].toFixed(1)),
      'IVA Import':parseFloat(d['IVA Import'].toFixed(1)),
      'IVA Import Efectivo':parseFloat(d['IVA Import Efectivo'].toFixed(1)),
      'IVA Import Fianza':parseFloat(d['IVA Import Fianza'].toFixed(1)),
      'DTA Import':parseFloat(d['DTA Import'].toFixed(1)),
      'IGI Export':parseFloat(d['IGI Export'].toFixed(1)),
      'IVA Export':parseFloat(d['IVA Export'].toFixed(1)),
      'DTA Export':parseFloat(d['DTA Export'].toFixed(1)),
    }));
  }, [reports, allRecordsHydrated, startDate, endDate, curYear]);


  // Helper to build container volume buckets with deduplication
  const buildContainerBuckets = (records: PedimentoRecord[], filterFn: (r: PedimentoRecord) => boolean, seriesLabels: string[]) => {
    const buckets = new Map<string, { year: number; month: number; sets: Map<string, Set<string>>; fallbacks: Map<string, number> }>();
    records.forEach(r => {
      if (!filterFn(r)) return;
      const m = recordMonth(r);
      const y = recordYear(r);
      if (m < 0 || m > 11 || y < 2000) return;
      const key = `${y}-${String(m).padStart(2, '0')}`;
      if (!buckets.has(key)) {
        const sets = new Map<string, Set<string>>();
        const fallbacks = new Map<string, number>();
        seriesLabels.forEach(l => { sets.set(l, new Set()); fallbacks.set(l, 0); });
        buckets.set(key, { year: y, month: m, sets, fallbacks });
      }
      const b = buckets.get(key)!;
      const nums = r.containerNumbers;
      const cnt = r.containerCount || 0;
      if (!cnt) return;
      const serie = isImport(r) ? 'Imp.' : isExport(r) ? 'Exp.' : null;
      if (!serie || !seriesLabels.includes(serie)) return;
      if (nums && nums.length > 0) {
        nums.forEach(n => b.sets.get(serie)!.add(n));
      } else {
        b.fallbacks.set(serie, (b.fallbacks.get(serie) || 0) + cnt);
      }
    });
    return Array.from(buckets.values())
      .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month)
      .map(({ year, month, sets, fallbacks }) => {
        const row: any = { name: `${MONTHS[month]} ${year}` };
        seriesLabels.forEach(l => { row[l] = (sets.get(l)?.size || 0) + (fallbacks.get(l) || 0); });
        return row;
      });
  };

  // 1. Importaciones — Aduana 160
  const containerVolume160 = useMemo(() =>
    buildContainerBuckets(allRecords, r => isImport(r) && String(r.seccion) === '160', ['Imp.'])
  , [allRecords]);

  // 2. Exportaciones — Aduana 240
  const containerVolume240 = useMemo(() =>
    buildContainerBuckets(allRecords, r => isExport(r) && String(r.seccion) === '240', ['Exp.'])
  , [allRecords]);

  // 3. Resto de transacciones de contenedores
  const containerVolumeOther = useMemo(() =>
    buildContainerBuckets(allRecords, r => {
      if (isImport(r) && String(r.seccion) === '160') return false;
      if (isExport(r) && String(r.seccion) === '240') return false;
      return true;
    }, ['Imp.', 'Exp.'])
  , [allRecords]);
  const gidSavingsData: any[] = [];

  // Operaciones Especiales — live desde DataStage por claves A3, A4, F4, F5, V3
  const liveSpecialOpsData = useMemo(() => {
    if (!hasLiveData) return null;
    const b = new Map<string,{year:number;month:number}&Record<string,number>>();
    allRecords
      .filter(r => SPECIAL_CLAVES.includes((r.claveDocumento||'').toUpperCase()))
      .forEach(r => {
        const m=recordMonth(r),y=recordYear(r);
        if(m<0||m>11||y<2000) return;
        const k=mkKey(y,m);
        if(!b.has(k)){const e:any={year:y,month:m,Pedimentos:0};SPECIAL_CLAVES.forEach(c=>{e[c]=0;});b.set(k,e);}
        const s=b.get(k)!;
        const c=(r.claveDocumento||'').toUpperCase();
        (s as any)[c]=((s as any)[c]||0)+1;
        s.Pedimentos=(s.Pedimentos||0)+1;
      });
    return sortBuckets(b).map(({year,month,...rest})=>({name:`${MONTHS[month]} ${year}`,...rest}));
  }, [allRecords, hasLiveData]);

  const specialOpsData = liveSpecialOpsData ?? [];
  const hasLiveSpecial = liveSpecialOpsData !== null;

  // Revisiones aduanales — prioridad: reports con reviewsByMonth
  const liveRevisionsData = useMemo(() => {
    const b = new Map<string,{year:number;month:number;Import:number;Export:number}>();
    let hasAny = false;
    const sy2=startDate?new Date(startDate+'T12:00:00').getFullYear():curYear;
    const ey2=endDate  ?new Date(endDate  +'T12:00:00').getFullYear():curYear;
    const sm2=startDate?new Date(startDate+'T12:00:00').getMonth():0;
    const em2=endDate  ?new Date(endDate  +'T12:00:00').getMonth():11;
    reports.forEach(report => {
      if (!report.reviewsByMonth) return;
      hasAny=true;
      let repYear=curYear;
      const ym=(report.name||'').match(/\b(20\d{2})\b/);
      if(ym) repYear=parseInt(ym[1],10);
      else if(report.timestamp) repYear=new Date(report.timestamp).getFullYear();
      if(repYear<sy2||repYear>ey2) return;
      report.reviewsByMonth.forEach((m:any,i:number)=>{
        if(repYear===sy2&&i<sm2) return;
        if(repYear===ey2&&i>em2) return;
        const k=mkKey(repYear,i);
        if(!b.has(k)) b.set(k,{year:repYear,month:i,Import:0,Export:0});
        const s=b.get(k)!;
        s.Import+=m.Import||0;
        s.Export+=m.Export||0;
      });
    });
    if(!hasAny) return null;
    return sortBuckets(b).map(({year,month,Import,Export})=>({name:`${MONTHS[month]} ${year}`,Import,Export}));
  }, [reports, startDate, endDate, curYear]);

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
        // Siempre leer de la subcollection 'items' para garantizar datos actualizados
        // (el campo report.records del doc principal puede estar obsoleto)
        const recs = await (storageService as any).getDataStageReportWithRecords(report.id);
        
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

  // === CONTENEDORES (504 → 501) — deduplicados por número de contenedor ===
  // containerNumbers viene del 504, tipoOperacion del 501
  const importContainersByKey = useMemo(() => {
    const mapSets = new Map<string, Set<string>>();
    const mapFallback = new Map<string, number>();
    allRecords.filter(isImport).forEach(r => {
      const cnt = r.containerCount || 0;
      if (!cnt) return;
      const k = (r.claveDocumento||'?').toUpperCase();
      if (r.containerNumbers && r.containerNumbers.length > 0) {
        if (!mapSets.has(k)) mapSets.set(k, new Set());
        r.containerNumbers.forEach(n => mapSets.get(k)!.add(n));
      } else {
        mapFallback.set(k, (mapFallback.get(k)||0) + cnt);
      }
    });
    const allKeys = new Set([...mapSets.keys(), ...mapFallback.keys()]);
    return Array.from(allKeys).map(clave => ({
      clave,
      count: (mapSets.get(clave)?.size || 0) + (mapFallback.get(clave) || 0)
    })).sort((a,b) => b.count - a.count);
  }, [allRecords]);

  const exportContainersByKey = useMemo(() => {
    const mapSets = new Map<string, Set<string>>();
    const mapFallback = new Map<string, number>();
    allRecords.filter(isExport).forEach(r => {
      const cnt = r.containerCount || 0;
      if (!cnt) return;
      const k = (r.claveDocumento||'?').toUpperCase();
      if (r.containerNumbers && r.containerNumbers.length > 0) {
        if (!mapSets.has(k)) mapSets.set(k, new Set());
        r.containerNumbers.forEach(n => mapSets.get(k)!.add(n));
      } else {
        mapFallback.set(k, (mapFallback.get(k)||0) + cnt);
      }
    });
    const allKeys = new Set([...mapSets.keys(), ...mapFallback.keys()]);
    return Array.from(allKeys).map(clave => ({
      clave,
      count: (mapSets.get(clave)?.size || 0) + (mapFallback.get(clave) || 0)
    })).sort((a,b) => b.count - a.count);
  }, [allRecords]);

  const totalImportContainers = importContainersByKey.reduce((s,b)=>s+b.count,0);
  const totalExportContainers = exportContainersByKey.reduce((s,b)=>s+b.count,0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-start gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{t('dash.title')}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {hasLiveData ? `DataStage — ${allRecords.length} ${t('dash.pedimentos_loaded')}` : t('dash.subtitle_static')}
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
              title={t('common.fecha_inicial')}
            />
            <span className="text-slate-300 font-medium">—</span>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="text-sm text-slate-700 font-medium bg-transparent border-none focus:ring-0 outline-none w-[120px]"
              title={t('common.fecha_final')}
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
              <RefreshCw size={12}/> {t('dash.live_badge')}
            </span>
          )}
          <span className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${storageService.isCloudMode()?'bg-orange-50 text-orange-700 border-orange-200':'bg-slate-100 text-slate-600 border-slate-200'}`}>
            <Database size={12}/>{storageService.isCloudMode()?t('dash.cloud_mode'):t('dash.local_mode')}
          </span>
          {/* PPT Export Button */}
          <button
            onClick={handleExportPpt}
            disabled={exportingPpt}
            title="Exportar Dashboard a PowerPoint (.pptx)"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-full text-xs font-bold transition-colors shadow-sm"
          >
            {exportingPpt
              ? <Loader2 size={13} className="animate-spin"/>
              : <Presentation size={13}/>}
            {exportingPpt ? 'Generando...' : 'Export PPT'}
          </button>
        </div>
      </div>

      {/* Empty state / Manual Sync Banner */}
      {!hasLiveData && isAdmin && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 flex items-center justify-between gap-4">
          <p className="text-blue-700 text-sm font-medium">{t('dash.sync_msg')}</p>
          <button onClick={handleHydrateAll} disabled={loadingRecords} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50">
            {loadingRecords?<Loader2 size={16} className="animate-spin"/>:<Database size={16} fill="currentColor"/>}{loadingRecords?t('dash.syncing'):t('dash.sync_btn')}
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
            sub="RT, F1, F2, H1, G1"
            breakdown={hasLiveData ? exportByKey : []}
          />
          <CountByClaveCard
            title={t('dash.cont_imp')}
            color="text-sky-600"
            total={hasLiveData ? totalImportContainers.toLocaleString() : '0'}
            sub={t('dash.cont_imp_sub')}
            unit={t('dash.unit_cont')}
            breakdown={hasLiveData ? importContainersByKey : []}
          />
          <CountByClaveCard
            title={t('dash.cont_exp')}
            color="text-teal-600"
            total={hasLiveData ? totalExportContainers.toLocaleString() : '0'}
            sub={t('dash.cont_exp_sub')}
            unit={t('dash.unit_cont')}
            breakdown={hasLiveData ? exportContainersByKey : []}
          />
        </div>

        {/* — Gráfica: Contenedores Importación — Aduana 160 — */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
          <div className="mb-3">
            <h3 className="font-semibold text-slate-800">Contenedores Importación — Aduana 160</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {hasLiveData
                ? `DataStage — 504 × 501 · ${containerVolume160.length} ${t('dash.meses')} · ${t('dash.antiguo_izq')}`
                : t('dash.chart_cont_mes_empty')}
            </p>
          </div>
          <div className="overflow-x-auto" style={{ height: 280 }}>
            <div style={{ minWidth: Math.max(640, containerVolume160.length * 58) }}>
              <BarChart
                width={Math.max(640, containerVolume160.length * 58)}
                height={256}
                data={containerVolume160}
                margin={{ top: 4, right: 16, left: 0, bottom: 48 }}
              >
                <CartesianGrid {...CS.grid}/>
                <XAxis
                  dataKey="name"
                  {...CS.axis}
                  angle={-40}
                  textAnchor="end"
                  height={60}
                  interval={0}
                  tick={{ fill: '#64748b', fontSize: 10 }}
                />
                <YAxis {...CS.axis} allowDecimals={false}/>
                <Tooltip
                  contentStyle={CS.tt.contentStyle}
                  labelFormatter={(label) => String(label)}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }}/>
                <Bar dataKey="Imp." name={t('dash.imp')} fill="#0ea5e9" radius={[4,4,0,0]} maxBarSize={28}/>
              </BarChart>
            </div>
          </div>
        </div>

        {/* — Gráfica: Contenedores Exportación — Aduana 240 — */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 mt-4">
          <div className="mb-3">
            <h3 className="font-semibold text-slate-800">Contenedores Exportación — Aduana 240</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {hasLiveData
                ? `DataStage — 504 × 501 · ${containerVolume240.length} ${t('dash.meses')} · ${t('dash.antiguo_izq')}`
                : t('dash.chart_cont_mes_empty')}
            </p>
          </div>
          <div className="overflow-x-auto" style={{ height: 280 }}>
            <div style={{ minWidth: Math.max(640, containerVolume240.length * 58) }}>
              <BarChart
                width={Math.max(640, containerVolume240.length * 58)}
                height={256}
                data={containerVolume240}
                margin={{ top: 4, right: 16, left: 0, bottom: 48 }}
              >
                <CartesianGrid {...CS.grid}/>
                <XAxis
                  dataKey="name"
                  {...CS.axis}
                  angle={-40}
                  textAnchor="end"
                  height={60}
                  interval={0}
                  tick={{ fill: '#64748b', fontSize: 10 }}
                />
                <YAxis {...CS.axis} allowDecimals={false}/>
                <Tooltip
                  contentStyle={CS.tt.contentStyle}
                  labelFormatter={(label) => String(label)}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }}/>
                <Bar dataKey="Exp." name={t('dash.exp')} fill="#14b8a6" radius={[4,4,0,0]} maxBarSize={28}/>
              </BarChart>
            </div>
          </div>
        </div>

        {/* — Gráfica: Otros Contenedores (resto de aduanas) — */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 mt-4">
          <div className="mb-3">
            <h3 className="font-semibold text-slate-800">Contenedores — Otras Aduanas</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {hasLiveData
                ? `DataStage — Excl. Imp. 160 y Exp. 240 · ${containerVolumeOther.length} ${t('dash.meses')} · ${t('dash.antiguo_izq')}`
                : t('dash.chart_cont_mes_empty')}
            </p>
          </div>
          <div className="overflow-x-auto" style={{ height: 280 }}>
            <div style={{ minWidth: Math.max(640, containerVolumeOther.length * 58) }}>
              <BarChart
                width={Math.max(640, containerVolumeOther.length * 58)}
                height={256}
                data={containerVolumeOther}
                margin={{ top: 4, right: 16, left: 0, bottom: 48 }}
              >
                <CartesianGrid {...CS.grid}/>
                <XAxis
                  dataKey="name"
                  {...CS.axis}
                  angle={-40}
                  textAnchor="end"
                  height={60}
                  interval={0}
                  tick={{ fill: '#64748b', fontSize: 10 }}
                />
                <YAxis {...CS.axis} allowDecimals={false}/>
                <Tooltip
                  contentStyle={CS.tt.contentStyle}
                  labelFormatter={(label) => String(label)}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }}/>
                <Bar dataKey="Imp." name={t('dash.imp')} fill="#6366f1" radius={[4,4,0,0]} maxBarSize={28}/>
                <Bar dataKey="Exp." name={t('dash.exp')} fill="#f59e0b" radius={[4,4,0,0]} maxBarSize={28}/>
              </BarChart>
            </div>
          </div>
        </div>

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
            title={t('dash.fact_imp')}
            color="text-cyan-600"
            total={hasLiveData ? totalImportInvoices.toLocaleString() : '0'}
            sub={t('dash.fact_imp_sub')}
            unit={t('dash.unit_fact')}
            breakdown={hasLiveData ? importInvoicesByKey : []}
          />
          <CountByClaveCard
            title={t('dash.fact_exp')}
            color="text-violet-600"
            total={hasLiveData ? totalExportInvoices.toLocaleString() : '0'}
            sub={t('dash.fact_exp_sub')}
            unit={t('dash.unit_fact')}
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
          <ScrollableChartCard title={t('dash.chart_imp_vol')} subtitle={t('dash.chart_imp_vol_sub')} n={ivData.length}>
            {w => (
              <BarChart width={w} height={256} data={ivData} margin={CM}>
                <CartesianGrid {...CS.grid}/><XAxis dataKey="name" {...XSA}/><YAxis {...CS.axis}/>
                <Tooltip {...CS.tt}/><Legend iconType="circle" wrapperStyle={{fontSize:12}}/>
                <Bar dataKey="IN" name={t('dash.bar_in')} fill="#3b82f6" stackId="a" maxBarSize={24}/>
                <Bar dataKey="A1" name={t('dash.bar_a1')} fill="#93c5fd" stackId="a" maxBarSize={24}/>
                <Bar dataKey="AF" name={t('dash.bar_af')} fill="#f59e0b" stackId="a" radius={[4,4,0,0]} maxBarSize={24}/>
              </BarChart>
            )}
          </ScrollableChartCard>
          <ScrollableChartCard title={t('dash.chart_imp_val')} subtitle={t('dash.chart_imp_val_sub')} n={ivalData.length}>
            {w => (
              <BarChart width={w} height={256} data={ivalData} margin={CM}>
                <CartesianGrid {...CS.grid}/><XAxis dataKey="name" {...XSA}/><YAxis {...CS.axis} tickFormatter={v=>`$${v}M`}/>
                <Tooltip {...CS.tt} formatter={(v:any)=>[`$${Number(v).toFixed(2)}M`]}/>
                <Legend iconType="circle" wrapperStyle={{fontSize:12}}/>
                <Bar dataKey="Mat. Prima + Indir." name={t('dash.bar_mat_prima')} fill="#1d4ed8" stackId="a" maxBarSize={24}/>
                <Bar dataKey="Activo Fijo" name={t('dash.bar_activo_fijo')} fill="#f59e0b" stackId="a" radius={[4,4,0,0]} maxBarSize={24}/>
              </BarChart>
            )}
          </ScrollableChartCard>
        </div>
      </section>

      {/* Export Section */}
      <section>
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">{t('dash.sec_export')}</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <ScrollableChartCard title={t('dash.chart_exp_vol')} subtitle={t('dash.chart_exp_vol_sub')} n={evData.length}>
            {w => (
              <BarChart width={w} height={256} data={evData} margin={CM}>
                <CartesianGrid {...CS.grid}/><XAxis dataKey="name" {...XSA}/><YAxis {...CS.axis}/>
                <Tooltip {...CS.tt}/><Bar dataKey="RT" name={t('dash.bar_rt')} fill="#10b981" radius={[4,4,0,0]} maxBarSize={24}/>
              </BarChart>
            )}
          </ScrollableChartCard>
          <ScrollableChartCard title={t('dash.chart_exp_val')} subtitle={t('dash.chart_exp_val_sub')} n={evalData.length}>
            {w => (
              <AreaChart width={w} height={256} data={evalData} margin={CM}>
                <defs><linearGradient id="eg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.15}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient></defs>
                <CartesianGrid {...CS.grid}/><XAxis dataKey="name" {...XSA}/><YAxis {...CS.axis} tickFormatter={v=>`$${v}M`}/>
                <Tooltip {...CS.tt} formatter={(v:any)=>[`$${v}M`,t('dash.valor_label')]}/>
                <Area type="monotone" dataKey="Valor (M USD)" name={t('dash.bar_valor_exp')} stroke="#10b981" strokeWidth={2} fill="url(#eg)"/>
              </AreaChart>
            )}
          </ScrollableChartCard>
        </div>
      </section>

      {/* Special Ops + Duties */}
      <section>
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">{t('dash.sec_special')}</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <ScrollableChartCard
            title={t('dash.chart_special')}
            subtitle={hasLiveSpecial ? `DataStage — claves: ${SPECIAL_CLAVES.join(', ')}` : t('dash.chart_special_sub')}
            n={specialOpsData.length}
          >
            {w => (
              <BarChart width={w} height={256} data={specialOpsData} margin={CM}>
                <CartesianGrid {...CS.grid}/><XAxis dataKey="name" {...XSA}/><YAxis {...CS.axis}/>
                <Tooltip {...CS.tt}/>
                {hasLiveSpecial ? (
                  <>
                    <Legend iconType="circle" wrapperStyle={{fontSize:11}}/>
                    {SPECIAL_CLAVES.map((k, idx) => (
                      <Bar key={k} dataKey={k} name={k} fill={VALUE_COLORS[k]} stackId="a"
                        radius={idx===SPECIAL_CLAVES.length-1?[4,4,0,0]:[0,0,0,0]} maxBarSize={24}/>
                    ))}
                  </>
                ) : (
                  <Bar dataKey="Pedimentos" fill="#8b5cf6" radius={[4,4,0,0]} maxBarSize={24}/>
                )}
              </BarChart>
            )}
          </ScrollableChartCard>
          <ScrollableChartCard
            title={t('dash.chart_contrib')}
            subtitle={hasLiveData ? t('dash.chart_contrib_sub_live') : t('dash.chart_contrib_sub_static')}
            n={dutData.length}
          >
            {w => (
              <BarChart width={w} height={256} data={dutData} margin={CM}>
                <CartesianGrid {...CS.grid}/><XAxis dataKey="name" {...XSA}/>
                <YAxis {...CS.axis} tickFormatter={(val:number)=>`${(val/1e6).toFixed(1)}M`}/>
                <Tooltip
                  {...CS.tt}
                  formatter={(val:number, name:string)=>[`${(val/1e6).toFixed(2)} ${t('dash.m_mxn')}`, name]}
                />
                <Legend iconType="circle" wrapperStyle={{fontSize:12}}/>
                <Bar dataKey="IGI Import" name={t('dash.bar_igi_imp')} fill="#ef4444" radius={[4,4,0,0]} maxBarSize={20}/>
                <Bar dataKey="IVA Import Efectivo" name={t('dash.bar_iva_imp_ef')} fill="#ea580c" radius={[4,4,0,0]} maxBarSize={20}/>
                <Bar dataKey="IVA Import Fianza" name={t('dash.bar_iva_imp_fz')} fill="#fb923c" radius={[4,4,0,0]} maxBarSize={20}/>
                <Bar dataKey="DTA Import" name={t('dash.bar_dta_imp')} fill="#f59e0b" radius={[4,4,0,0]} maxBarSize={20}/>
                <Bar dataKey="IGI Export" name={t('dash.bar_igi_exp')} fill="#3b82f6" radius={[4,4,0,0]} maxBarSize={20}/>
                <Bar dataKey="IVA Export" name={t('dash.bar_iva_exp')} fill="#06b6d4" radius={[4,4,0,0]} maxBarSize={20}/>
                <Bar dataKey="DTA Export" name={t('dash.bar_dta_exp')} fill="#0ea5e9" radius={[4,4,0,0]} maxBarSize={20}/>
              </BarChart>
            )}
          </ScrollableChartCard>
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
              <Tooltip {...CS.tt} formatter={(v:any)=>[`$${Number(v).toFixed(1)}K USD`,t('dash.ahorro_label')]}/>
              <Area type="monotone" dataKey="Ahorro Acum.(K USD)" name={t('dash.ahorro_label')} stroke="#7c3aed" strokeWidth={2.5} fill="url(#gg)" dot={{r:4,fill:'#7c3aed'}}/>
            </AreaChart>
          </ChartCard>
          <ScrollableChartCard
            title={t('dash.chart_rev')}
            subtitle={hasLiveRevisions ? 'DataStage — _Sel.asc (semáforo) + _Inci.asc (incidencias)' : t('dash.chart_rev_sub')}
            n={revisionsData.length}
          >
            {w => (
              <ComposedChart width={w} height={256} data={revisionsData} margin={CM}>
                <CartesianGrid {...CS.grid}/><XAxis dataKey="name" {...XSA}/><YAxis {...CS.axis}/>
                <Tooltip {...CS.tt}/><Legend iconType="circle" wrapperStyle={{fontSize:12}}/>
                <Bar dataKey="Import" name={t('dash.rev_import')} fill="#3b82f6" radius={[4,4,0,0]} maxBarSize={24}/>
                <Line type="monotone" dataKey="Export" name={t('dash.rev_export')} stroke="#f43f5e" strokeWidth={2} dot={{r:3}}/>
              </ComposedChart>
            )}
          </ScrollableChartCard>
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