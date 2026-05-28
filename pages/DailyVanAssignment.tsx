import React, { useState, useEffect, useMemo } from 'react';
import { asignacionCajaService } from '../services/asignacionCajaService';
import { liberacionService } from '../services/liberacionService';
import { AsignacionCajaModel } from '../types/asignacionCaja';
import { LiberacionRecord, LiberacionDockRecord } from '../types';
import { Truck, CheckCircle, Clock, Calendar, RefreshCcw, Search, XCircle, Package2 } from 'lucide-react';
import { liberacionDockService } from '../services/liberacionDockService';

export const DailyVanAssignment: React.FC = () => {
  const [assignments, setAssignments] = useState<AsignacionCajaModel[]>([]);
  const [liberaciones, setLiberaciones] = useState<LiberacionRecord[]>([]);
  const [liberacionesDock, setLiberacionesDock] = useState<LiberacionDockRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const getLocalToday = () => {
    const today = new Date();
    const tzOffset = today.getTimezoneOffset() * 60000;
    return new Date(today.getTime() - tzOffset).toISOString().split('T')[0];
  };

  const [selectedDate, setSelectedDate] = useState(getLocalToday());

  const fetchData = async (date: string) => {
    setLoading(true);
    try {
      const [asigData, libData, libDockData] = await Promise.all([
        asignacionCajaService.getAsignacionesByDate(date),
        liberacionService.getLiberacionesByDate(date),
        liberacionDockService.getLiberacionesDockByDate(date),
      ]);
      asigData.sort((a, b) => {
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
    fetchData(selectedDate);
  }, [selectedDate]);

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

  const getLibForCaja = (asigId: string) =>
    liberaciones.find(l => l.asignacionCajaId === asigId);

  const getLibDockForCaja = (asigId: string) =>
    liberacionesDock.find(l => l.asignacionCajaId === asigId);

  const released = assignments.filter(a => getLibForCaja(a.id!));
  const pending = assignments.filter(a => !getLibForCaja(a.id!));

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
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            <button
              onClick={() => fetchData(selectedDate)}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg border border-slate-700 transition-colors"
              title="Recargar"
            >
              <RefreshCcw size={18} />
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
      </div>

      {/* ── SCROLLABLE TABLE AREA ── */}
      <div className="flex-1 flex flex-col min-h-0 px-4 sm:px-6 md:px-8 pb-8 relative z-10 space-y-4">
        {/* Table */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-auto flex-1 relative">
          <div className="min-w-max h-full">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                <RefreshCcw className="animate-spin mb-4" size={28} />
                <p>Cargando asignaciones...</p>
              </div>
            ) : filteredAssignments.length === 0 ? (
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
                    <th className="px-4 py-3">Operación</th>
                    <th className="px-4 py-3">Caja (53-ft Dry Van)</th>
                    <th className="px-4 py-3">Driver</th>
                    <th className="px-4 py-3">Placas Tracto</th>
                    <th className="px-4 py-3">Placas Caja</th>
                    <th className="px-4 py-3 text-violet-400 whitespace-nowrap">Creado</th>
                    <th className="px-4 py-3 text-indigo-400 text-center whitespace-nowrap">Layout</th>
                    <th className="px-4 py-3 text-sky-400 text-center whitespace-nowrap">CCP</th>
                    <th className="px-4 py-3 text-sky-300 whitespace-nowrap">Liberación Dock</th>
                    <th className="px-4 py-3">Liberado por</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {filteredAssignments.map((asig, idx) => {
                    const lib = getLibForCaja(asig.id!);
                    const isEven = idx % 2 === 0;
                    const rowBg = isEven ? 'bg-slate-800/30' : 'bg-slate-900/40';
                    return (
                      <tr key={asig.id} className={`${rowBg} hover:bg-slate-700/50 transition-colors`}>
                        <td className="px-4 py-3 text-slate-500 text-xs">{idx + 1}</td>
                        <td className="px-4 py-3 font-mono font-bold text-blue-400">{asig.horaAsignacion || '—'}</td>
                        <td className="px-4 py-3 font-mono text-amber-300 font-semibold">{asig.arribo || '—'}</td>
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

                        {/* CCP */}
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
