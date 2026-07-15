import React, { useState, useEffect, useMemo } from 'react';
import { asignacionCajaService } from '../services/asignacionCajaService';
import { liberacionService } from '../services/liberacionService';
import { AsignacionCajaModel } from '../types/asignacionCaja';
import { LiberacionRecord, LiberacionDockRecord } from '../types';
import { Truck, CheckCircle, Clock, Calendar, RefreshCcw, Search, XCircle, Package2, Download } from 'lucide-react';
import { liberacionDockService } from '../services/liberacionDockService';

export const DailyVanAssignment: React.FC = () => {
  const [assignments, setAssignments] = useState<AsignacionCajaModel[]>([]);
  const [liberaciones, setLiberaciones] = useState<LiberacionRecord[]>([]);
  const [liberacionesDock, setLiberacionesDock] = useState<LiberacionDockRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [cargadoFilter, setCargadoFilter] = useState<'ALL' | 'CERRADO' | 'POR_CERRAR'>('ALL');

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
    let porCerrar = 0, cerrado = 0, sinLayout = 0, sinCcp = 0, vehPorCerrar = 0, vehCerrado = 0;
    filteredAssignments.forEach(a => {
      const hasLib = liberaciones.some(l => l.asignacionCajaId === a.id);
      const v = parseInt((a as any).vehiculos || '0', 10);
      if (hasLib) {
        cerrado++;
        if (!isNaN(v)) vehCerrado += v;
      } else {
        porCerrar++;
        if (!(a as any).layoutUrl) sinLayout++;
        if (!(a as any).ccpUrl)    sinCcp++;
        if (!isNaN(v)) vehPorCerrar += v;
      }
    });
    return {
      ALL: filteredAssignments.length, CERRADO: cerrado, POR_CERRAR: porCerrar,
      SIN_LAYOUT: sinLayout, SIN_CCP: sinCcp,
      VEHICULOS_POR_CERRAR: vehPorCerrar, VEHICULOS_CERRADO: vehCerrado,
    };
  }, [filteredAssignments, liberaciones]);

  // Resultado final con cargadoFilter aplicado
  const displayedAssignments = useMemo(() => {
    if (cargadoFilter === 'ALL') return filteredAssignments;
    return filteredAssignments.filter(a => {
      const hasLib = liberaciones.some(l => l.asignacionCajaId === a.id);
      return cargadoFilter === 'CERRADO' ? hasLib : !hasLib;
    });
  }, [filteredAssignments, cargadoFilter, liberaciones]);

  const getLibForCaja = (asigId: string) =>
    liberaciones.find(l => l.asignacionCajaId === asigId);

  const getLibDockForCaja = (asigId: string) =>
    liberacionesDock.find(l => l.asignacionCajaId === asigId);

  const released = assignments.filter(a => getLibForCaja(a.id!));
  const pending = assignments.filter(a => !getLibForCaja(a.id!));

  const exportCSV = () => {
    const headers = [
      'HORA', 'ARRIBO', 'OPERACIÓN', 'CAJA (53-FT)', 'DRIVER', 'PLACAS TRACTO',
      'PLACAS CAJA', 'SCAC', 'SUB-LÍNEA', 'MODELO', 'CREADO POR', 'CREADO AT',
      'LAYOUT SUBIDO POR', 'LAYOUT AT', 'CCP SUBIDO POR', 'CCP AT',
      'LIBERACIÓN DOCK', 'LIBERADO POR', 'STATUS',
      'TIEMPO DE RETRASO', 'TIEMPO EN PLANTA', 'LY&CCP', 'T.CIERRE'
    ];
    
    const formatMins = (mins: number | null) => {
      if (mins === null || isNaN(mins)) return '';
      if (mins < 0) return `Temprano (${Math.abs(mins)}m)`;
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
      const status = lib ? 'LIBERADO' : 'PENDIENTE';
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
        enPlanta !== null ? formatMins(enPlanta) + (hasLib ? '' : ' (en patio)') : '',
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
    a.download = `TRUCK_TRACKING_${dateRange.start}_al_${dateRange.end}.csv`;
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
              TRUCK_TRACKING
            </h1>
            <p className="text-slate-400 mt-1 text-sm">Seguimiento de unidades y estado de liberación operativa</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5">
              <span className="text-slate-400 text-xs font-medium whitespace-nowrap">Inicio</span>
              <input
                type="date"
                value={dateRange.start}
                onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                className="bg-transparent text-white text-sm focus:outline-none"
              />
            </div>
            <span className="text-slate-500 text-sm">—</span>
            <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5">
              <span className="text-slate-400 text-xs font-medium whitespace-nowrap">Fin</span>
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
              title="Recargar"
            >
              <RefreshCcw size={18} />
            </button>
            <button
              onClick={exportCSV}
              className="flex items-center gap-2 px-3 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg border border-emerald-600 transition-colors text-sm font-medium"
              title="Descargar CSV"
            >
              <Download size={16} />
              CSV
            </button>
          </div>
        </div>

        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Asignadas', value: assignments.length, icon: Package2, color: 'blue' },
            { label: 'Liberadas', value: released.length, icon: CheckCircle, color: 'emerald' },
            { label: 'Pendientes', value: pending.length, icon: Clock, color: 'amber' },
            { label: '% Completado', value: assignments.length ? `${Math.round((released.length / assignments.length) * 100)}%` : '—', icon: Calendar, color: 'purple' },
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
            placeholder="Buscar por caja, chofer, placas, operación..."
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
              Todos ({filterCounts.ALL})
            </button>
            <button
              onClick={() => setCargadoFilter('POR_CERRAR')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex flex-col items-center leading-tight ${
                cargadoFilter === 'POR_CERRAR' ? 'bg-teal-600 text-white shadow' : 'text-slate-400 hover:bg-slate-700'
              }`}
            >
              <span>POR CERRAR ({filterCounts.POR_CERRAR})</span>
              {(filterCounts.SIN_LAYOUT > 0 || filterCounts.SIN_CCP > 0 || filterCounts.VEHICULOS_POR_CERRAR > 0) && (
                <span className={`flex gap-1.5 mt-0.5 text-[10px] font-semibold ${
                  cargadoFilter === 'POR_CERRAR' ? 'text-teal-100' : 'text-slate-500'
                }`}>
                  {filterCounts.SIN_LAYOUT > 0 && <span>sin layout: {filterCounts.SIN_LAYOUT}</span>}
                  {filterCounts.SIN_LAYOUT > 0 && filterCounts.SIN_CCP > 0 && <span>·</span>}
                  {filterCounts.SIN_CCP > 0 && <span>sin CCP: {filterCounts.SIN_CCP}</span>}
                  {(filterCounts.SIN_LAYOUT > 0 || filterCounts.SIN_CCP > 0) && filterCounts.VEHICULOS_POR_CERRAR > 0 && <span>·</span>}
                  {filterCounts.VEHICULOS_POR_CERRAR > 0 && <span>🚗 {filterCounts.VEHICULOS_POR_CERRAR} veh.</span>}
                </span>
              )}
            </button>
            <button
              onClick={() => setCargadoFilter('CERRADO')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex flex-col items-center leading-tight ${
                cargadoFilter === 'CERRADO' ? 'bg-teal-600 text-white shadow' : 'text-slate-400 hover:bg-slate-700'
              }`}
            >
              <span>CERRADO ({filterCounts.CERRADO})</span>
              {filterCounts.VEHICULOS_CERRADO > 0 && (
                <span className={`mt-0.5 text-[10px] font-semibold ${
                  cargadoFilter === 'CERRADO' ? 'text-teal-100' : 'text-slate-500'
                }`}>
                  🚗 {filterCounts.VEHICULOS_CERRADO} veh.
                </span>
              )}
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
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Estado de Docks</span>
                <div className="flex gap-3 text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                    <span className="text-emerald-400 font-semibold">{libres} libres</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
                    <span className="text-red-400 font-semibold">{ocupados} ocupados</span>
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
                      <span className="text-[9px] text-emerald-700/60 leading-none">libre</span>
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
                    <th className="px-4 py-3">Hora</th>
                    <th className="px-4 py-3">Arribo</th>
                    <th className="px-4 py-3 text-red-400">Retraso</th>
                    <th className="px-4 py-3 text-emerald-400">T. Planta</th>
                    <th className="px-4 py-3 text-cyan-400 whitespace-nowrap">LY&amp;CCP</th>
                    <th className="px-4 py-3 text-violet-300 whitespace-nowrap">T.CIERRE</th>
                    <th className="px-4 py-3">Operación</th>
                    <th className="px-4 py-3">Caja (53-ft Dry Van)</th>
                    <th className="px-4 py-3">Driver</th>
                    <th className="px-4 py-3">Placas Tracto</th>
                    <th className="px-4 py-3">Placas Caja</th>
                    <th className="px-4 py-3 text-violet-400 whitespace-nowrap">Creado</th>
                    <th className="px-4 py-3 text-amber-300 whitespace-nowrap">Arribo At</th>
                    <th className="px-4 py-3 text-indigo-400 text-center whitespace-nowrap">Layout</th>
                    <th className="px-4 py-3 text-sky-400 text-center whitespace-nowrap">CCP</th>
                    <th className="px-4 py-3 text-sky-300 whitespace-nowrap">Liberación Dock</th>
                    <th className="px-4 py-3">Liberado por</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {displayedAssignments.map((asig, idx) => {
                    const lib = getLibForCaja(asig.id!);
                    const isEven = idx % 2 === 0;
                    const rowBg = isEven ? 'bg-slate-800/30' : 'bg-slate-900/40';

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
                    const libDate = parseEsMxUi(relStrUi);
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
                             const libDate  = parseEsMxC(lib?.fechaHoraRegistro);
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
                              <span className="text-xs text-amber-300 font-mono font-semibold">
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
              <span className="text-slate-400">Progreso de Liberación</span>
              <span className="text-white font-semibold">{released.length} / {assignments.length} cajas</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-3">
              <div
                className="bg-gradient-to-r from-blue-600 to-emerald-500 h-3 rounded-full transition-all duration-500"
                style={{ width: `${Math.round((released.length / assignments.length) * 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs mt-1 text-slate-500">
              <span>{pending.length} pendientes</span>
              <span>{Math.round((released.length / assignments.length) * 100)}% completado</span>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
