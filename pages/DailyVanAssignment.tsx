import React, { useState, useEffect, useMemo } from 'react';
import { asignacionCajaService } from '../services/asignacionCajaService';
import { liberacionService } from '../services/liberacionService';
import { liberacionDockService } from '../services/liberacionDockService';
import { checkInService } from '../services/checkInService';
import { AsignacionCajaModel } from '../types/asignacionCaja';
import { LiberacionRecord, LiberacionDockRecord } from '../types';
import { Truck, CheckCircle, Clock, Calendar, RefreshCcw, Search, XCircle, Package2, Download } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

const formatEsMx24 = (d: Date) => d.toLocaleString('es-MX', { timeZone: 'America/Monterrey', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

const normalizeDateString = (s?: string) => {
  if (!s) return '';
  const mx = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4}),?\s+(\d{1,2}:\d{2}(:\d{2})?)/);
  if (mx) {
    let y = mx[3]; if (y.length === 2) y = '20' + y;
    let t = mx[4]; 
    if (t.split(':').length === 2) t += ':00'; 
    const [h,m,sec] = t.split(':');
    t = `${h.padStart(2,'0')}:${m.padStart(2,'0')}:${sec.padStart(2,'0')}`;
    const d = new Date(`${y}-${mx[2].padStart(2,'0')}-${mx[1].padStart(2,'0')}T${t}-06:00`);
    if (!isNaN(d.getTime())) return formatEsMx24(d);
  }
  const d = new Date(s.replace(' ','T'));
  return isNaN(d.getTime()) ? s : formatEsMx24(d);
};

