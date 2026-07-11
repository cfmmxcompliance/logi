import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { asignacionCajaService } from '../services/asignacionCajaService.ts';
import { AsignacionCajaModel } from '../types/asignacionCaja.ts';
import { ArrowLeft, Loader2, Box, Clock, CheckCircle, Truck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { HandheldToolbar } from '../components/HandheldToolbar.tsx';

export const HandheldArribo = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [cajasDelDia, setCajasDelDia] = useState<AsignacionCajaModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Per-card state: { [cajaId]: value }
  const [comentarios, setComentarios] = useState<Record<string, string>>({});
  const [docks, setDocks] = useState<Record<string, string>>({});

  const DOCK_OPTIONS = Array.from({ length: 13 }, (_, i) => `DOCK ${i + 1}`);

  const getLocalToday = () => {
    const today = new Date();
    const tzOffset = today.getTimezoneOffset() * 60000;
    return new Date(today.getTime() - tzOffset).toISOString().split('T')[0];
  };

  const [dateStart, setDateStart] = useState<string>(getLocalToday());
  const [dateEnd, setDateEnd] = useState<string>(getLocalToday());
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDIENTES' | 'ARRIBADOS'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  const fetchDataForRange = async () => {
    setLoading(true);
    try {
      const cajas = dateStart === dateEnd 
        ? await asignacionCajaService.getAsignacionesByDate(dateStart)
        : await asignacionCajaService.getAsignacionesByDateRange(dateStart, dateEnd);
      
      cajas.sort((a, b) => {
        const tA = a.horaAsignacion || '00:00';
        const tB = b.horaAsignacion || '00:00';
        return tA < tB ? -1 : tA > tB ? 1 : 0;
      });
      setCajasDelDia(cajas);

      const initialComentarios: Record<string, string> = {};
      const initialDocks: Record<string, string> = {};
      cajas.forEach(c => {
        if (c.id && c.comentariosArribo) initialComentarios[c.id] = c.comentariosArribo;
        if (c.id && c.dockArribo) initialDocks[c.id] = c.dockArribo;
      });
      setComentarios(initialComentarios);
      setDocks(initialDocks);
    } catch (e: any) {
      console.error('Error fetching cajas:', e);
      alert('Error al consultar la base de datos. Verifique su red.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDataForRange();
  }, [dateStart, dateEnd]);

  useEffect(() => {
    setStatusFilter('ALL');
  }, [dateStart, dateEnd]);

  const getNow = (): string => {
    const now = new Date();
    return now.toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'America/Mexico_City'
    });
  };

  const handleRegistrarArribo = async (caja: AsignacionCajaModel) => {
    if (!caja.id) return;
    setSavingId(caja.id);
    try {
      const arribo = getNow();
      const comentariosArribo = (comentarios[caja.id] || '').slice(0, 50);
      const dockArribo = docks[caja.id] || '';
      await asignacionCajaService.updateAsignacion(caja.id, { arribo, comentariosArribo, dockArribo });

      setCajasDelDia(prev =>
        prev.map(c => c.id === caja.id ? { ...c, arribo, comentariosArribo, dockArribo } : c)
      );
    } catch (e: any) {
      console.error('Error registrando arribo:', e);
      alert('Error al guardar el arribo. Intente nuevamente.');
    } finally {
      setSavingId(null);
    }
  };

  const totalAll        = cajasDelDia.length;
  const totalArribados  = cajasDelDia.filter(c => !!c.arribo).length;
  const totalPendientes = totalAll - totalArribados;
  const sinArribo       = totalPendientes;

  const byText = !searchTerm.trim()
    ? cajasDelDia
    : cajasDelDia.filter(c =>
        (c.numeroCaja || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.placas || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.numeroOperacion || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.transportista || '').toLowerCase().includes(searchTerm.toLowerCase())
      );

  const filteredCajas = byText.filter(caja => {
    if (statusFilter === 'ARRIBADOS')  return !!caja.arribo;
    if (statusFilter === 'PENDIENTES') return !caja.arribo;
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col font-sans">
      <div className="bg-slate-900 border-b border-slate-800 p-4 sticky top-0 z-10 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/m/home')}
            className="p-2 -ml-2 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Truck className="text-amber-400" /> Registro de Arribo
            </h1>
            <p className="text-xs text-slate-400 font-mono mt-0.5">Hora real de llegada por caja</p>
          </div>
        </div>
      </div>

      <HandheldToolbar
        dateStart={dateStart} setDateStart={setDateStart}
        dateEnd={dateEnd} setDateEnd={setDateEnd}
        searchTerm={searchTerm} setSearchTerm={setSearchTerm}
      />

      {/* Segmented Control — Todos / Pendientes / Arribados */}
      {!loading && cajasDelDia.length > 0 && (
        <div className="px-4 pb-3 bg-slate-900 border-b border-slate-800">
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl p-1 gap-1">
            {/* Todos */}
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`flex-1 px-2 py-2 rounded-lg text-xs font-bold transition-all ${statusFilter === 'ALL' ? 'bg-amber-500 text-slate-900 shadow' : 'text-slate-400 hover:bg-slate-800'}`}
            >
              Todos ({totalAll})
            </button>

            {/* Pendientes */}
            <button
              onClick={() => setStatusFilter('PENDIENTES')}
              className={`flex-1 px-2 py-2 rounded-lg text-xs font-bold transition-all flex flex-col items-center leading-tight ${statusFilter === 'PENDIENTES' ? 'bg-amber-500 text-slate-900 shadow' : 'text-slate-400 hover:bg-slate-800'}`}
            >
              <span>PENDIENTES ({totalPendientes})</span>
              {sinArribo > 0 && (
                <span className={`text-[10px] font-semibold mt-0.5 ${statusFilter === 'PENDIENTES' ? 'text-amber-900/80' : 'text-slate-500'}`}>
                  sin arribo: {sinArribo}
                </span>
              )}
            </button>

            {/* Arribados */}
            <button
              onClick={() => setStatusFilter('ARRIBADOS')}
              className={`flex-1 px-2 py-2 rounded-lg text-xs font-bold transition-all flex flex-col items-center leading-tight ${statusFilter === 'ARRIBADOS' ? 'bg-amber-500 text-slate-900 shadow' : 'text-slate-400 hover:bg-slate-800'}`}
            >
              <span>ARRIBADOS ({totalArribados})</span>
              {totalArribados > 0 && (
                <span className={`text-[10px] font-semibold mt-0.5 ${statusFilter === 'ARRIBADOS' ? 'text-amber-900/80' : 'text-slate-500'}`}>
                  🟢 {totalArribados} cajas
                </span>
              )}
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-10">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <Loader2 className="animate-spin mb-4" size={32} />
            <p>Consultando cajas...</p>
          </div>
        ) : filteredCajas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/30 px-4">
            <Box size={48} className="mb-4 opacity-50" />
            <p className="font-medium text-lg text-slate-400">
              {statusFilter === 'ARRIBADOS' ? 'Sin Arribos Registrados' : statusFilter === 'PENDIENTES' ? 'Sin Pendientes' : 'Sin Movimientos'}
            </p>
            <p className="text-sm mt-1">
              {statusFilter === 'ARRIBADOS' ? 'Aún no se ha registrado ningún arribo en este rango.' : statusFilter === 'PENDIENTES' ? 'Todas las cajas ya tienen arribo registrado.' : 'No hay cajas asignadas para esta fecha.'}
            </p>
          </div>
        ) : (
          filteredCajas.map(caja => {
            const isSaving = savingId === caja.id;
            const yaRegistrado = !!caja.arribo;

            return (
              <div
                key={caja.id}
                className={`rounded-2xl border p-4 space-y-3 transition-all ${
                  yaRegistrado
                    ? 'bg-amber-950/20 border-amber-900/40'
                    : 'bg-slate-800/80 border-slate-700 shadow-md'
                }`}
              >
                {/* Caja Info */}
                <div className="flex items-start justify-between flex-wrap gap-2">
                  <div>
                    <div className="text-2xl font-black font-mono text-white tracking-widest flex items-center gap-3 flex-wrap">
                      <span className="text-blue-400">{caja.horaAsignacion || '--:--'}</span>
                      {caja.numeroOperacion && <span className="text-pink-400">{caja.numeroOperacion}</span>}
                      <span>{caja.numeroCaja}</span>
                    </div>
                    <div className="flex gap-2 mt-1.5">
                      <span className="bg-slate-700/50 text-slate-300 text-xs px-2.5 py-1 rounded-md border border-slate-600/50">
                        ECO {caja.placasTracto}
                      </span>
                      <span className="bg-amber-900/30 text-amber-500/90 text-xs px-2.5 py-1 rounded-md border border-amber-800/50 truncate max-w-[150px]">
                        {caja.nombreDriver}
                      </span>
                    </div>
                  </div>

                  {yaRegistrado && (
                    <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 px-3 py-1.5 rounded-full text-sm font-bold">
                      <Clock size={14} />
                      {caja.arribo}
                    </div>
                  )}
                </div>

                {/* Dock Selector */}
                <select
                  value={docks[caja.id!] ?? (caja.dockArribo || '')}
                  onChange={e => setDocks(prev => ({ ...prev, [caja.id!]: e.target.value }))}
                  disabled={isSaving}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30 transition-all appearance-none"
                >
                  <option value="">— Seleccionar Dock —</option>
                  {DOCK_OPTIONS.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                  <option value="RECHAZADO" className="text-red-400 font-bold">RECHAZADO</option>
                  <option value="DROP" className="text-red-400 font-bold">DROP</option>
                  <option value="NO SHOW" className="text-orange-400 font-bold">NO SHOW</option>
                </select>

                {/* Comment Textbox */}
                <input
                  type="text"
                  maxLength={50}
                  placeholder="Comentarios de arribo... (máx. 50 caracteres)"
                  value={comentarios[caja.id!] ?? (caja.comentariosArribo || '')}
                  onChange={e =>
                    setComentarios(prev => ({ ...prev, [caja.id!]: e.target.value }))
                  }
                  disabled={isSaving}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30 transition-all"
                />

                {/* Arribo Button */}
                <button
                  onClick={() => handleRegistrarArribo(caja)}
                  disabled={isSaving}
                  className={`w-full py-4 rounded-xl flex items-center justify-center gap-2 font-bold text-base transition-all active:scale-[0.98] ${
                    isSaving
                      ? 'bg-amber-600/40 text-amber-300 cursor-wait'
                      : yaRegistrado
                        ? 'bg-amber-900/30 border border-amber-700/50 text-amber-400 hover:bg-amber-800/40'
                        : 'bg-amber-500 hover:bg-amber-400 text-slate-900 shadow-[0_0_20px_rgba(245,158,11,0.25)]'
                  }`}
                >
                  {isSaving ? (
                    <><Loader2 size={18} className="animate-spin" /> Guardando...</>
                  ) : yaRegistrado ? (
                    <><CheckCircle size={18} /> Actualizar Arribo ({caja.arribo})</>
                  ) : (
                    <><Clock size={18} /> Registrar Arribo</>
                  )}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default HandheldArribo;
