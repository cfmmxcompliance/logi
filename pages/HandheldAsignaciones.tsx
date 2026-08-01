import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { useNavigate } from 'react-router-dom';
import { asignacionCajaService } from '../services/asignacionCajaService.ts';
import { liberacionService } from '../services/liberacionService.ts';
import { liberacionDockService } from '../services/liberacionDockService.ts';
import { AsignacionCajaModel } from '../types/asignacionCaja.ts';
import { HandheldToolbar } from '../components/HandheldToolbar.tsx';
import {
  ArrowLeft, Truck, Loader2, Box, Clock, CheckCircle2,
  AlertTriangle, XCircle, Timer, Anchor, FileText, FileCheck,
  RefreshCcw
} from 'lucide-react';
import { todayMX } from '../utils/mexTime';

type StatusFilter = 'TODOS' | 'PENDIENTES' | 'LLEGADOS' | 'CERRADO' | 'CANCELADO';

  // getLocalToday removed, using todayMX() instead

const parseHHmm = (fecha: string, hora: string): Date | null => {
  if (!fecha || !hora) return null;
  const clean = hora.replace(/[a-zA-Z\s]/g, '');
  const [h, m] = clean.split(':');
  if (!h || !m) return null;
  return new Date(`${fecha}T${h.padStart(2, '0')}:${m.padStart(2, '0')}:00`);
};

