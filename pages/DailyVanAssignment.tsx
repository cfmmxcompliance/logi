import React, { useState, useEffect, useMemo } from 'react';
import { asignacionCajaService } from '../services/asignacionCajaService';
import { liberacionService } from '../services/liberacionService';
import { AsignacionCajaModel } from '../types/asignacionCaja';
import { LiberacionRecord, LiberacionDockRecord } from '../types';
import { Truck, CheckCircle, Clock, Calendar, RefreshCcw, Search, XCircle, Package2, Download } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { liberacionDockService } from '../services/liberacionDockService';

export const DailyVanAssignment: React.FC = () => {
  const [assignments, setAssignments] = useState<AsignacionCajaModel[]>([]);
  const [liberaciones, setLiberaciones] = useState<LiberacionRecord[]>([]);
  const [liberacionesDock, setLiberacionesDock] = useState<LiberacionDockRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const { t, language, setLanguage } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [cargadoFilter, setCargadoFilter] = useState<'ALL' | 'PENDIENTES' | 'EN_PROCESO' | 'CERRADO' | 'CANCELADO'>('ALL');

  const getLocalToday = () => {
    const today = new Date();
    const tzOffset = today.getTimezoneOffset() * 60000;
    return new Date(today.getTime() - tzOffset).toISOString().split('T')[0];
  };

  const [dateRange, setDateRange] = useState<{ start: string; end: string }>(() => {
    const today = getLocalToday();
    return { start: today, end: today };
  });

  const fetchData = async (start: string, end: string) => {
    setLoading(true);
    try {
      const [asigData, libData, libDockData] = await Promise.all([
        asignacionCajaService.getAsignacionesByDateRange(start, end),
        liberacionService.getLiberacionesByDateRange(start, end),
        liberacionDockService.getLiberacionesDockByDateRange(start, end),
      ]);
      asigData.sort((a, b) => {
        if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
        const timeA = a.horaAsignacion || '00:00';
        const timeB = b.horaAsignacion || '00:00';
        return timeA < timeB ? -1 : 1;
      });
      setAssignments(asigData);
      setLiberaciones(libData);
      setLiberacionesDock(libDockData);
    } catch (e) {
      console.error('Error loading van assignments:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(dateRange.start, dateRange.end);
  }, [dateRange.start, dateRange.end]);

  const filteredAssignments = useMemo(() => {
    if (!searchQuery.trim()) return assignments;
    const q = searchQuery.toLowerCase();
    return assignments.filter(a =>
      a.numeroCaja?.toLowerCase().includes(q) ||
      a.nombreDriver?.toLowerCase().includes(q) ||
      a.placasTracto?.toLowerCase().includes(q) ||
      a.numeroOperacion?.toLowerCase().includes(q)
    );
  }, [assignments, searchQuery]);

  // Counts para el filtro (siempre sobre el resultado de búsqueda, antes de aplicar cargadoFilter)
  const filterCounts = useMemo(() => {
    const isCanceledStatus = (v: string) => ['RECHAZADO', 'DROP', 'NO SHOW', 'CANCELED', 'CANCELADO'].includes(v);
    
    let pendientes = 0, enProceso = 0, cerrado = 0, cancelado = 0, vehCerrado = 0;
    let pendSinLayout = 0, pendSinCcp = 0, pendVeh = 0;
    let procSinLayout = 0, procSinCcp = 0, procVeh = 0;

    filteredAssignments.forEach(a => {
      const dockVal = String((a as any).dockArribo || '').trim().toUpperCase();
      const isCanceled = isCanceledStatus(dockVal);
      const hasLib = liberaciones.some(l => l.asignacionCajaId === a.id);
      const v = parseInt((a as any).vehiculos || '0', 10);
      
      if (isCanceled) {
        cancelado++;
      } else if (hasLib) {
        cerrado++;
        if (!isNaN(v)) vehCerrado += v;
      } else if (a.arribo) {
        enProceso++;
        if (!(a as any).layoutUrl) procSinLayout++;
        if (!(a as any).ccpUrl)    procSinCcp++;
        if (!isNaN(v)) procVeh += v;
      } else {
        pendientes++;
        if (!(a as any).layoutUrl) pendSinLayout++;
        if (!(a as any).ccpUrl)    pendSinCcp++;
        if (!isNaN(v)) pendVeh += v;
      }
    });
    return {
      ALL: filteredAssignments.length - cancelado, 
      PENDIENTES: pendientes, EN_PROCESO: enProceso, CERRADO: cerrado, CANCELADO: cancelado,
      PEND_SIN_LAYOUT: pendSinLayout, PEND_SIN_CCP: pendSinCcp, PEND_VEH: pendVeh,
      PROC_SIN_LAYOUT: procSinLayout, PROC_SIN_CCP: procSinCcp, PROC_VEH: procVeh,
      VEHICULOS_CERRADO: vehCerrado,
    };
  }, [filteredAssignments, liberaciones]);

  // Resultado final con cargadoFilter aplicado
  const displayedAssignments = useMemo(() => {
    const isCanceledStatus = (v: string) => ['RECHAZADO', 'DROP', 'NO SHOW', 'CANCELED', 'CANCELADO'].includes(v);
    
    if (cargadoFilter === 'ALL') {
      return filteredAssignments.filter(a => {
        const dockVal = String((a as any).dockArribo || '').trim().toUpperCase();
        return !isCanceledStatus(dockVal);
      });
    }

    return filteredAssignments.filter(a => {
      const dockVal = String((a as any).dockArribo || '').trim().toUpperCase();
      if (cargadoFilter === 'CANCELADO') return isCanceledStatus(dockVal);
      if (cargadoFilter === 'CERRADO') return !isCanceledStatus(dockVal) && liberaciones.some(l => l.asignacionCajaId === a.id);
      if (cargadoFilter === 'EN_PROCESO') return !isCanceledStatus(dockVal) && !liberaciones.some(l => l.asignacionCajaId === a.id) && !!a.arribo;
      if (cargadoFilter === 'PENDIENTES') return !isCanceledStatus(dockVal) && !liberaciones.some(l => l.asignacionCajaId === a.id) && !a.arribo;
      return true;
    });
  }, [filteredAssignments, cargadoFilter, liberaciones]);

  const getLibForCaja = (asigId: string) =>
    liberaciones.find(l => l.asignacionCajaId === asigId);

  const getLibDockForCaja = (asigId: string) =>
    liberacionesDock.find(l => l.asignacionCajaId === asigId);

  const released = assignments.filter(a => {
      const dockVal = String((a as any).dockArribo || '').trim().toUpperCase();
      return dockVal === 'RECHAZADO' || dockVal === 'DROP' || dockVal === 'NO SHOW' || getLibForCaja(a.id!);
  });
  const pending = assignments.filter(a => {
      const dockVal = String((a as any).dockArribo || '').trim().toUpperCase();
      const isExcluded = dockVal === 'RECHAZADO' || dockVal === 'DROP' || dockVal === 'NO SHOW';
      return !isExcluded && !getLibForCaja(a.id!);
  });

  const exportCSV = () => {
    const headers = [
      t('truck.col.hora'), t('truck.col.arribo'), t('truck.col.operacion'), t('truck.col.caja'), t('truck.col.driver'), t('truck.col.placas_tracto'), t('truck.col.placas_caja'), t('truck.col.scac'), t('truck.col.sublinea'), t('truck.col.modelo'), t('truck.col.creado_por'), t('truck.col.creado_at'), t('truck.col.layout_por'), t('truck.col.layout_at'), t('truck.col.ccp_por'), t('truck.col.ccp_at'), t('truck.col.lib_dock'), t('truck.col.lib_por'), t('truck.col.status'), t('truck.col.retraso'), t('truck.col.en_planta'), t('truck.col.ly_ccp'), t('truck.col.t_cierre')
    ];
    
    const formatMins = (mins: number | null) => {
      if (mins === null || isNaN(mins)) return '';
      if (mins < 0) return `${t('truck.temprano')} (${Math.abs(mins)}m)`;
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };

    const parseTime = (date: string, time: string) => {
      if (!date || !time) return null;
      const t = time.replace(/[a-zA-Z\s]/g, '');
      const [h, m] = t.split(':');
      if (!h || !m) return null;
      return new Date(`${date}T${h.padStart(2, '0')}:${m.padStart(2, '0')}:00`);
    };

    // Parser para el formato es-MX: "9/7/2026, 09:33:53" → Date válida
    const parseEsMx = (str: string | undefined): Date | null => {
      if (!str) return null;
      const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{2}:\d{2}:\d{2})/);
      if (m) return new Date(`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}T${m[4]}`);
      const d = new Date(str.replace(' ', 'T'));
      return isNaN(d.getTime()) ? null : d;
    };

    const rows = filteredAssignments.map(a => {
      const lib = getLibForCaja(a.id!);
      const libDock = getLibDockForCaja(a.id!);
      const status = lib ? t('truck.liberado') : t('truck.pendiente');
      const apptDate = parseTime(a.fecha, a.horaAsignacion || '');
      const arrDate  = parseTime(a.fecha, a.arribo || '');

      // T. Planta: desde arribo hasta liberación dock; si aún no hay liberación, tiempo real actual
      const relStr = libDock?.fechaHoraRegistro || lib?.fechaHoraRegistro;
      const relDate = parseEsMx(relStr) || (arrDate ? new Date() : null);
      const hasLib  = !!(parseEsMx(relStr)); // solo muestra si hay liberación real o no

      let retraso: number | null = null;
      if (apptDate && arrDate) retraso = Math.round((arrDate.getTime() - apptDate.getTime()) / 60000);

      let enPlanta: number | null = null;
      if (arrDate && relDate) enPlanta = Math.round((relDate.getTime() - arrDate.getTime()) / 60000);

      return [
        a.horaAsignacion || '',
        a.arribo || '',
        a.numeroOperacion || '',
        a.numeroCaja || '',
        a.nombreDriver || '',
        a.placasTracto || '',
        a.placasCaja || '',
        (a as any).scac || a.carrierCodigo || '',
        a.subLinea || '',
        (a as any).modeloAsignado || '',
        (a as any).createdBy || '',
        (a as any).createdAt ? new Date((a as any).createdAt).toLocaleString('es-MX', { timeZone: 'America/Monterrey' }) : '',
        (a as any).layoutUploadedBy || '',
        (a as any).layoutUploadedAt ? new Date((a as any).layoutUploadedAt).toLocaleString('es-MX', { timeZone: 'America/Monterrey' }) : '',
        (a as any).ccpUploadedBy || '',
        (a as any).ccpUploadedAt ? new Date((a as any).ccpUploadedAt).toLocaleString('es-MX', { timeZone: 'America/Monterrey' }) : '',
        libDock?.fechaHoraRegistro || libDock?.fechaLiberacion || '',
        lib?.creadoPor || lib?.liberadoPor || '',
        status,
        enPlanta !== null ? formatMins(enPlanta) + (hasLib ? '' : ` ${t('truck.en_patio')}`) : '',
        formatMins(retraso),
        // LY&CCP
        (() => {
          const lyAt  = (a as any).layoutUploadedAt ? new Date((a as any).layoutUploadedAt) : null;
          const ccpAt = (a as any).ccpUploadedAt   ? new Date((a as any).ccpUploadedAt)    : null;
          if (!lyAt) return '';
          const endAt = ccpAt || new Date();
          const mins = Math.round((endAt.getTime() - lyAt.getTime()) / 60000);
          if (isNaN(mins) || mins < 0) return '';
          const h = Math.floor(mins / 60), m = mins % 60;
          return (h > 0 ? `${h}h ${m}m` : `${m}m`) + (!ccpAt ? ' (live)' : '');
        })(),
        // T.CIERRE = Liberado por - Arribo
        (() => {
          if (!a.arribo) return '';
          const arrC = parseTime(a.fecha, a.arribo);
          if (!arrC) return '';
          const parseEsMxCsv = (s?: string): Date | null => {
            if (!s) return null;
            const mx = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{2}:\d{2}:\d{2})/);
            if (mx) return new Date(`${mx[3]}-${mx[2].padStart(2,'0')}-${mx[1].padStart(2,'0')}T${mx[4]}`);
            const d = new Date(s.replace(' ','T')); return isNaN(d.getTime()) ? null : d;
          };
          const lib = getLibForCaja(a.id!);
          const libD = parseEsMxCsv(lib?.fechaHoraRegistro) || new Date();
          const mins = Math.round((libD.getTime() - arrC.getTime()) / 60000);
          if (isNaN(mins) || mins < 0) return '';
          const h = Math.floor(mins / 60), m = mins % 60;
          return (h > 0 ? `${h}h ${m}m` : `${m}m`) + (!lib ? ' (live)' : '');
        })()
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${t('truck.title')}_${dateRange.start}_al_${dateRange.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-[calc(100vh-4rem)] -mt-8 -mx-8 flex flex-col overflow-hidden animate-fade-in bg-slate-900 w-full mx-auto">
      {/* ── FIXED HEADER / CONTROLS ── */}
      <div className="flex-shrink-0 p-4 sm:p-6 md:p-8 md:pb-4 space-y-6 relative z-20">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
              <Truck className="text-blue-400" size={32} />
              {t('truck.title')}
            </h1>
            <p className="text-slate-400 mt-1 text-sm">{t('truck.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Language Selector */}
            <div className="flex items-center rounded-lg border border-slate-700 overflow-hidden text-xs font-bold shadow-sm bg-slate-800 mr-2">
              {(['es','en','zh'] as const).map((lang, i) => (
                <button
                  key={lang}
                  onClick={() => language !== lang && setLanguage(lang)}
                  className={`px-3 py-2 transition-colors ${
                    language === lang
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:bg-slate-700 hover:text-white'
                  } ${i > 0 ? 'border-l border-slate-700' : ''}`}
                  title={lang === 'es' ? 'Español' : lang === 'en' ? 'English' : '中文'}
                >
                  {lang === 'zh' ? '中' : lang.toUpperCase()}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5">
              <span className="text-slate-400 text-xs font-medium whitespace-nowrap">{t('truck.inicio')}</span>
              <input
                type="date"
                value={dateRange.start}
                onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                className="bg-transparent text-white text-sm focus:outline-none"
              />
            </div>
            <span className="text-slate-500 text-sm">—</span>
            <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5">
              <span className="text-slate-400 text-xs font-medium whitespace-nowrap">{t('truck.fin')}</span>
              <input
                type="date"
                value={dateRange.end}
                min={dateRange.start}
                onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                className="bg-transparent text-white text-sm focus:outline-none"
              />
            </div>
            <button
              onClick={() => fetchData(dateRange.start, dateRange.end)}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg border border-slate-700 transition-colors"
              title={t('truck.recargar')}
            >
              <RefreshCcw size={18} />
            </button>
            <button
              onClick={exportCSV}
              className="flex items-center gap-2 px-3 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg border border-emerald-600 transition-colors text-sm font-medium"
              title={t('truck.descargar_csv')}
            >
              <Download size={16} />
              CSV
            </button>
          </div>
        </div>

        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: t('truck.total_asignadas'), value: assignments.length, icon: Package2, color: 'blue' },
            { label: t('truck.liberadas'), value: released.length, icon: CheckCircle, color: 'emerald' },
            { label: t('truck.pendientes'), value: pending.length, icon: Clock, color: 'amber' },
            { label: t('truck.completado'), value: assignments.length ? `${Math.round((released.length / assignments.length) * 100)}%` : '—', icon: Calendar, color: 'purple' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className={`bg-slate-800/60 border border-${color}-500/20 rounded-xl p-4 flex items-center gap-4`}>
              <div className={`w-10 h-10 rounded-lg bg-${color}-500/10 flex items-center justify-center`}>
                <Icon className={`text-${color}-400`} size={20} />
              </div>
              <div>
                <p className="text-slate-400 text-xs uppercase tracking-wider">{label}</p>
                <p className="text-2xl font-bold text-white">{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="bg-slate-800 rounded-xl p-2 flex items-center gap-3 border border-slate-700 focus-within:border-blue-500 transition-all">
          <Search className="text-slate-400 ml-2" size={18} />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={t('truck.buscar')}
            className="w-full bg-transparent border-none focus:outline-none text-white placeholder:text-slate-500 py-1.5 text-sm"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-slate-500 hover:text-white mr-2">
              <XCircle size={16} />
            </button>
          )}
        </div>

        {/* Filtro Todos / POR CERRAR / CERRADO */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg p-1 shadow-sm">
            <button
              onClick={() => setCargadoFilter('ALL')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                cargadoFilter === 'ALL' ? 'bg-teal-600 text-white shadow' : 'text-slate-400 hover:bg-slate-700'
              }`}
            >
              {t('filter.todos')} ({filterCounts.ALL})
            </button>
            <button
              onClick={() => setCargadoFilter('PENDIENTES')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex flex-col items-center leading-tight ${
                cargadoFilter === 'PENDIENTES' ? 'bg-teal-600 text-white shadow' : 'text-slate-400 hover:bg-slate-700'
              }`}
            >
              <span>{t('filter.pendientes')} ({filterCounts.PENDIENTES})</span>
              {(filterCounts.PEND_SIN_LAYOUT > 0 || filterCounts.PEND_SIN_CCP > 0 || filterCounts.PEND_VEH > 0) && (
                <span className={`flex gap-1.5 mt-0.5 text-[10px] font-semibold ${
                  cargadoFilter === 'PENDIENTES' ? 'text-teal-100' : 'text-slate-500'
                }`}>
                  {filterCounts.PEND_SIN_LAYOUT > 0 && <span>{t('filter.sin_layout')}: {filterCounts.PEND_SIN_LAYOUT}</span>}
                  {filterCounts.PEND_SIN_LAYOUT > 0 && filterCounts.PEND_SIN_CCP > 0 && <span>·</span>}
                  {filterCounts.PEND_SIN_CCP > 0 && <span>{t('filter.sin_ccp')}: {filterCounts.PEND_SIN_CCP}</span>}
                  {(filterCounts.PEND_SIN_LAYOUT > 0 || filterCounts.PEND_SIN_CCP > 0) && filterCounts.PEND_VEH > 0 && <span>·</span>}
                  {filterCounts.PEND_VEH > 0 && <span>🚗 {filterCounts.PEND_VEH} {t('filter.veh')}</span>}
                </span>
              )}
            </button>
            <button
              onClick={() => setCargadoFilter('EN_PROCESO')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex flex-col items-center leading-tight ${
                cargadoFilter === 'EN_PROCESO' ? 'bg-teal-600 text-white shadow' : 'text-slate-400 hover:bg-slate-700'
              }`}
            >
              <span>{t('filter.en_proceso')} ({filterCounts.EN_PROCESO})</span>
              {(filterCounts.PROC_SIN_LAYOUT > 0 || filterCounts.PROC_SIN_CCP > 0 || filterCounts.PROC_VEH > 0) && (
                <span className={`flex gap-1.5 mt-0.5 text-[10px] font-semibold ${
                  cargadoFilter === 'EN_PROCESO' ? 'text-teal-100' : 'text-slate-500'
                }`}>
                  {filterCounts.PROC_SIN_LAYOUT > 0 && <span>{t('filter.sin_layout')}: {filterCounts.PROC_SIN_LAYOUT}</span>}
                  {filterCounts.PROC_SIN_LAYOUT > 0 && filterCounts.PROC_SIN_CCP > 0 && <span>·</span>}
                  {filterCounts.PROC_SIN_CCP > 0 && <span>{t('filter.sin_ccp')}: {filterCounts.PROC_SIN_CCP}</span>}
                  {(filterCounts.PROC_SIN_LAYOUT > 0 || filterCounts.PROC_SIN_CCP > 0) && filterCounts.PROC_VEH > 0 && <span>·</span>}
                  {filterCounts.PROC_VEH > 0 && <span>🚗 {filterCounts.PROC_VEH} {t('filter.veh')}</span>}
                </span>
              )}
            </button>
            <button
              onClick={() => setCargadoFilter('CERRADO')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex flex-col items-center leading-tight ${
                cargadoFilter === 'CERRADO' ? 'bg-teal-600 text-white shadow' : 'text-slate-400 hover:bg-slate-700'
              }`}
            >
              <span>{t('filter.cerrado')} ({filterCounts.CERRADO})</span>
              {filterCounts.VEHICULOS_CERRADO > 0 && (
                <span className={`mt-0.5 text-[10px] font-semibold ${
                  cargadoFilter === 'CERRADO' ? 'text-teal-100' : 'text-slate-500'
                }`}>
                  🚗 {filterCounts.VEHICULOS_CERRADO} {t('filter.veh')}
                </span>
              )}
            </button>
            <button
              onClick={() => setCargadoFilter('CANCELADO')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex flex-col items-center leading-tight ${
                cargadoFilter === 'CANCELADO' ? 'bg-red-600 text-white shadow' : 'text-red-500 hover:bg-red-50'
              }`}
            >
              <span>{t('filter.cancelado')} ({filterCounts.CANCELADO})</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── SCROLLABLE TABLE AREA ── */}
      <div className="flex-1 flex flex-col min-h-0 px-4 sm:px-6 md:px-8 pb-8 relative z-10 space-y-4">

        {/* ── DOCK STATUS PANEL ── */}
        {!loading && (() => {
          const DOCK_FROM = 5;
          const DOCK_TO   = 10;
          const dockStatus: Record<string, AsignacionCajaModel | null> = {};
          for (let i = DOCK_FROM; i <= DOCK_TO; i++) dockStatus[`DOCK ${i}`] = null;

          assignments.forEach(a => {
            if (!a.dockArribo) return;
            const key = a.dockArribo.trim().toUpperCase();
            if (!(key in dockStatus)) return;
            const hasLibDock = liberacionesDock.some(l => l.asignacionCajaId === a.id);
            if (!hasLibDock) dockStatus[key] = a;
          });

          const ocupados = Object.values(dockStatus).filter(Boolean).length;
          const libres   = (DOCK_TO - DOCK_FROM + 1) - ocupados;

          return (
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">{t('truck.estado_docks')}</span>
                <div className="flex gap-3 text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                    <span className="text-emerald-400 font-semibold">{libres} {t('truck.libres').toLowerCase()}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
                    <span className="text-red-400 font-semibold">{ocupados} {t('truck.ocupados').toLowerCase()}</span>
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                {Array.from({length: DOCK_TO - DOCK_FROM + 1}, (_, i) => DOCK_FROM + i).map(n => {
                  const key = `DOCK ${n}`;
                  const asig = dockStatus[key];
                  return asig ? (
                    <div key={key} title={`${asig.numeroCaja} — ${asig.nombreDriver}`}
                      className="flex-1 bg-red-500/10 border border-red-500/40 rounded-lg p-2 flex flex-col items-center gap-0.5 cursor-default">
                      <span className="text-[10px] font-bold text-red-400 uppercase leading-none">{key}</span>
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-[9px] text-red-300/80 font-mono leading-none truncate w-full text-center" title={asig.numeroCaja}>{asig.numeroCaja}</span>
                      <span className="text-[8px] text-slate-500 leading-none truncate w-full text-center">{asig.numeroOperacion || '—'}</span>
                    </div>
                  ) : (
                    <div key={key}
                      className="flex-1 bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-2 flex flex-col items-center gap-0.5 cursor-default">
                      <span className="text-[10px] font-bold text-emerald-600 uppercase leading-none">{key}</span>
                      <span className="w-2 h-2 rounded-full bg-emerald-500/50" />
                      <span className="text-[9px] text-emerald-700/60 leading-none">{t('truck.libre')}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Table */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-auto flex-1 relative">
          <div className="min-w-max h-full">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                <RefreshCcw className="animate-spin mb-4" size={28} />
                <p>Cargando asignaciones...</p>
              </div>
            ) : displayedAssignments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                <Truck size={40} className="mb-3 opacity-40" />
                <p className="font-medium">No hay asignaciones para esta fecha</p>
              </div>
            ) : (
              <table className="w-full text-sm text-left text-slate-300 whitespace-nowrap">
                <thead className="bg-slate-900 text-xs uppercase text-slate-400 font-semibold sticky top-0 z-50 shadow-sm border-b border-slate-700/50">
                  <tr>
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">{t('truck.col.hora')}</th>
                    <th className="px-4 py-3">{t('truck.col.arribo')}</th>
                    <th className="px-4 py-3 text-red-400">{t('truck.col.retraso')}</th>
                    <th className="px-4 py-3 text-emerald-400">{t('truck.col.en_planta')}</th>
                    <th className="px-4 py-3 text-cyan-400 whitespace-nowrap">{t('truck.col.ly_ccp')}</th>
                    <th className="px-4 py-3 text-violet-300 whitespace-nowrap">{t('truck.col.t_cierre')}</th>
                    <th className="px-4 py-3">{t('truck.col.operacion')}</th>
                    <th className="px-4 py-3">{t('truck.col.caja')}</th>
                    <th className="px-4 py-3">{t('truck.col.driver')}</th>
                    <th className="px-4 py-3">{t('truck.col.placas_tracto')}</th>
                    <th className="px-4 py-3">{t('truck.col.placas_caja')}</th>
                    <th className="px-4 py-3 text-violet-400 whitespace-nowrap">{t('truck.col.creado_at')}</th>
                    <th className="px-4 py-3 text-amber-300 whitespace-nowrap">{t('truck.col.arribo')} AT</th>
                    <th className="px-4 py-3 text-indigo-400 text-center whitespace-nowrap">LAYOUT</th>
                    <th className="px-4 py-3 text-sky-400 text-center whitespace-nowrap">CCP</th>
                    <th className="px-4 py-3 text-sky-300 whitespace-nowrap">{t('truck.col.lib_dock')}</th>
                    <th className="px-4 py-3">{t('truck.col.lib_por')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {displayedAssignments.map((asig, idx) => {
                    const lib = getLibForCaja(asig.id!);
                    const isEven = idx % 2 === 0;
                    const dockValForColor = (asig.dockArribo || '').trim().toUpperCase();
                    const isCanceled = dockValForColor === 'CANCELED';
                    const isRechazado = dockValForColor === 'RECHAZADO';
                    const isDrop = dockValForColor === 'DROP';
                    const isNoShow = dockValForColor === 'NO SHOW';
                    let rowBg = isEven ? 'bg-slate-800/30' : 'bg-slate-900/40';
                    if (isCanceled) rowBg = 'bg-red-900/40 text-red-100';
                    else if (isRechazado || isDrop) rowBg = 'bg-yellow-900/40 text-yellow-100';
                    else if (isNoShow) rowBg = 'bg-orange-900/40 text-orange-100';

                    // Parse times for UI
                    const parseTimeUi = (date: string, time: string) => {
                      if (!date || !time) return null;
                      const t = time.replace(/[a-zA-Z\s]/g, '');
                      const [h, m] = t.split(':');
                      if (!h || !m) return null;
                      return new Date(`${date}T${h.padStart(2, '0')}:${m.padStart(2, '0')}:00`);
                    };

                    const apptDateUi = parseTimeUi(asig.fecha, asig.horaAsignacion || '');
                    const arrDateUi = parseTimeUi(asig.fecha, asig.arribo || '');
                    const dockRec = getLibDockForCaja(asig.id!);

                    const relStrUi = dockRec?.fechaHoraRegistro || lib?.fechaHoraRegistro;
                    const parseEsMxUi = (s?: string): Date | null => {
                      if (!s) return null;
                      const mx = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{2}:\d{2}:\d{2})/);
                      if (mx) return new Date(`${mx[3]}-${mx[2].padStart(2,'0')}-${mx[1].padStart(2,'0')}T${mx[4]}`);
                      const d = new Date(s.replace(' ','T')); return isNaN(d.getTime()) ? null : d;
                    };
                    let libDate = parseEsMxUi(relStrUi);
                    if (!libDate && (isRechazado || isDrop || isNoShow) && (asig as any).updatedAt) {
                        const d = new Date((asig as any).updatedAt);
                        if (!isNaN(d.getTime())) libDate = d;
                    }
                    const endDateUi = libDate || (arrDateUi ? new Date() : null);
                    const isLive = !libDate && !!arrDateUi;

                    let retrasoMins = null;
                    if (apptDateUi && arrDateUi) retrasoMins = Math.round((arrDateUi.getTime() - apptDateUi.getTime()) / 60000);

                    let enPlantaMins = null;
                    if (arrDateUi && endDateUi && !isNaN(endDateUi.getTime())) enPlantaMins = Math.round((endDateUi.getTime() - arrDateUi.getTime()) / 60000);

                    const formatTimeBadge = (mins: number | null, isRetraso: boolean) => {
                      if (mins === null || isNaN(mins)) return <span className="text-slate-600">—</span>;
                      if (isRetraso && mins <= 0) return <span className="text-slate-400 text-xs font-mono">0</span>;
                      const h = Math.floor(mins / 60);
                      const m = mins % 60;
                      const text = h > 0 ? `${h}h ${m}m` : `${m}m`;

                      if (isRetraso) {
                        if (mins > 30) return <span className="bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded text-xs font-bold">{text}</span>;
                        return <span className="text-amber-400 font-medium text-xs">{text}</span>;
                      } else {
                        if (mins < 0) return <span className="text-slate-400 text-xs">—</span>;
                        if (mins > 120) return <span className="bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded text-xs font-bold">{text}</span>;
                        return <span className="text-emerald-400 font-medium text-xs">{text}</span>;
                      }
                    };

                    return (
                      <tr key={asig.id} className={`${rowBg} hover:bg-slate-700/50 transition-colors`}>
                        <td className="px-4 py-3 text-slate-500 text-xs">{idx + 1}</td>
                        <td className="px-4 py-3 font-mono font-bold text-blue-400">{asig.horaAsignacion || '—'}</td>
                        <td className="px-4 py-3 font-mono text-amber-300 font-semibold">{asig.arribo || '—'}</td>
                        <td className="px-4 py-3">{formatTimeBadge(retrasoMins, true)}</td>
                        <td className="px-4 py-3">
                          {enPlantaMins !== null ? (
                            <span className="flex items-center gap-1">
                              {isLive && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" title="En patio - tiempo real" />}
                              {formatTimeBadge(enPlantaMins, false)}
                            </span>
                          ) : <span className="text-slate-600">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {(() => {
                            const lyAt  = (asig as any).layoutUploadedAt ? new Date((asig as any).layoutUploadedAt) : null;
                            const ccpAt = (asig as any).ccpUploadedAt   ? new Date((asig as any).ccpUploadedAt)    : null;
                            // Sin layout → nada que mostrar
                            if (!lyAt) return <span className="text-slate-600">—</span>;
                            // Con CCP: tiempo real entre layout y ccp
                            const endAt = ccpAt || new Date();
                            const isLiveLyCcp = !ccpAt;
                            const mins = Math.round((endAt.getTime() - lyAt.getTime()) / 60000);
                            if (isNaN(mins) || mins < 0) return <span className="text-slate-600">—</span>;
                            const h = Math.floor(mins / 60), m = mins % 60;
                            const text = h > 0 ? `${h}h ${m}m` : `${m}m`;
                            const badge = mins > 60
                              ? <span className="bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded text-xs font-bold">{text}</span>
                              : <span className="text-cyan-400 font-medium text-xs">{text}</span>;
                            return (
                              <span className="flex items-center gap-1">
                                {isLiveLyCcp && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" title="Sin CCP - tiempo real" />}
                                {badge}
                              </span>
                            );
                          })()}
                        </td>
                         {/* T.CIERRE = Liberado por timestamp - Arribo */}
                         <td className="px-4 py-3">
                           {(() => {
                             // Reutiliza arrDateUi (ya validado, mismo que T.Planta)
                             if (!arrDateUi) return <span className="text-slate-600">—</span>;
                             const parseEsMxC = (s?: string): Date | null => {
                               if (!s) return null;
                               const mx = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{2}:\d{2}:\d{2})/);
                               if (mx) return new Date(`${mx[3]}-${mx[2].padStart(2,'0')}-${mx[1].padStart(2,'0')}T${mx[4]}`);
                               const d = new Date(s.replace(' ','T')); return isNaN(d.getTime()) ? null : d;
                             };
                             let libDate  = parseEsMxC(lib?.fechaHoraRegistro);
                             if (!libDate && (isRechazado || isDrop || isNoShow) && (asig as any).updatedAt) {
                                 const d = new Date((asig as any).updatedAt);
                                 if (!isNaN(d.getTime())) libDate = d;
                             }
                             const endDateC = libDate || new Date();
                             const isLiveC  = !libDate;
                             const mins = Math.round((endDateC.getTime() - arrDateUi.getTime()) / 60000);
                             if (isNaN(mins) || mins < 0) return <span className="text-slate-600">—</span>;
                             const h = Math.floor(mins / 60), m = mins % 60;
                             const text = h > 0 ? `${h}h ${m}m` : `${m}m`;
                             const badge = mins > 120
                               ? <span className="bg-violet-500/20 text-violet-300 px-1.5 py-0.5 rounded text-xs font-bold">{text}</span>
                               : <span className="text-violet-300 font-medium text-xs">{text}</span>;
                             return (
                               <span className="flex items-center gap-1">
                                 {isLiveC && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" title="Sin cierre - tiempo real" />}
                                 {badge}
                               </span>
                             );
                           })()}
                         </td>
                         <td className="px-4 py-3 text-pink-400 font-semibold">{asig.numeroOperacion || '—'}</td>
                        <td className="px-4 py-3">
                          <span className="font-bold text-white font-mono tracking-wider">{asig.numeroCaja}</span>
                        </td>
                        <td className="px-4 py-3 font-medium">{asig.nombreDriver}</td>
                        <td className="px-4 py-3 font-mono text-slate-400">{asig.placasTracto}</td>
                        <td className="px-4 py-3 font-mono text-slate-400">{asig.placasCaja}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {(asig as any).createdAt ? (
                            <div className="flex flex-col gap-0">
                              {(asig as any).createdBy && (
                                <span className="text-[10px] font-bold text-violet-400 truncate max-w-[150px]" title={(asig as any).createdBy}>
                                  {(asig as any).createdBy}
                                </span>
                              )}
                              <span className="text-xs text-slate-300 font-mono">
                                {new Date((asig as any).createdAt).toLocaleDateString('es-MX', { timeZone: 'America/Monterrey', day: '2-digit', month: '2-digit', year: 'numeric' })}
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono">
                                {new Date((asig as any).createdAt).toLocaleTimeString('es-MX', { timeZone: 'America/Monterrey', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-600 text-xs">—</span>
                          )}
                        </td>

                        {/* ARRIBO AT */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          {asig.arriboAt ? (
                            <div className="flex flex-col gap-0">
                              {asig.arriboBy && (
                                <span className="text-[10px] font-bold text-amber-300 truncate max-w-[160px]" title={asig.arriboBy}>
                                  {asig.arriboBy}
                                </span>
                              )}
                              <span className="text-xs text-slate-300 font-mono">
                                {new Date(asig.arriboAt).toLocaleDateString('es-MX', { timeZone: 'America/Monterrey', day: '2-digit', month: '2-digit', year: 'numeric' })}
                              </span>
                              <span className="text-[10px] text-amber-400/70 font-mono">
                                {new Date(asig.arriboAt).toLocaleTimeString('es-MX', { timeZone: 'America/Monterrey', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-600 text-xs">—</span>
                          )}
                        </td>

                        {/* LAYOUT */}
                        <td className="px-4 py-3">
                          {(asig as any).layoutUploadedBy || (asig as any).layoutUploadedAt ? (
                            <div className="flex flex-col gap-0">
                              {(asig as any).layoutUploadedBy && (
                                <span className="text-[10px] font-bold text-indigo-400 truncate max-w-[150px]" title={(asig as any).layoutUploadedBy}>
                                  {(asig as any).layoutUploadedBy}
                                </span>
                              )}
                              {(asig as any).layoutUploadedAt && (
                                <>
                                  <span className="text-[10px] text-slate-300 font-mono">
                                    {new Date((asig as any).layoutUploadedAt).toLocaleDateString('es-MX', { timeZone: 'America/Monterrey', day: '2-digit', month: '2-digit', year: 'numeric' })}
                                  </span>
                                  <span className="text-[9px] text-slate-500 font-mono">
                                    {new Date((asig as any).layoutUploadedAt).toLocaleTimeString('es-MX', { timeZone: 'America/Monterrey', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                                  </span>
                                </>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-700 text-xs">—</span>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          {(asig as any).ccpUploadedBy || (asig as any).ccpUploadedAt ? (
                            <div className="flex flex-col gap-0">
                              {(asig as any).ccpUploadedBy && (
                                <span className="text-[10px] font-bold text-sky-400 truncate max-w-[150px]" title={(asig as any).ccpUploadedBy}>
                                  {(asig as any).ccpUploadedBy}
                                </span>
                              )}
                              {(asig as any).ccpUploadedAt && (
                                <>
                                  <span className="text-[10px] text-slate-300 font-mono">
                                    {new Date((asig as any).ccpUploadedAt).toLocaleDateString('es-MX', { timeZone: 'America/Monterrey', day: '2-digit', month: '2-digit', year: 'numeric' })}
                                  </span>
                                  <span className="text-[9px] text-slate-500 font-mono">
                                    {new Date((asig as any).ccpUploadedAt).toLocaleTimeString('es-MX', { timeZone: 'America/Monterrey', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                                  </span>
                                </>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-700 text-xs">—</span>
                          )}
                        </td>

                        {/* LIBERACION DOCK */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          {(() => {
                             const dockRec = getLibDockForCaja(asig.id!);
                             if (!dockRec) return <span className="text-slate-700 text-xs">—</span>;
                             return (
                               <div className="flex flex-col gap-0">
                                 {dockRec.usuario && (
                                   <span className="text-[10px] font-bold text-sky-400 truncate max-w-[150px]" title={dockRec.usuario}>
                                     {dockRec.usuario}
                                   </span>
                                 )}
                                 <span className="text-xs font-mono font-bold text-sky-300">
                                   {dockRec.fechaHoraRegistro || dockRec.fechaLiberacion || '—'}
                                 </span>
                               </div>
                             );
                          })()}
                        </td>

                        <td className="px-4 py-3 text-xs text-slate-500">
                          {lib ? (
                            <div className="flex flex-col">
                              <span className="text-emerald-400 font-medium">{lib.usuario}</span>
                              <span className="text-slate-600">{lib.fechaHoraRegistro}</span>
                            </div>
                          ) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        {assignments.length > 0 && (
          <div className="flex-shrink-0 bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-slate-400">{t('truck.progreso_lib')}</span>
              <span className="text-white font-semibold">{released.length} / {assignments.length} {t('truck.cajas')}</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-3">
              <div
                className="bg-gradient-to-r from-blue-600 to-emerald-500 h-3 rounded-full transition-all duration-500"
                style={{ width: `${Math.round((released.length / assignments.length) * 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs mt-1 text-slate-500">
              <span>{pending.length} {t('truck.pendientes_text')}</span>
              <span>{Math.round((released.length / assignments.length) * 100)}{t('truck.completado')}</span>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