const formatDurationHHMMSS = (mins: number | null) => {
  if (mins === null || isNaN(mins)) return '';
  if (mins < 0) return '00:00:00';
  const h = Math.floor(mins / 60);
  const m = Math.floor(mins % 60);
  const hStr = String(h).padStart(2, '0');
  const mStr = String(m).padStart(2, '0');
  return `${hStr}:${mStr}:00`;
};

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
      // Obtenemos check-ins 7 días atrás para evitar perder check-ins nocturnos
      const cutoff = new Date(start);
      cutoff.setDate(cutoff.getDate() - 7);
      const [asigData, libData, libDockData, checkInsData] = await Promise.all([
        asignacionCajaService.getAsignacionesByDateRange(start, end),
        liberacionService.getLiberacionesByDateRange(start, end),
        liberacionDockService.getLiberacionesDockByDateRange(start, end),
        checkInService.getCheckIns(cutoff.toISOString())
      ]);
      const todayStr = getLocalToday();
      const processedAsigData = asigData.map(a => {
        const hasLib = libData.some(l => l.asignacionCajaId === a.id);
        const dockVal = String(a.dockArribo || '').trim().toUpperCase();
        const isCanceled = ['RECHAZADO', 'DROP', 'NO SHOW', 'CANCELED', 'CANCELADO'].includes(dockVal);
        
        // Find matching checkIn to extract DRIVER ARRIVAL info directly from Check Ins module
        const linkedCheckIn = checkInsData.find(c => c.asignacionCajaId === a.id);
        if (linkedCheckIn && !a.checkInAt) {
          a.checkInAt = linkedCheckIn.checkInAt;
        }

        if (!hasLib && !isCanceled && a.fecha < todayStr) {
          return { ...a, dockArribo: 'NO SHOW', _autoNoShow: true };
        }
        return a;
      });

      processedAsigData.sort((a, b) => {
        if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
        const timeA = a.horaAsignacion || '00:00';
        const timeB = b.horaAsignacion || '00:00';
        return timeA < timeB ? -1 : 1;
      });
      setAssignments(processedAsigData);
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
    
    const terms = searchQuery.toLowerCase().split(',').map(t => t.trim()).filter(Boolean);

    return assignments.filter(a => {
      return terms.some(term => 
        a.numeroCaja?.toLowerCase().includes(term) ||
        a.nombreDriver?.toLowerCase().includes(term) ||
        a.placasTracto?.toLowerCase().includes(term) ||
        a.numeroOperacion?.toLowerCase().includes(term)
      );
    });
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
      return ['RECHAZADO', 'DROP', 'NO SHOW', 'CANCELED', 'CANCELADO'].includes(dockVal) || getLibForCaja(a.id!);
  });
  const pending = assignments.filter(a => {
      const dockVal = String((a as any).dockArribo || '').trim().toUpperCase();
      const isExcluded = ['RECHAZADO', 'DROP', 'NO SHOW', 'CANCELED', 'CANCELADO'].includes(dockVal);
      return !isExcluded && !getLibForCaja(a.id!);
  });

  const exportCSV = () => {
    const circularElapsed = (mins: number) => {
      if (isNaN(mins)) return null;
      const m = mins % 1440;
      return m < 0 ? m + 1440 : m;
    };

    const circularDelay = (mins: number) => {
      if (isNaN(mins)) return null;
      let m = mins % 1440;
      if (m > 720) m -= 1440;
      if (m < -720) m += 1440;
      return m;
    };
    const headers = [
      t('truck.col.fecha'), t('truck.col.hora'), t('truck.col.driver_arrival'), t('truck.col.arribo'), t('truck.col.dock_arribo'), t('truck.col.comentarios_arribo'),
      t('truck.col.operacion'), t('truck.col.caja'), t('truck.col.driver'), t('truck.col.placas_tracto'), t('truck.col.placas_caja'), 
      t('truck.col.scac'), t('truck.col.sublinea'), t('truck.col.modelo'), t('truck.col.dealer'), t('truck.col.carrier_ref'), 
      t('truck.col.observaciones'), t('truck.col.notas'), 
      t('truck.col.creado_por'), t('truck.col.creado_at'), 
      t('truck.col.layout_por'), t('truck.col.layout_at'), 
      t('truck.col.ccp_por'), t('truck.col.ccp_at'), 
      t('truck.col.anexo29_por'), t('truck.col.anexo29_at'),
      t('truck.col.lib_dock'), t('truck.col.lib_por'), t('truck.col.status'), 
      t('truck.col.retraso'), t('truck.col.en_planta'), t('truck.col.t_layout'), t('truck.col.ly_ccp'), t('truck.col.t_cierre'),
      t('truck.col.lib_fecha')
    ];

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
      const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2}):(\d{2})/);
      if (m) return new Date(`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}T${m[4].padStart(2,'0')}:${m[5]}:${m[6]}`);
      const d = new Date(str.replace(' ', 'T'));
      return isNaN(d.getTime()) ? null : d;
    };

    const formatCsvDateTime = (isoStr: string | null | undefined) => {
      if (!isoStr) return '';
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr.replace(', ', ' ');
      const pad = (n: number) => n.toString().padStart(2, '0');
      return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };

    const formatCsvDateOnly = (ymdStr: string | null | undefined) => {
      if (!ymdStr) return '';
      if (ymdStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [y, m, d] = ymdStr.split('-');
        return `${d}/${m}/${y}`;
      }
      return ymdStr;
    };

    const rows = displayedAssignments.map(a => {
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
      if (apptDate && arrDate) {
        let apptM = apptDate.getHours() * 60 + apptDate.getMinutes();
        let arrM = arrDate.getHours() * 60 + arrDate.getMinutes();
        const diff = arrM - apptM;
        retraso = circularDelay(diff);
      }

      let enPlanta: number | null = null;
      if (arrDate && relDate) {
        let arrM = arrDate.getHours() * 60 + arrDate.getMinutes();
        let relM = relDate.getHours() * 60 + relDate.getMinutes();
        let diff = relM - arrM;
        enPlanta = circularElapsed(diff);
      }

      return [
        formatCsvDateOnly(a.fecha),
        a.horaAsignacion || '',
        formatCsvDateTime(a.checkInAt),
        a.arribo || '',
        (a as any).dockArribo || '',
        a.comentariosArribo || '',
        a.numeroOperacion || '',
        a.numeroCaja || '',
        a.nombreDriver || '',
        a.placasTracto || '',
        a.placasCaja || '',
        (a as any).scac || a.carrierCodigo || '',
        a.subLinea || '',
        (a as any).modeloAsignado || '',
        a.dealerAsignado || '',
        a.carrierRef || '',
        a.observaciones || '',
        a.notas || '',
        (a as any).createdBy || '',
        formatCsvDateTime((a as any).createdAt),
        (a as any).layoutUploadedBy || '',
        formatCsvDateTime((a as any).layoutUploadedAt),
        (a as any).ccpUploadedBy || '',
        formatCsvDateTime((a as any).ccpUploadedAt),
        (a as any).anexo29UploadedBy || '',
        formatCsvDateTime((a as any).anexo29UploadedAt),
        (() => {
          let dr = libDock?.fechaHoraRegistro || libDock?.fechaLiberacion || '';
          const lyAt  = (a as any).layoutUploadedAt ? new Date((a as any).layoutUploadedAt) : null;
          if (!dr && lyAt) {
            return formatCsvDateTime(new Date(lyAt.getTime() - 30 * 60000).toISOString());
          } else if (dr) {
            return dr.replace(', ', ' '); // Clean format
          }
          return dr;
        })(),
        lib?.creadoPor || lib?.liberadoPor || '',
        status,
        retraso !== null ? formatDurationHHMMSS(retraso) : '',
        enPlanta !== null ? formatDurationHHMMSS(enPlanta) : '',
        (() => {
          const hasUsdb1 = String(a.observaciones || '').toUpperCase().includes('USDB1');
          if (hasUsdb1) return '';
          const arrDateUi = parseEsMx(a.arriboAt) || parseEsMx(a.arribo) || parseTime(a.fecha, a.arribo || '');
          const drStr = libDock?.fechaHoraRegistro || libDock?.fechaLiberacion;
          const drDate = parseEsMx(drStr);
          const baseDateLy = drDate || arrDateUi;
          if (!baseDateLy) return '';
          const lyAt = (a as any).layoutUploadedAt ? new Date((a as any).layoutUploadedAt) : null;
          const endAt = lyAt || new Date();
          let mins = Math.round((endAt.getTime() - baseDateLy.getTime()) / 60000);
          if (isNaN(mins)) return '';
          if (mins < 0) mins = 0;
          return formatDurationHHMMSS(mins);
        })(),
        (() => {
          const hasUsdb1 = String(a.observaciones || '').toUpperCase().includes('USDB1');
          if (hasUsdb1) return '';
          const lyAt  = (a as any).layoutUploadedAt ? new Date((a as any).layoutUploadedAt) : null;
          const ccpAt = (a as any).ccpUploadedAt   ? new Date((a as any).ccpUploadedAt)    : null;
          if (!lyAt) return '';
          const endAt = ccpAt || new Date();
          const mins = Math.round((endAt.getTime() - lyAt.getTime()) / 60000);
          if (isNaN(mins) || mins < 0) return '';
          return formatDurationHHMMSS(mins);
        })(),
        (() => {
          const hasUsdb1 = String(a.observaciones || '').toUpperCase().includes('USDB1');
          if (hasUsdb1) return '';
          const lT = (a as any).layoutUploadedAt ? new Date((a as any).layoutUploadedAt) : null;
          const cT = (a as any).ccpUploadedAt ? new Date((a as any).ccpUploadedAt) : null;
          if(lT && cT) {
            const diffMs = Math.abs(cT.getTime() - lT.getTime());
            return formatDurationHHMMSS(circularElapsed(Math.floor(diffMs / 60000)) || 0);
          }
          return '';
        })(),
        formatCsvDateTime(lib?.fechaHoraRegistro || lib?.fechaLiberacion || '')
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
            const dockVal = key;
            const isCanceled = ['RECHAZADO', 'DROP', 'NO SHOW', 'CANCELED', 'CANCELADO'].includes(dockVal);
            const hasLibDock = liberacionesDock.some(l => l.asignacionCajaId === a.id);
            const hasLib = liberaciones.some(l => l.asignacionCajaId === a.id);
            // Si no tiene liberación de dock, pero tampoco ha salido por caseta ni fue cancelado, entonces ocupa el dock
            if (!hasLibDock && !hasLib && !isCanceled) dockStatus[key] = a;
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
                    <th className="px-4 py-3 text-cyan-300">{t('truck.col.driver_arrival')}</th>
                    <th className="px-4 py-3">{t('truck.col.arribo')}</th>
                    <th className="px-4 py-3 text-red-400">{t('truck.col.retraso')}</th>
                    <th className="px-4 py-3 text-emerald-400">{t('truck.col.en_planta')}</th>
                    <th className="px-4 py-3 text-cyan-400 whitespace-nowrap">{t('truck.col.t_layout')}</th>
                    <th className="px-4 py-3 text-sky-400 whitespace-nowrap">{t('truck.col.t_ccp')}</th>
                    <th className="px-4 py-3 text-violet-300 whitespace-nowrap">{t('truck.col.t_cierre')}</th>
                    <th className="px-4 py-3">{t('truck.col.operacion')}</th>
                    <th className="px-4 py-3">{t('truck.col.caja')}</th>
                    <th className="px-4 py-3">{t('truck.col.driver')}</th>
                    <th className="px-4 py-3">{t('truck.col.placas_tracto')}</th>
                    <th className="px-4 py-3">{t('truck.col.placas_caja')}</th>
                    <th className="px-4 py-3 text-violet-400 whitespace-nowrap">{t('truck.col.creado_at')}</th>
                    <th className="px-4 py-3 text-amber-300 whitespace-nowrap">{t('truck.col.arribo')} AT</th>
                    <th className="px-4 py-3 text-sky-300 whitespace-nowrap">{t('truck.col.lib_dock')}</th>
                    <th className="px-4 py-3">{t('truck.col.lib_por')}</th>
                    <th className="px-4 py-3 text-indigo-400 text-center whitespace-nowrap">LAYOUT</th>
                    <th className="px-4 py-3 text-sky-400 text-center whitespace-nowrap">CCP</th>
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
                    const arrDateUi = asig.arriboAt ? new Date(asig.arriboAt) : parseTimeUi(asig.fecha, asig.arribo || '');
                    const dockRec = getLibDockForCaja(asig.id!);

                    const relStrUi = dockRec?.fechaHoraRegistro; // Option B: Strictly Dock Release
                    const parseEsMxUi = (s?: string): Date | null => {
                      if (!s) return null;
                      const mx = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2}):(\d{2})/);
                      if (mx) return new Date(`${mx[3]}-${mx[2].padStart(2,'0')}-${mx[1].padStart(2,'0')}T${mx[4].padStart(2,'0')}:${mx[5]}:${mx[6]}`);
                      const d = new Date(s.replace(' ','T')); return isNaN(d.getTime()) ? null : d;
                    };
                    let libDate = parseEsMxUi(relStrUi);
                    let isDockAuto = false;
                    const lyAtGlobal = (asig as any).layoutUploadedAt ? new Date((asig as any).layoutUploadedAt) : null;
                    if (!libDate && lyAtGlobal) {
                        libDate = new Date(lyAtGlobal.getTime() - 30 * 60000);
                        isDockAuto = true;
                    } else if (!libDate && (isRechazado || isDrop || isNoShow) && (asig as any).updatedAt) {
                        const d = new Date((asig as any).updatedAt);
                        if (!isNaN(d.getTime())) libDate = d;
                    }
                    const isClosedOut = !!lib?.fechaHoraRegistro;
                    const isLive = !libDate && !isClosedOut && !!arrDateUi;
                    const endDateUi = libDate || (isLive ? new Date() : null);

                    let retrasoMins = null;
                    if (apptDateUi && arrDateUi) {
                      const diff = (arrDateUi.getHours() * 60 + arrDateUi.getMinutes()) - (apptDateUi.getHours() * 60 + apptDateUi.getMinutes());
                      let m = diff % 1440;
                      if (m > 720) m -= 1440;
                      if (m < -720) m += 1440;
                      retrasoMins = m;
                    }

                    let enPlantaMins = null;
                    if (arrDateUi && endDateUi && !isNaN(endDateUi.getTime())) {
                      const mins = Math.round((endDateUi.getTime() - arrDateUi.getTime()) / 60000);
                      if (!isNaN(mins) && mins >= 0) {
                        enPlantaMins = mins;
                      } else if (!isNaN(mins) && mins < 0 && !asig.arriboAt) {
                        // Fallback using modulo for legacy records without arriboAt
                        const diff = (endDateUi.getHours() * 60 + endDateUi.getMinutes()) - (arrDateUi.getHours() * 60 + arrDateUi.getMinutes());
                        let m = diff % 1440;
                        enPlantaMins = m < 0 ? m + 1440 : m;
                      }
                    }

                    const formatTimeBadge = (mins: number | null, isRetraso: boolean) => {
                      if (mins === null || isNaN(mins)) return <span className="text-slate-600">—</span>;
                      if (isRetraso && mins <= 0) {
                        return <span className="text-slate-400 text-xs font-mono">{formatDurationHHMMSS(mins)}</span>;
                      }
                      const text = formatDurationHHMMSS(mins);

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
                        <td className="px-4 py-3 whitespace-nowrap">
                          {asig.checkInAt ? (
                            <div className="flex flex-col gap-0">
                              <span className="font-semibold text-cyan-400">
                                {new Date(asig.checkInAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit'})}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                {new Date(asig.checkInAt).toLocaleDateString('es-MX')}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
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
                        {/* T.LAYOUT */}
                        <td className="px-4 py-3">
                          {(() => {
                            const hasUsdb1 = String((asig as any).observaciones || '').toUpperCase().includes('USDB1');
                            if (hasUsdb1) return <span className="text-slate-600">—</span>;
                            let baseDateLy = libDate || arrDateUi;
                            if (!baseDateLy) return <span className="text-slate-600">—</span>;
                            const lyAt = (asig as any).layoutUploadedAt ? new Date((asig as any).layoutUploadedAt) : null;
                            const endAt = lyAt || new Date();
                            const isLiveLy = !lyAt;
                            let mins = Math.round((endAt.getTime() - baseDateLy.getTime()) / 60000);
                            if (isNaN(mins)) return <span className="text-slate-600">—</span>;
                            if (mins < 0) mins = 0;
                            const h = Math.floor(mins / 60), m = mins % 60;
                            const text = h > 0 ? `${h}h ${m}m` : `${m}m`;
                            const badge = mins > 60
                              ? <span className="bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded text-xs font-bold">{text}</span>
                              : <span className="text-cyan-400 font-medium text-xs">{text}</span>;
                            return (
                              <span className="flex items-center gap-1">
                                {isLiveLy && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" title="Sin Layout - tiempo real" />}
                                {badge}
                              </span>
                            );
                          })()}
                        </td>
                        {/* T.CCP */}
                        <td className="px-4 py-3">
                          {(() => {
                            const hasUsdb1 = String((asig as any).observaciones || '').toUpperCase().includes('USDB1');
                            if (hasUsdb1) return <span className="text-slate-600">—</span>;
                            const lyAt = (asig as any).layoutUploadedAt ? new Date((asig as any).layoutUploadedAt) : null;
                            const ccpAt = (asig as any).ccpUploadedAt ? new Date((asig as any).ccpUploadedAt) : null;
                            if (!lyAt) return <span className="text-slate-600">—</span>;
                            const endAt = ccpAt || new Date();
                            const isLiveCcp = !ccpAt;
                            const mins = Math.round((endAt.getTime() - lyAt.getTime()) / 60000);
                            if (isNaN(mins) || mins < 0) return <span className="text-slate-600">—</span>;
                            const h = Math.floor(mins / 60), m = mins % 60;
                            const text = h > 0 ? `${h}h ${m}m` : `${m}m`;
                            const badge = mins > 60
                              ? <span className="bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded text-xs font-bold">{text}</span>
                              : <span className="text-sky-400 font-medium text-xs">{text}</span>;
                            return (
                              <span className="flex items-center gap-1">
                                {isLiveCcp && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" title="Sin CCP - tiempo real" />}
                                {badge}
                              </span>
                            );
                          })()}
                        </td>
                         {/* T.CIERRE = Liberado por timestamp - Arribo */}
                         <td className="px-4 py-3">
                           {(() => {
                             // Reutiliza arrDateUi (ya validado, mismo que T.Planta)
                             const parseEsMxC = (s?: string): Date | null => {
                               if (!s) return null;
                               const mx = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2}):(\d{2})/);
                               if (mx) return new Date(`${mx[3]}-${mx[2].padStart(2,'0')}-${mx[1].padStart(2,'0')}T${mx[4].padStart(2,'0')}:${mx[5]}:${mx[6]}`);
                               const d = new Date(s.replace(' ','T')); return isNaN(d.getTime()) ? null : d;
                             };
                             let libDate  = parseEsMxC(lib?.fechaHoraRegistro);
                             if (!libDate && (isRechazado || isDrop || isNoShow) && (asig as any).updatedAt) {
                                 const d = new Date((asig as any).updatedAt);
                                 if (!isNaN(d.getTime())) libDate = d;
                             }
                             const endDateC = libDate || new Date();
                             const isLiveC  = !libDate;
                             if (!arrDateUi) return <span className="text-slate-600">—</span>;
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
                                <span className="text-slate-200 text-xs font-medium">
                                  {(asig as any).createdBy}
                                </span>
                              )}
                              <span className="text-[10px] text-slate-400 font-mono">
                                {formatEsMx24(new Date((asig as any).createdAt))}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>

                        {/* ARRIBO AT */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          {asig.arriboAt ? (
                            <div className="flex flex-col gap-0">
                              {asig.arriboBy && (
                                <span className="text-slate-200 text-xs font-medium">
                                  {asig.arriboBy}
                                </span>
                              )}
                              <span className="text-[10px] text-slate-400 font-mono">
                                {formatEsMx24(new Date(asig.arriboAt))}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>

                        {/* LIBERACION DOCK */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          {(() => {
                            const dockRec = getLibDockForCaja(asig.id!);
                            let dr = dockRec?.fechaHoraRegistro || dockRec?.fechaLiberacion || '';
                            const lyAtLocal  = (asig as any).layoutUploadedAt ? new Date((asig as any).layoutUploadedAt) : null;
                            let isAuto = false;
                            
                            if (!dr && lyAtLocal) {
                              dr = formatEsMx24(new Date(lyAtLocal.getTime() - 30 * 60000));
                              isAuto = true;
                            } else if (dr) {
                              dr = normalizeDateString(dr);
                            }
                            
                            if (!dockRec && !isAuto) {
                              return <span className="text-slate-700 text-xs">—</span>;
                            }
                            return (
                              <div className="flex flex-col gap-0">
                                {dockRec?.usuario && (
                                  <span className="text-slate-200 text-xs font-medium">
                                    {dockRec.usuario}
                                  </span>
                                )}
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {dr}
                                </span>
                              </div>
                            );
                          })()}
                        </td>

                        {/* T. CIERRE */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          {(() => {
                            const lib = getLibForCaja(asig.id!);
                            const generalReleaseStr = lib?.fechaHoraRegistro || lib?.fechaLiberacion || '';
                            const dr = normalizeDateString(generalReleaseStr);
                            if (!lib) return <span className="text-slate-700 text-xs">—</span>;
                            return (
                              <div className="flex flex-col gap-0">
                                {(lib.creadoPor || lib.liberadoPor) && (
                                  <span className="text-slate-200 text-xs font-medium">
                                    {lib.creadoPor || lib.liberadoPor}
                                  </span>
                                )}
                                <span className="text-[10px] text-emerald-400 font-mono">
                                  {dr || '—'}
                                </span>
                              </div>
                            );
                          })()}
                        </td>

                        {/* LAYOUT */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          {(asig as any).layoutUploadedAt ? (
                            <div className="flex flex-col gap-0">
                              {(asig as any).layoutUploadedBy && (
                                <span className="text-slate-200 text-xs font-medium">
                                  {(asig as any).layoutUploadedBy}
                                </span>
                              )}
                              <span className="text-[10px] text-slate-400 font-mono">
                                {formatEsMx24(new Date((asig as any).layoutUploadedAt))}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>

                        {/* CCP */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          {(asig as any).ccpUploadedAt ? (
                            <div className="flex flex-col gap-0">
                              {(asig as any).ccpUploadedBy && (
                                <span className="text-slate-200 text-xs font-medium">
                                  {(asig as any).ccpUploadedBy}
                                </span>
                              )}
                              <span className="text-[10px] text-slate-400 font-mono">
                                {formatEsMx24(new Date((asig as any).ccpUploadedAt))}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
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
