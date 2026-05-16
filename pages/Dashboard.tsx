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

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const CS = { grid: { strokeDasharray:'3 3', vertical:false, stroke:'#f1f5f9' }, axis: { axisLine:false, tickLine:false, tick:{fill:'#64748b',fontSize:11} }, tt: { contentStyle:{borderRadius:'8px',border:'none',boxShadow:'0 4px 6px -1px rgb(0 0 0/.1)',fontSize:12} } };

// Helpers — tipoOperacion is now normalized to 'IMP' | 'EXP' by the parser
const isImport = (r: PedimentoRecord) => (r.tipoOperacion || '').toUpperCase() === 'IMP';
const isExport = (r: PedimentoRecord) => (r.tipoOperacion || '').toUpperCase() === 'EXP';

// Robust SAT date parser — maneja ISO (YYYY-MM-DD), DD/MM/YYYY y YYYYMMDD sin separadores
const parseSATMonth = (s: string): number => {
  if (!s || !s.trim()) return -1;
  const raw = s.trim();
  // ISO: YYYY-MM-DD o YYYY-MM-DDTHH:mm:ss
  let d = new Date(raw.length > 10 ? raw : raw + 'T12:00:00');
  if (!isNaN(d.getTime())) return d.getMonth();
  // DD/MM/YYYY
  const sl = raw.split('/');
  if (sl.length === 3) {
    d = new Date(`${sl[2]}-${sl[1].padStart(2,'0')}-${sl[0].padStart(2,'0')}T12:00:00`);
    if (!isNaN(d.getTime())) return d.getMonth();
  }
  // YYYYMMDD (8 dígitos)
  if (/^\d{8}$/.test(raw)) {
    d = new Date(`${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}T12:00:00`);
    if (!isNaN(d.getTime())) return d.getMonth();
  }
  return -1;
};
const parseSATYear = (s: string): number => {
  if (!s || !s.trim()) return -1;
  const raw = s.trim();
  let d = new Date(raw.length > 10 ? raw : raw + 'T12:00:00');
  if (!isNaN(d.getTime())) return d.getFullYear();
  const sl = raw.split('/');
  if (sl.length === 3) { d = new Date(`${sl[2]}-${sl[1].padStart(2,'0')}-${sl[0].padStart(2,'0')}T12:00:00`); if (!isNaN(d.getTime())) return d.getFullYear(); }
  if (/^\d{8}$/.test(raw)) { d = new Date(`${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}T12:00:00`); if (!isNaN(d.getTime())) return d.getFullYear(); }
  return -1;
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
  const [reports, setReports] = useState(storageService.getDataStageReports());
  const [allRecordsHydrated, setAllRecordsHydrated] = useState<PedimentoRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const curYear = new Date().getFullYear();
  const [startDate, setStartDate] = useState(`${curYear}-01-01`);
  const [endDate,   setEndDate]   = useState(`${curYear}-12-31`);

  // Revisiones locales (de _Sel.asc + _Inci.asc subidos directamente en Dashboard)
  const revInputRef = useRef<HTMLInputElement>(null);
  const [loadingRevisions, setLoadingRevisions] = useState(false);
  const LS_KEY = 'lm_revisions_by_month';
  const [localReviewsByMonth, setLocalReviewsByMonth] = useState<{name:string;Import:number;Export:number}[]>(() => {
    try { const s = localStorage.getItem(LS_KEY); return s ? JSON.parse(s) : []; } catch { return []; }
  });

  const normTipo = (raw: string) => {
    const v = (raw||'').trim().toUpperCase();
    if (v==='1'||v==='IMP'||v.startsWith('I')) return 'IMP';
    if (v==='2'||v==='EXP'||v.startsWith('E')) return 'EXP';
    return v;
  };

  const parseRevisionASC = useCallback((content: string, monthCounts: {imp:number;exp:number}[], isSel: boolean) => {
    const lines = content.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('Patente|'));
    lines.forEach(line => {
      const cols = line.split('|');
      if (isSel) {
        // _Sel: cols[7]=semaforo, cols[5]=fecha, cols[9]=tipoOper
        if (cols.length < 10) return;
        const sem = (cols[7]||'').trim();
        if (sem !== '2' && sem !== '3') return; // solo rojo/naranja
        const d = new Date((cols[5]||'').trim() + 'T12:00:00');
        const m = isNaN(d.getTime()) ? -1 : d.getMonth();
        if (m < 0) return;
        const tipo = normTipo(cols[9]||'');
        if (tipo==='IMP') monthCounts[m].imp++;
        else if (tipo==='EXP') monthCounts[m].exp++;
      } else {
        // _Inci: cols[13]=grado, cols[14]=fechaSel, cols[12]=tipoOper
        if (cols.length < 14) return;
        const g = (cols[13]||'').trim().toUpperCase();
        if (g!=='C' && g!=='A') return; // solo con incidencia
        const dateStr = (cols[14]||cols[5]||'').trim();
        const d = new Date(dateStr + 'T12:00:00');
        const m = isNaN(d.getTime()) ? -1 : d.getMonth();
        if (m < 0) return;
        const tipo = normTipo(cols[12]||'');
        if (tipo==='IMP') monthCounts[m].imp++;
        else if (tipo==='EXP') monthCounts[m].exp++;
      }
    });
  }, []);

  const handleRevisionFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setLoadingRevisions(true);
    try {
      const monthCounts: {imp:number;exp:number}[] = Array.from({length:12}, () => ({imp:0,exp:0}));
      const decoder = new TextDecoder('iso-8859-1');

      for (const file of Array.from(files)) {
        const name = file.name.toLowerCase();
        if (name.endsWith('.zip')) {
          // ZIP: buscar _Sel.asc y _Inci.asc dentro
          const zip = new JSZip();
          const loaded = await zip.loadAsync(file);
          for (const [fname, entry] of Object.entries(loaded.files)) {
            if (entry.dir) continue;
            const fn = fname.toLowerCase();
            if (fn.endsWith('_sel.asc') || fn.endsWith('_inci.asc')) {
              const buf = await entry.async('uint8array');
              const text = decoder.decode(buf);
              parseRevisionASC(text, monthCounts, fn.endsWith('_sel.asc'));
            }
          }
        } else if (name.endsWith('_sel.asc')) {
          const text = decoder.decode(await file.arrayBuffer());
          parseRevisionASC(text, monthCounts, true);
        } else if (name.endsWith('_inci.asc')) {
          const text = decoder.decode(await file.arrayBuffer());
          parseRevisionASC(text, monthCounts, false);
        }
      }

      const result = MONTHS.map((name, i) => ({ name, Import: monthCounts[i].imp, Export: monthCounts[i].exp }));
      setLocalReviewsByMonth(result);
      localStorage.setItem(LS_KEY, JSON.stringify(result));
    } catch (err: any) {
      alert('Error procesando archivos de revisiones: ' + err.message);
    } finally {
      setLoadingRevisions(false);
    }
  }, [parseRevisionASC]);

  useEffect(() => {
    if (user?.role === UserRole.AGENT) { navigate('/database'); return; }
    const refresh = () => {
      setVessels([...storageService.getVesselTracking()]);
      setEquipment([...storageService.getEquipmentTracking()]);
      setCustoms([...storageService.getCustomsClearance()]);
      setCosts([...storageService.getCosts()]);
      setReports([...storageService.getDataStageReports()]);
    };
    refresh();
    return storageService.subscribe(refresh);
  }, [user, navigate]);

  // Hydrate records from Firestore subcollections (Gap 3 fix)
  useEffect(() => {
    if (!reports.length) { setAllRecordsHydrated([]); return; }
    let cancelled = false;
    const hydrate = async () => {
      setLoadingRecords(true);
      const allRecords: PedimentoRecord[] = [];

      // Track records per report for monthlyDuties patch
      const recordsByReport = new Map<string, PedimentoRecord[]>();

      for (const report of reports) {
        if (cancelled) break;
        const recs = report.records && report.records.length > 0
          ? report.records
          : await (storageService as any).getDataStageReportWithRecords(report.id);
        allRecords.push(...recs);
        recordsByReport.set(report.id, recs);
      }
      if (!cancelled) {
        // === CRUCE 507→501 EN VIVO ===
        const recordMap = new Map<string, PedimentoRecord>();
        allRecords.forEach(r => recordMap.set(r.id, r));

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

        setAllRecordsHydrated([...allRecords]);
        setLoadingRecords(false);

        // === PATCH SILENCIOSO: calcular monthlyDuties para reportes que no lo tienen ===
        // Recorre los reportes sin monthlyDuties y los actualiza en Firestore con los datos
        // calculados desde los records ya hidratados — no requiere re-subir ZIPs.
        const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const parseDateMonth = (s: string): number => {
          if (!s) return -1;
          const raw = s.trim();
          let d = new Date(raw.length > 10 ? raw : raw + 'T12:00:00');
          if (!isNaN(d.getTime())) return d.getMonth();
          const sl = raw.split('/');
          if (sl.length === 3) { d = new Date(`${sl[2]}-${sl[1].padStart(2,'0')}-${sl[0].padStart(2,'0')}T12:00:00`); if (!isNaN(d.getTime())) return d.getMonth(); }
          if (/^\d{8}$/.test(raw)) { d = new Date(`${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}T12:00:00`); if (!isNaN(d.getTime())) return d.getMonth(); }
          return -1;
        };

        for (const report of reports) {
          if (cancelled) break;
          if (report.monthlyDuties && report.monthlyDuties.length > 0) continue; // ya tiene datos

          const recs = recordsByReport.get(report.id) || [];
          if (recs.length === 0) continue;

          const acc = Array.from({length: 12}, () => ({
            igi_imp: 0, iva_imp: 0, dta_imp: 0,
            igi_exp: 0, iva_exp: 0, dta_exp: 0,
          }));

          recs.forEach(r => {
            const m = parseDateMonth(r.fechaPago || r.fechaEntrada || '');
            if (m < 0 || m > 11) return;
            const isExp = r.tipoOperacion === 'EXP';
            if (isExp) {
              acc[m].igi_exp += r.igiTotal   || 0;
              acc[m].iva_exp += r.ivaPrvTotal || 0;
              acc[m].dta_exp += r.dtaTotal    || 0;
            } else {
              acc[m].igi_imp += r.igiTotal   || 0;
              acc[m].iva_imp += r.ivaPrvTotal || 0;
              acc[m].dta_imp += r.dtaTotal    || 0;
            }
          });

          const monthlyDuties = MONTHS_SHORT.map((name, i) => ({
            name,
            'IGI Import': parseFloat(acc[i].igi_imp.toFixed(1)),
            'IVA Import': parseFloat(acc[i].iva_imp.toFixed(1)),
            'DTA Import': parseFloat(acc[i].dta_imp.toFixed(1)),
            'IGI Export': parseFloat(acc[i].igi_exp.toFixed(1)),
            'IVA Export': parseFloat(acc[i].iva_exp.toFixed(1)),
            'DTA Export': parseFloat(acc[i].dta_exp.toFixed(1)),
          }));

          // Patch en Firestore silenciosamente (best-effort)
          try {
            const { doc: fsDoc, updateDoc } = await import('firebase/firestore');
            const { db: fsDb } = await import('../services/firebaseConfig');
            if (fsDb) {
              await updateDoc(fsDoc(fsDb, 'dataStageReports', report.id), { monthlyDuties });
              // Actualizar en memoria también
              (report as any).monthlyDuties = monthlyDuties;
              console.log(`[Dashboard] Patched monthlyDuties for report ${report.id}`);
            }
          } catch (patchErr) {
            console.warn('[Dashboard] Could not patch monthlyDuties (non-critical):', patchErr);
          }
        }
      }
    };
    hydrate();
    return () => { cancelled = true; };
  }, [reports]);


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

  // Duties — usa monthlyDuties precomputado si existe (reportes nuevos),
  // si no, reconstruye desde allRecords ya cargados de Firestore (backward-compatible)
  const dutiesData = useMemo(() => {
    const ZERO = { 'IGI Import':0,'IVA Import':0,'DTA Import':0,'IGI Export':0,'IVA Export':0,'DTA Export':0 };
    const acc = MONTHS.map((name) => ({ name, ...ZERO }));

    // Intentar usar monthlyDuties precomputado (reportes subidos después del fix)
    const hasPrecomputed = reports.some(rep => rep.monthlyDuties && rep.monthlyDuties.length > 0);
    if (hasPrecomputed) {
      reports.forEach(rep => {
        if (!rep.monthlyDuties) return;
        rep.monthlyDuties.forEach((row, i) => {
          if (!acc[i]) return;
          acc[i]['IGI Import'] += row['IGI Import'] || 0;
          acc[i]['IVA Import'] += row['IVA Import'] || 0;
          acc[i]['DTA Import'] += row['DTA Import'] || 0;
          acc[i]['IGI Export'] += row['IGI Export'] || 0;
          acc[i]['IVA Export'] += row['IVA Export'] || 0;
          acc[i]['DTA Export'] += row['DTA Export'] || 0;
        });
      });
    } else {
      // Fallback: reconstruir desde allRecordsHydrated (datos ya en Firestore)
      allRecords.forEach(r => {
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

    return acc.map(row => ({
      ...row,
      'IGI Import': parseFloat(row['IGI Import'].toFixed(1)),
      'IVA Import': parseFloat(row['IVA Import'].toFixed(1)),
      'DTA Import': parseFloat(row['DTA Import'].toFixed(1)),
      'IGI Export': parseFloat(row['IGI Export'].toFixed(1)),
      'IVA Export': parseFloat(row['IVA Export'].toFixed(1)),
      'DTA Export': parseFloat(row['DTA Export'].toFixed(1)),
    }));
  }, [reports, allRecords]);

  // Contenedores por mes (504 → 501)
  const containerVolumeData = useMemo(() => MONTHS.map((name, i) => ({
    name,
    'Imp.': allRecords.filter(r => recordMonth(r)===i && isImport(r)).reduce((s,r) => s+(r.containerCount||0), 0),
    'Exp.': allRecords.filter(r => recordMonth(r)===i && isExport(r)).reduce((s,r) => s+(r.containerCount||0), 0),
  })), [allRecords]);

  // Static fallback data from PPT (shown when no DataStage records for selected year)
  const staticImportVol = [
    {name:'Jan',IN:67,AF:0,A1:57},{name:'Feb',IN:74,AF:0,A1:60},{name:'Mar',IN:106,AF:1,A1:102},
    {name:'Apr',IN:119,AF:0,A1:109},{name:'May',IN:67,AF:0,A1:61},{name:'Jun',IN:52,AF:0,A1:58},
    {name:'Jul',IN:107,AF:3,A1:74},{name:'Aug',IN:104,AF:5,A1:85},{name:'Sep',IN:92,AF:8,A1:92},
  ];
  const staticExportVol = [{name:'Jan',RT:58},{name:'Feb',RT:144},{name:'Mar',RT:163},{name:'Apr',RT:119},{name:'May',RT:153},{name:'Jun',RT:154},{name:'Jul',RT:31},{name:'Aug',RT:114},{name:'Sep',RT:100}];
  const staticImportVal = [
    {name:'Jan','Mat. Prima + Indir.':4.13,'Activo Fijo':0},{name:'Feb','Mat. Prima + Indir.':7.37,'Activo Fijo':0.55},
    {name:'Mar','Mat. Prima + Indir.':11.20,'Activo Fijo':0},{name:'Apr','Mat. Prima + Indir.':9.38,'Activo Fijo':0.47},
    {name:'May','Mat. Prima + Indir.':5.83,'Activo Fijo':1.28},{name:'Jun','Mat. Prima + Indir.':8.90,'Activo Fijo':0.94},
    {name:'Jul','Mat. Prima + Indir.':7.50,'Activo Fijo':0},{name:'Aug','Mat. Prima + Indir.':8.51,'Activo Fijo':0},
    {name:'Sep','Mat. Prima + Indir.':6.95,'Activo Fijo':0},
  ];
  const staticExportVal = [{name:'Jan','Valor (M USD)':3},{name:'Feb','Valor (M USD)':7.45},{name:'Mar','Valor (M USD)':11.71},{name:'Apr','Valor (M USD)':7},{name:'May','Valor (M USD)':11},{name:'Jun','Valor (M USD)':16},{name:'Jul','Valor (M USD)':5},{name:'Aug','Valor (M USD)':4},{name:'Sep','Valor (M USD)':12}];
  const staticDuties = [
    {name:'Jan','IGI Import':40,'IVA Import':670,'IGI Export':0,'IVA Export':0},
    {name:'Feb','IGI Import':156,'IVA Import':2470,'IGI Export':0,'IVA Export':0},
    {name:'Mar','IGI Import':108,'IVA Import':1840,'IGI Export':0,'IVA Export':0},
    {name:'Apr','IGI Import':78,'IVA Import':1490,'IGI Export':0,'IVA Export':0},
    {name:'May','IGI Import':84,'IVA Import':953,'IGI Export':0,'IVA Export':0},
    {name:'Jun','IGI Import':109,'IVA Import':1500,'IGI Export':0,'IVA Export':0},
    {name:'Jul','IGI Import':245,'IVA Import':1300,'IGI Export':0,'IVA Export':0},
    {name:'Aug','IGI Import':170,'IVA Import':1800,'IGI Export':0,'IVA Export':0},
    {name:'Sep','IGI Import':119,'IVA Import':1660,'IGI Export':0,'IVA Export':0},
  ];

  // Always-static charts (no field in DataStage for these)
  const gidSavingsData = [{name:'Jan','Ahorro Acum.(K USD)':105.8},{name:'Feb','Ahorro Acum.(K USD)':152.6},{name:'Mar','Ahorro Acum.(K USD)':170.1},{name:'Apr','Ahorro Acum.(K USD)':241.7},{name:'May','Ahorro Acum.(K USD)':245},{name:'Jun','Ahorro Acum.(K USD)':247.7},{name:'Jul','Ahorro Acum.(K USD)':258.1},{name:'Aug','Ahorro Acum.(K USD)':291.6}];

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

  const staticSpecialOpsData = [{name:'Jan',Pedimentos:24},{name:'Feb',Pedimentos:26},{name:'Mar',Pedimentos:28},{name:'Apr',Pedimentos:2},{name:'May',Pedimentos:0},{name:'Jun',Pedimentos:0},{name:'Jul',Pedimentos:20},{name:'Aug',Pedimentos:0},{name:'Sep',Pedimentos:0}];
  const specialOpsData = liveSpecialOpsData ?? staticSpecialOpsData;
  const hasLiveSpecial = liveSpecialOpsData !== null;

  // Revisiones aduanales — prioridad: 1) localReviewsByMonth (cargado en Dashboard)
  // 2) reports con reviewsByMonth (guardados en DataStage), 3) static PPT
  const liveRevisionsData = useMemo(() => {
    // Prioridad 1: cargado localmente en Dashboard
    if (localReviewsByMonth.length === 12 && localReviewsByMonth.some(m => m.Import > 0 || m.Export > 0))
      return localReviewsByMonth;
    // Prioridad 2: guardado en algún reporte de DataStage
    const combined: { imp: number; exp: number }[] = Array.from({ length: 12 }, () => ({ imp: 0, exp: 0 }));
    let hasAnyRevisionData = false;
    reports.forEach(report => {
      if (!report.reviewsByMonth) return;
      hasAnyRevisionData = true;
      report.reviewsByMonth.forEach((m, i) => {
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
  }, [reports, localReviewsByMonth]);

  const staticRevisionsData = [{name:'Jan',Import:8,Export:2},{name:'Feb',Import:17,Export:1},{name:'Mar',Import:29,Export:0},{name:'Apr',Import:25,Export:1},{name:'May',Import:9,Export:1},{name:'Jun',Import:8,Export:3},{name:'Jul',Import:8,Export:1},{name:'Aug',Import:11,Export:2},{name:'Sep',Import:15,Export:2}];
  const revisionsData = liveRevisionsData ?? staticRevisionsData;
  const hasLiveRevisions = liveRevisionsData !== null;

  const ivData     = hasLiveData ? importVolumeData : staticImportVol;
  const evData     = hasLiveData ? exportVolumeData : staticExportVol;
  const ivalData   = hasLiveData ? importValueData  : staticImportVal;
  const evalData   = hasLiveData ? exportValueData  : staticExportVal;
  const dutData    = hasLiveData ? dutiesData        : staticDuties;

  const handleSeed = async () => {
    if(!window.confirm('¿Inicializar base de datos con datos de prueba?')) return;
    setSeeding(true);
    try { await (storageService as any).seedDatabase(); alert('✅ Datos inicializados.'); window.location.reload(); }
    catch(e:any){ alert('Error: '+e.message); } finally { setSeeding(false); }
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
            {hasLiveData ? `DataStage — ${allRecords.length} pedimentos cargados` : 'Customs Report PPT — YTD Ene–Sep 2024 (referencia)'}
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

      {/* Empty state */}
      {vessels.length===0 && equipment.length===0 && isAdmin && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 flex items-center justify-between gap-4">
          <p className="text-blue-700 text-sm font-medium">Base de datos vacía. Inicializa con datos de prueba.</p>
          <button onClick={handleSeed} disabled={seeding} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50">
            {seeding?<Loader2 size={16} className="animate-spin"/>:<Play size={16} fill="currentColor"/>}{seeding?'Creando...':'Inicializar'}
          </button>
        </div>
      )}



      {/* Customs YTD Summary */}
      <section>
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          {t('dash.sec_ytd')} {hasLiveData ? rangeLabel : 'YTD 2024 (PPT)'}
          {isHydrating && <span className="flex items-center gap-1 text-blue-500 normal-case font-normal"><Loader2 size={12} className="animate-spin"/> {t('dash.loading')}</span>}
        </h2>
        {/* — Pedimentos & Contenedores — */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <CountByClaveCard
            title={t('dash.imp_ped')}
            color="text-blue-600"
            total={hasLiveData ? totalImport.toLocaleString() : '1,503'}
            sub={t('dash.ytd_sub')}
            breakdown={hasLiveData ? importByKey : [
              {clave:'IN', count:1050},{clave:'A1', count:380},{clave:'AF', count:73}
            ]}
          />
          <CountByClaveCard
            title={t('dash.exp_ped')}
            color="text-indigo-600"
            total={hasLiveData ? totalExport.toLocaleString() : '1,036'}
            sub="RT, F1, F2, H1, G1 y más"
            breakdown={hasLiveData ? exportByKey : [
              {clave:'RT', count:1036}
            ]}
          />
          <CountByClaveCard
            title="CONTENEDORES IMPORTACIÓN"
            color="text-sky-600"
            total={hasLiveData ? totalImportContainers.toLocaleString() : '—'}
            sub="504 — contenedores IMP"
            unit="cont."
            breakdown={hasLiveData ? importContainersByKey : []}
          />
          <CountByClaveCard
            title="CONTENEDORES EXPORTACIÓN"
            color="text-teal-600"
            total={hasLiveData ? totalExportContainers.toLocaleString() : '—'}
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
            total={hasLiveData ? totalImportUSD : '72'}
            breakdown={hasLiveData ? importValueByKey : [
              {clave:'IN', usd:52e6, count:0},
              {clave:'A1', usd:14e6, count:0},
              {clave:'AF', usd:6e6,  count:0},
            ]}
          />
          <ValueByClaveCard
            title={t('dash.exp_val')}
            color="text-purple-600"
            total={hasLiveData ? totalExportUSD : '77'}
            breakdown={hasLiveData ? exportValueByKey : [
              {clave:'RT', usd:77e6, count:0},
            ]}
          />
          <CountByClaveCard
            title="FACTURAS IMPORTACIÓN"
            color="text-cyan-600"
            total={hasLiveData ? totalImportInvoices.toLocaleString() : '2,840'}
            sub="505 — facturas comerciales"
            unit="fact."
            breakdown={hasLiveData ? importInvoicesByKey : [
              {clave:'IN', count:2100},{clave:'A1', count:620},{clave:'AF', count:120}
            ]}
          />
          <CountByClaveCard
            title="FACTURAS EXPORTACIÓN"
            color="text-violet-600"
            total={hasLiveData ? totalExportInvoices.toLocaleString() : '1,036'}
            sub="505 (comerciales) + 507-ED (CFDIs)"
            unit="fact."
            breakdown={hasLiveData ? exportInvoicesByKey : [
              {clave:'RT', count:1036}
            ]}
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
              <CartesianGrid {...CS.grid}/><XAxis dataKey="name" {...CS.axis}/><YAxis {...CS.axis}/>
              <Tooltip {...CS.tt}/><Legend iconType="circle" wrapperStyle={{fontSize:12}}/>
              <Bar dataKey="IGI Import"  fill="#ef4444" radius={[4,4,0,0]}/>
              <Bar dataKey="IVA Import"  fill="#f97316" radius={[4,4,0,0]}/>
              <Bar dataKey="DTA Import"  fill="#f59e0b" radius={[4,4,0,0]}/>
              <Bar dataKey="IGI Export"  fill="#3b82f6" radius={[4,4,0,0]}/>
              <Bar dataKey="IVA Export"  fill="#06b6d4" radius={[4,4,0,0]}/>
              <Bar dataKey="DTA Export"  fill="#0ea5e9" radius={[4,4,0,0]}/>
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
            {/* Uploader de archivos _Sel.asc / _Inci.asc */}
            <input
              ref={revInputRef}
              type="file"
              className="hidden"
              multiple
              accept=".asc,.zip"
              onChange={e => handleRevisionFiles(e.target.files)}
            />
            <div className="flex items-center justify-between mb-3 -mt-2">
              <div className="flex items-center gap-2">
                {hasLiveRevisions ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium bg-emerald-50 px-2 py-0.5 rounded-full">
                    <CheckCircle2 size={11}/> Datos cargados
                  </span>
                ) : (
                  <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">PPT estático</span>
                )}
              </div>
              <button
                onClick={() => revInputRef.current?.click()}
                disabled={loadingRevisions}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1 bg-slate-100 hover:bg-indigo-100 hover:text-indigo-700 text-slate-600 rounded-lg transition-colors font-medium"
                title="Cargar _Sel.asc, _Inci.asc o ZIP de solicitudes"
              >
                {loadingRevisions ? <Loader2 size={12} className="animate-spin"/> : <Upload size={12}/>}
                {loadingRevisions ? 'Procesando...' : 'Cargar revisiones'}
              </button>
            </div>
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
    </div>
  );
};