const formatMins = (mins: number): string => {
  const h = Math.floor(Math.abs(mins) / 60);
  const m = Math.abs(mins) % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export const HandheldAsignaciones = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [dateStart, setDateStart] = useState<string>(todayMX());
  const [dateEnd, setDateEnd] = useState<string>(todayMX());
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('TODOS');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [asignaciones, setAsignaciones] = useState<AsignacionCajaModel[]>([]);
  const [liberacionIds, setLiberacionIds] = useState<Set<string>>(new Set());
  const [liberacionDockIds, setLiberacionDockIds] = useState<Set<string>>(new Set());

  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [asigs, libs, libsDock] = await Promise.all([
        dateStart === dateEnd
          ? asignacionCajaService.getAsignacionesByDate(dateStart)
          : asignacionCajaService.getAsignacionesByDateRange(dateStart, dateEnd),
        dateStart === dateEnd
          ? liberacionService.getLiberacionesByDate(dateStart)
          : liberacionService.getLiberacionesByDateRange(dateStart, dateEnd),
        dateStart === dateEnd
          ? liberacionDockService.getLiberacionesDockByDate(dateStart)
          : liberacionDockService.getLiberacionesDockByDateRange(dateStart, dateEnd),
      ]);
      asigs.sort((a, b) => {
        if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
        return (a.horaAsignacion || '') < (b.horaAsignacion || '') ? -1 : 1;
      });
      setAsignaciones(asigs);
      setLiberacionIds(new Set(libs.map(l => l.asignacionCajaId)));
      setLiberacionDockIds(new Set(libsDock.map(l => l.asignacionCajaId)));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, [dateStart, dateEnd]);

  // ── Classify each record ───────────────────────────────────────────────────
  const classify = (a: AsignacionCajaModel) => {
    const dock = (a.dockArribo || '').trim().toUpperCase();
    if (['RECHAZADO', 'DROP', 'NO SHOW', 'CANCELED'].includes(dock)) return 'CANCELADO';
    if (liberacionIds.has(a.id!)) return 'CERRADO';
    if (a.arribo) return 'LLEGADOS';
    return 'PENDIENTES';
  };

  // ── Counts for filter tabs ─────────────────────────────────────────────────
  const counts: Record<StatusFilter, number> = {
    TODOS: 0,
    PENDIENTES: 0, LLEGADOS: 0, CERRADO: 0, CANCELADO: 0,
  };
  asignaciones.forEach(a => { counts[classify(a)]++; });
  counts.TODOS = asignaciones.length - counts.CANCELADO;

  // ── Filter + search ────────────────────────────────────────────────────────
  const filtered = asignaciones.filter(a => {
    if (statusFilter === 'TODOS' && classify(a) === 'CANCELADO') return false;
    if (statusFilter !== 'TODOS' && classify(a) !== statusFilter) return false;
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      (a.numeroCaja || '').toLowerCase().includes(q) ||
      (a.numeroOperacion || '').toLowerCase().includes(q) ||
      (a.nombreDriver || '').toLowerCase().includes(q) ||
      (a.placasTracto || '').toLowerCase().includes(q) ||
      (a.subLinea || '').toLowerCase().includes(q)
    );
  });

  // ── Tab config ─────────────────────────────────────────────────────────────
  const tabs: { key: StatusFilter; label: string; color: string }[] = [
    { key: 'TODOS',      label: 'Todos',      color: 'bg-slate-600' },
    { key: 'PENDIENTES', label: 'Pendientes', color: 'bg-blue-600' },
    { key: 'LLEGADOS',   label: 'En Proceso', color: 'bg-amber-500' },
    { key: 'CERRADO',    label: 'Cerrado',    color: 'bg-emerald-600' },
    { key: 'CANCELADO',  label: 'Cancelado',  color: 'bg-red-600' },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col font-sans">

      {/* ── Header ── */}
      <div className="bg-slate-900 border-b border-slate-800 p-4 sticky top-0 z-20 flex items-center gap-3 shadow-md">
        <button
          onClick={() => navigate('/m/home')}
          className="p-2 -ml-1 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={22} />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-white flex items-center gap-2 leading-tight">
            <Truck size={18} className="text-emerald-400 shrink-0" />
            Asignación 53' Cajas Secas
          </h1>
          <p className="text-[11px] text-slate-400 font-mono mt-0.5">Vista operativa móvil</p>
        </div>
        <button
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="p-2 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
        >
          <RefreshCcw size={18} className={refreshing ? 'animate-spin text-emerald-400' : ''} />
        </button>
      </div>

      {/* ── Date range + search toolbar ── */}
      <HandheldToolbar
        dateStart={dateStart} setDateStart={setDateStart}
        dateEnd={dateEnd}     setDateEnd={setDateEnd}
        searchTerm={searchTerm} setSearchTerm={setSearchTerm}
      />

      {/* ── Dock Status ── */}
      {!loading && (() => {
        const DOCK_FROM = 5;
        const DOCK_TO   = 10;
        const dockStatus: Record<string, AsignacionCajaModel | null> = {};
        for (let i = DOCK_FROM; i <= DOCK_TO; i++) dockStatus[`DOCK ${i}`] = null;

        asignaciones.forEach(a => {
          if (!a.dockArribo) return;
          const key = a.dockArribo.trim().toUpperCase();
          if (!(key in dockStatus)) return;
          if (!liberacionDockIds.has(a.id!)) dockStatus[key] = a;
        });

        const ocupados = Object.values(dockStatus).filter(Boolean).length;
        const libres   = (DOCK_TO - DOCK_FROM + 1) - ocupados;

        return (
          <div className="mx-4 mt-4 mb-1 bg-slate-900/60 border border-slate-700/50 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Estado de Docks</span>
              <div className="flex gap-3 text-[10px]">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                  <span className="text-emerald-400 font-semibold">{libres} libres</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                  <span className="text-red-400 font-semibold">{ocupados} ocup.</span>
                </span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {Array.from({length: DOCK_TO - DOCK_FROM + 1}, (_, i) => DOCK_FROM + i).map(n => {
                const key = `DOCK ${n}`;
                const asig = dockStatus[key];
                return asig ? (
                  <div key={key} className="bg-red-500/10 border border-red-500/30 rounded-lg p-1.5 flex flex-col items-center justify-center text-center">
                    <span className="text-[9px] font-bold text-red-400 uppercase leading-tight">{key}</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1 mb-1 animate-pulse" />
                    <span className="text-[9px] text-red-300 font-mono font-bold w-full truncate leading-tight">{asig.numeroCaja}</span>
                    <span className="text-[8px] text-slate-500 w-full truncate leading-tight mt-0.5">{asig.numeroOperacion || '—'}</span>
                  </div>
                ) : (
                  <div key={key} className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-1.5 flex flex-col items-center justify-center text-center">
                    <span className="text-[9px] font-bold text-emerald-500/80 uppercase leading-tight mb-1">{key}</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/50 mb-1" />
                    <span className="text-[8px] text-emerald-600/70 font-semibold leading-tight">Libre</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ── KPI strip ── */}
      {!loading && (
        <div className="px-4 pt-3 pb-1 grid grid-cols-4 gap-2">
          {[
            { label: 'Pendientes', val: counts.PENDIENTES, color: 'text-blue-400',    bg: 'bg-blue-500/10 border-blue-500/20' },
            { label: 'En Proceso', val: counts.LLEGADOS,   color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/20' },
            { label: 'Cerrado',    val: counts.CERRADO,    color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
            { label: 'Cancelado',  val: counts.CANCELADO,  color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/20' },
          ].map(k => (
            <div key={k.label} className={`rounded-xl border p-2 flex flex-col items-center ${k.bg}`}>
              <span className={`text-xl font-black ${k.color}`}>{k.val}</span>
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">{k.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Status filter tabs ── */}
      {!loading && asignaciones.length > 0 && (
        <div className="px-4 pt-2 pb-1">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setStatusFilter(t.key)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                  statusFilter === t.key
                    ? `${t.color} text-white shadow`
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {t.label} ({counts[t.key]})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto px-4 pb-10 pt-2 space-y-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-500">
            <Loader2 className="animate-spin mb-3" size={32} />
            <p className="text-sm">Cargando asignaciones...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-600 text-center border border-dashed border-slate-800 rounded-2xl mt-4">
            <Box size={44} className="mb-3 opacity-40" />
            <p className="font-semibold text-slate-400">Sin resultados</p>
            <p className="text-sm mt-1">No hay asignaciones para este filtro.</p>
          </div>
        ) : (
          filtered.map(a => {
            const status = classify(a);
            const hasLib = liberacionIds.has(a.id!);
            const dock = (a.dockArribo || '').trim().toUpperCase();

            // Times
            const apptDate = parseHHmm(a.fecha, a.horaAsignacion || '');
            const arrDate  = parseHHmm(a.fecha, a.arribo || '');
            const now = new Date();

            const retrasoMins = (apptDate && arrDate)
              ? Math.round((arrDate.getTime() - apptDate.getTime()) / 60000)
              : (apptDate && !arrDate)
                ? Math.round((now.getTime() - apptDate.getTime()) / 60000)
                : null;

            const enPlantaMins = arrDate
              ? Math.round((now.getTime() - arrDate.getTime()) / 60000)
              : null;

            // Layout / CCP
            const hasLayout = !!(a as any).layoutUploadedAt;
            const hasCCP    = !!(a as any).ccpUploadedAt;

            // Card border / bg by status
            const cardStyle =
              status === 'CANCELADO'  ? 'bg-red-950/30 border-red-800/40' :
              status === 'CERRADO'    ? 'bg-emerald-950/20 border-emerald-800/30' :
              status === 'LLEGADOS'   ? 'bg-amber-950/20 border-amber-800/30' :
                                        'bg-slate-800/70 border-slate-700/50';

            return (
              <div key={a.id} className={`rounded-2xl border p-4 space-y-3 transition-all ${cardStyle}`}>

                {/* Row 1: Hora + No. Op + Status badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xl font-black font-mono text-blue-400">
                      {a.horaAsignacion || '--:--'}
                    </span>
                    {a.numeroOperacion && (
                      <span className="text-sm font-bold text-pink-400 font-mono">{a.numeroOperacion}</span>
                    )}
                    <span className="text-xs text-slate-400">{a.fecha}</span>
                  </div>
                  <span className={`shrink-0 text-[10px] font-black uppercase px-2 py-1 rounded-full ${
                    status === 'CANCELADO' ? 'bg-red-500/20 text-red-400' :
                    status === 'CERRADO'   ? 'bg-emerald-500/20 text-emerald-400' :
                    status === 'LLEGADOS'  ? 'bg-amber-500/20 text-amber-400' :
                                             'bg-blue-500/20 text-blue-400'
                  }`}>
                    {status === 'CANCELADO' ? '✕ Cancelado' :
                     status === 'CERRADO'   ? '✓ Cerrado' :
                     status === 'LLEGADOS'  ? '● En Proceso' : '○ Pendiente'}
                  </span>
                </div>

                {/* Row 2: Caja + Driver */}
                <div className="flex items-center gap-3">
                  <div className="bg-slate-700/50 rounded-xl px-3 py-1.5 font-black font-mono text-white tracking-wider text-base">
                    {a.numeroCaja}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-semibold text-slate-300 truncate">{a.nombreDriver || '—'}</span>
                    <span className="text-[11px] text-slate-500 font-mono">{a.placasTracto || '—'}</span>
                    <span className="text-[11px] text-indigo-400 font-mono font-bold mt-0.5">REF: {a.driverId || 'N/A'}</span>
                  </div>
                </div>

                {/* Row 3: TL + Dock */}
                <div className="flex gap-2 flex-wrap">
                  {a.subLinea && (
                    <span className="bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[11px] font-bold px-2 py-1 rounded-lg">
                      {a.subLinea}
                    </span>
                  )}
                  {dock && (
                    <span className={`border text-[11px] font-bold px-2 py-1 rounded-lg ${
                      dock === 'CANCELED'   ? 'bg-red-500/10 border-red-500/20 text-red-400' :
                      dock === 'RECHAZADO'  ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400' :
                      dock === 'NO SHOW'    ? 'bg-orange-500/10 border-orange-500/20 text-orange-400' :
                      dock === 'DROP'       ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400' :
                                             'bg-sky-500/10 border-sky-500/20 text-sky-300'
                    }`}>
                      <Anchor size={10} className="inline mr-1 opacity-70" />
                      {liberacionDockIds.has(a.id!) && !['CANCELED', 'RECHAZADO', 'NO SHOW', 'DROP'].includes(dock) ? 'Dock Liberado' : dock}
                    </span>
                  )}
                </div>

                {/* Row 4: Arribo + Retraso + T.Planta */}
                <div className="grid grid-cols-3 gap-2">
                  {/* Arribo */}
                  <div className="bg-slate-900/50 rounded-xl p-3 flex flex-col items-center justify-center">
                    <span className="text-[11px] text-slate-500 uppercase font-bold tracking-wider mb-1">Arribo</span>
                    <span className={`text-base font-bold font-mono ${a.arribo ? 'text-amber-400' : 'text-slate-600'}`}>
                      {a.arribo || '—'}
                    </span>
                  </div>

                  {/* Retraso */}
                  <div className="bg-slate-900/50 rounded-xl p-3 flex flex-col items-center justify-center">
                    <span className="text-[11px] text-slate-500 uppercase font-bold tracking-wider mb-1">Retraso</span>
                    {retrasoMins !== null && a.arribo ? (
                      <span className={`text-sm font-bold ${retrasoMins > 30 ? 'text-red-400' : retrasoMins > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {retrasoMins <= 0 ? 'A tiempo' : `+${formatMins(retrasoMins)}`}
                      </span>
                    ) : (
                      <span className="text-slate-600 text-sm">—</span>
                    )}
                  </div>

                  {/* T. Planta */}
                  <div className="bg-slate-900/50 rounded-xl p-3 flex flex-col items-center justify-center">
                    <span className="text-[11px] text-slate-500 uppercase font-bold tracking-wider mb-1">T. Planta</span>
                    {enPlantaMins !== null && a.arribo ? (
                      <span className={`text-sm font-bold flex items-center gap-1 ${
                        hasLib ? 'text-emerald-400' :
                        enPlantaMins > 120 ? 'text-orange-400' : 'text-emerald-400'
                      }`}>
                        {!hasLib && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse inline-block" />}
                        {formatMins(enPlantaMins)}
                      </span>
                    ) : (
                      <span className="text-slate-600 text-sm">—</span>
                    )}
                  </div>
                </div>

                {/* Row 5: Layout / CCP / Liberación */}
                <div className="flex gap-2 pt-1 border-t border-slate-700/30">
                  <div className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-[11px] font-bold ${hasLayout ? 'bg-indigo-500/10 text-indigo-300' : 'bg-slate-800/50 text-slate-600'}`}>
                    <FileText size={12} />
                    Layout {hasLayout ? '✓' : '—'}
                  </div>
                  <div className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-[11px] font-bold ${hasCCP ? 'bg-sky-500/10 text-sky-300' : 'bg-slate-800/50 text-slate-600'}`}>
                    <FileCheck size={12} />
                    CCP {hasCCP ? '✓' : '—'}
                  </div>
                  <div className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-[11px] font-bold ${hasLib ? 'bg-emerald-500/10 text-emerald-300' : 'bg-slate-800/50 text-slate-600'}`}>
                    <CheckCircle2 size={12} />
                    {hasLib ? 'Liberado' : 'Sin lib.'}
                  </div>
                </div>

                {/* Comentarios si hay */}
                {a.comentariosArribo && (
                  <div className="bg-slate-900/50 rounded-xl px-3 py-2 text-[11px] text-slate-400 italic border border-slate-700/30">
                    💬 {a.comentariosArribo}
                  </div>
                )}

              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default HandheldAsignaciones;
