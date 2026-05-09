import React, { useState, useEffect, useMemo } from 'react';
import { demandaCarga53Service } from '../services/demandaCarga53Service';
import { ventanaCarga53Service } from '../services/ventanaCarga53Service';
import { reservaVentana53Service } from '../services/reservaVentana53Service';
import { demandaAsignacionBridge } from '../services/demandaAsignacionBridge';
import { DemandaCarga53, DemandaItem53 } from '../types/demandaCarga53';
import { VentanaCarga53 } from '../types/ventanaCarga53';
import { ReservaVentana53, ReservaEstatus } from '../types/reservaVentana53';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';
import {
  Loader2, CalendarDays, Clock, Package, CheckCircle,
  AlertCircle, XCircle, Plus, X, Truck, ChevronDown, ChevronUp
} from 'lucide-react';

const RESERVA_COLORS: Record<ReservaEstatus, string> = {
  'Reservada': 'bg-amber-50 text-amber-700 border-amber-200',
  'Confirmada': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Rechazada': 'bg-red-50 text-red-600 border-red-200',
  'Cancelada': 'bg-slate-100 text-slate-500 border-slate-200',
  'Completada': 'bg-blue-50 text-blue-700 border-blue-200',
};

export const ReservaVentanas53: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.CONTROLLER;
  const email = user?.email || user?.username || 'sistema';
  const carrierName = user?.name || email;

  const [tab, setTab] = useState<'demandas' | 'mis-reservas'>('demandas');
  const [demandas, setDemandas] = useState<DemandaCarga53[]>([]);
  const [ventanas, setVentanas] = useState<VentanaCarga53[]>([]);
  const [reservas, setReservas] = useState<ReservaVentana53[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDemanda, setExpandedDemanda] = useState<string | null>(null);
  const [demandasItems, setDemandasItems] = useState<Record<string, DemandaItem53[]>>({});
  const [demandasReservas, setDemandasReservas] = useState<Record<string, ReservaVentana53[]>>({});

  // Modal nueva reserva
  const [showModal, setShowModal] = useState(false);
  const [activeDemanda, setActiveDemanda] = useState<DemandaCarga53 | null>(null);
  const [formVentanaId, setFormVentanaId] = useState('');
  const [formCajas, setFormCajas] = useState('');
  const [formNumeroCaja, setFormNumeroCaja] = useState('');
  const [formPlacas, setFormPlacas] = useState('');
  const [formEconomico, setFormEconomico] = useState('');
  const [formOperador, setFormOperador] = useState('');
  const [formTelefono, setFormTelefono] = useState('');
  const [formComentarios, setFormComentarios] = useState('');
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [bridgeSaving, setBridgeSaving] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [allDemandas, allVentanas, allReservas] = await Promise.all([
        demandaCarga53Service.getAllDemandas(),
        ventanaCarga53Service.getAllVentanas(),
        reservaVentana53Service.getAllReservas(),
      ]);
      // Carriers only see Confirmada / Enviada a carriers / En proceso de reserva
      const visibleDemandas = isAdmin
        ? allDemandas
        : allDemandas.filter(d => ['Confirmada', 'Enviada a carriers', 'En proceso de reserva'].includes(d.estatus));
      visibleDemandas.sort((a, b) => b.fechaDemanda.localeCompare(a.fechaDemanda));
      setDemandas(visibleDemandas);
      setVentanas(allVentanas);
      setReservas(allReservas);
    } finally { setLoading(false); }
  };

  const toggleDemanda = async (d: DemandaCarga53) => {
    if (expandedDemanda === d.id) { setExpandedDemanda(null); return; }
    setExpandedDemanda(d.id!);
    if (!demandasItems[d.id!]) {
      const [items, res] = await Promise.all([
        demandaCarga53Service.getItemsByDemanda(d.id!),
        reservaVentana53Service.getReservasByDemanda(d.id!),
      ]);
      setDemandasItems(prev => ({ ...prev, [d.id!]: items }));
      setDemandasReservas(prev => ({ ...prev, [d.id!]: res }));
    }
  };

  const getDemandasReservadasActivas = (demandaId: string) =>
    (demandasReservas[demandaId] || [])
      .filter(r => r.estatus === 'Reservada' || r.estatus === 'Confirmada')
      .reduce((s, r) => s + r.cajasReservadas, 0);

  const openReserva = (d: DemandaCarga53) => {
    setActiveDemanda(d);
    setFormVentanaId(''); setFormCajas(''); setFormNumeroCaja('');
    setFormPlacas(''); setFormEconomico(''); setFormOperador('');
    setFormTelefono(''); setFormComentarios(''); setModalError(null);
    setShowModal(true);
  };

  const ventanasDisponibles = useMemo(() =>
    ventanas.filter(v => v.estatus === 'Disponible' || v.estatus === 'Parcial'),
    [ventanas]
  );

  const selectedVentana = ventanas.find(v => v.id === formVentanaId);

  const handleCrearReserva = async () => {
    if (!activeDemanda || !formVentanaId) { setModalError('Selecciona una ventana.'); return; }
    const cajas = parseInt(formCajas, 10);
    if (!cajas || cajas <= 0) { setModalError('El número de cajas debe ser mayor a 0.'); return; }
    if (!selectedVentana) { setModalError('Ventana no encontrada.'); return; }
    const disponibles = selectedVentana.cajasDisponibles ?? (selectedVentana.capacidadCajas - (selectedVentana.cajasReservadas || 0));
    if (cajas > disponibles) { setModalError(`Solo hay ${disponibles} caja(s) disponibles.`); return; }
    const cajasPendientes = activeDemanda.totalCajasSolicitadas - getDemandasReservadasActivas(activeDemanda.id!);
    if (cajas > cajasPendientes) { setModalError(`Solo hay ${cajasPendientes} caja(s) pendientes en esta demanda.`); return; }

    setSaving(true); setModalError(null);
    try {
      await reservaVentana53Service.crearReservaConTransaccion({
        demandaId: activeDemanda.id!,
        ventanaId: formVentanaId,
        carrierId: email,
        carrierNombre: carrierName,
        fechaCarga: selectedVentana.fecha,
        horaInicio: selectedVentana.horaInicio,
        horaFin: selectedVentana.horaFin,
        cajasReservadas: cajas,
        numeroCaja: formNumeroCaja || undefined,
        placas: formPlacas || undefined,
        economico: formEconomico || undefined,
        operador: formOperador || undefined,
        telefonoOperador: formTelefono || undefined,
        comentarios: formComentarios || undefined,
        creadoPor: email,
        actualizadoPor: email,
      });
      setShowModal(false);
      await load();
      // Refresh expanded demanda data
      if (activeDemanda.id) {
        const [items, res] = await Promise.all([
          demandaCarga53Service.getItemsByDemanda(activeDemanda.id),
          reservaVentana53Service.getReservasByDemanda(activeDemanda.id),
        ]);
        setDemandasItems(prev => ({ ...prev, [activeDemanda.id!]: items }));
        setDemandasReservas(prev => ({ ...prev, [activeDemanda.id!]: res }));
      }
    } catch (e: any) { setModalError(e.message); }
    finally { setSaving(false); }
  };

  const handleConfirmarReserva = async (r: ReservaVentana53) => {
    if (!window.confirm('¿Confirmar esta reserva y generar registros en Asignación Diaria?')) return;
    setBridgeSaving(r.id!);
    try {
      await reservaVentana53Service.confirmarReserva(r.id!, email);
      // Bridge → asignacion_cajas
      const demanda = await demandaCarga53Service.getDemandaById(r.demandaId);
      const items = await demandaCarga53Service.getItemsByDemanda(r.demandaId);
      if (demanda) {
        const result = await demandaAsignacionBridge.generarAsignacionesDesdeReserva(r, demanda, items, email);
        alert(`✅ Reserva confirmada. ${result.creados} registro(s) generados en Asignación Diaria. ${result.omitidos > 0 ? `(${result.omitidos} ya existían)` : ''}`);
      }
      await load();
    } catch (e: any) { alert('Error: ' + e.message); }
    finally { setBridgeSaving(null); }
  };

  const handleCancelarReserva = async (r: ReservaVentana53) => {
    if (!window.confirm('¿Cancelar esta reserva? Se liberará la capacidad en la ventana.')) return;
    try {
      await reservaVentana53Service.cancelarReserva(r.id!, email, r.ventanaId, r.cajasReservadas);
      await load();
    } catch (e: any) { alert(e.message); }
  };

  const misReservas = reservas.filter(r => isAdmin || r.carrierId === email);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="p-3 bg-teal-100 rounded-xl">
          <Truck size={28} className="text-teal-600" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-800">Reserva de Ventanas de Carga 53'</h1>
          <p className="text-slate-500 text-sm">Portal de reservas para carriers</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        <button onClick={() => setTab('demandas')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${tab === 'demandas' ? 'bg-white shadow-sm text-teal-700' : 'text-slate-500 hover:text-slate-700'}`}>
          Demandas Disponibles
        </button>
        <button onClick={() => setTab('mis-reservas')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${tab === 'mis-reservas' ? 'bg-white shadow-sm text-teal-700' : 'text-slate-500 hover:text-slate-700'}`}>
          {isAdmin ? 'Todas las Reservas' : 'Mis Reservas'}
          {misReservas.filter(r => r.estatus === 'Reservada').length > 0 && (
            <span className="ml-1.5 bg-amber-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">
              {misReservas.filter(r => r.estatus === 'Reservada').length}
            </span>
          )}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={32} className="animate-spin text-teal-400" /></div>
      ) : (
        <>
          {/* DEMANDAS TAB */}
          {tab === 'demandas' && (
            <div className="space-y-3">
              {demandas.length === 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center space-y-2">
                  <p className="text-amber-700 font-bold">No hay demandas disponibles para reservar</p>
                  {isAdmin && <p className="text-amber-600 text-sm">Crea una demanda en el módulo "Demanda Cajas 53'" y confírmala para que aparezca aquí.</p>}
                  {!isAdmin && <p className="text-amber-600 text-sm">Las demandas deben estar en estatus <strong>Confirmada</strong> o <strong>Enviada a carriers</strong> para poder reservar.</p>}
                </div>
              )}
              {demandas.map(d => {
                const reservadasActivas = getDemandasReservadasActivas(d.id!);
                const pendientes = d.totalCajasSolicitadas - reservadasActivas;
                return (
                  <div key={d.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-slate-50/60" onClick={() => toggleDemanda(d)}>
                      <div className="flex-1 grid grid-cols-2 sm:grid-cols-5 gap-3 items-center">
                        <span className="font-mono font-bold text-slate-800">{d.fechaDemanda}</span>
                        <div>
                          <p className="text-xs text-slate-400">Cajas Solicitadas</p>
                          <p className="font-black text-slate-800">{d.totalCajasSolicitadas}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">Reservadas</p>
                          <p className="font-black text-amber-600">{reservadasActivas}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">Pendientes</p>
                          <p className={`font-black ${pendientes > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>{pendientes}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {pendientes > 0 ? (
                            <button onClick={e => { e.stopPropagation(); openReserva(d); }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm">
                              <Plus size={13} /> Reservar
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">Sin espacio</span>
                          )}
                        </div>
                      </div>
                      {expandedDemanda === d.id ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                    </div>

                    {/* Expanded */}
                    {expandedDemanda === d.id && (
                      <div className="border-t border-slate-100 bg-slate-50 px-6 py-4 space-y-4">
                        {/* Items */}
                        {demandasItems[d.id] && (
                          <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Productos</p>
                            <div className="flex flex-wrap gap-2">
                              {demandasItems[d.id].map(item => (
                                <span key={item.id} className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs">
                                  <Package size={12} className="text-slate-400" />
                                  <span className="font-bold">{item.modelo}</span>
                                  <span className="text-slate-400">· {item.cantidadDemandada} uds · {item.cajasSolicitadas} cajas</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* Reservas de esta demanda */}
                        {demandasReservas[d.id] && demandasReservas[d.id].length > 0 && (
                          <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Reservas</p>
                            <div className="space-y-2">
                              {demandasReservas[d.id].map(r => (
                                <div key={r.id} className="flex items-center gap-3 bg-white rounded-xl border border-slate-100 px-4 py-2.5 text-sm">
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${RESERVA_COLORS[r.estatus]}`}>{r.estatus}</span>
                                  <span className="text-slate-600">{r.carrierNombre}</span>
                                  <span className="font-bold text-teal-700">{r.cajasReservadas} cajas</span>
                                  <span className="text-slate-400 flex items-center gap-1"><Clock size={12}/> {r.horaInicio}–{r.horaFin}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* RESERVAS TAB */}
          {tab === 'mis-reservas' && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              {misReservas.length === 0 && (
                <div className="text-center py-16 text-slate-300">Sin reservas registradas</div>
              )}
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-500 uppercase tracking-widest">
                    <th className="px-5 py-3 text-left">Fecha Carga</th>
                    <th className="px-5 py-3 text-left">Horario</th>
                    <th className="px-5 py-3 text-left">Carrier</th>
                    <th className="px-5 py-3 text-center">Cajas</th>
                    <th className="px-5 py-3 text-left">Unidad/Placas</th>
                    <th className="px-5 py-3 text-center">Estatus</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {misReservas.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3 font-mono font-bold text-slate-700">{r.fechaCarga}</td>
                      <td className="px-5 py-3 text-sm text-slate-600">{r.horaInicio}–{r.horaFin}</td>
                      <td className="px-5 py-3 text-sm text-slate-600">{r.carrierNombre}</td>
                      <td className="px-5 py-3 text-center font-black text-teal-700">{r.cajasReservadas}</td>
                      <td className="px-5 py-3 text-xs text-slate-500 font-mono">
                        {r.numeroCaja || '—'} {r.placas ? `· ${r.placas}` : ''}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${RESERVA_COLORS[r.estatus]}`}>
                          {r.estatus}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          {isAdmin && r.estatus === 'Reservada' && (
                            <button onClick={() => handleConfirmarReserva(r)} disabled={bridgeSaving === r.id}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50">
                              {bridgeSaving === r.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                              Confirmar
                            </button>
                          )}
                          {r.estatus === 'Reservada' && (
                            <button onClick={() => handleCancelarReserva(r)}
                              className="px-3 py-1.5 text-red-500 border border-red-100 hover:bg-red-50 text-xs font-bold rounded-lg transition-colors">
                              Cancelar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Modal Nueva Reserva */}
      {showModal && activeDemanda && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-lg font-black text-slate-800">Nueva Reserva</h2>
              <button onClick={() => setShowModal(false)}><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
              {modalError && (
                <div className="bg-red-50 text-red-600 text-sm rounded-lg px-4 py-2 border border-red-100 flex items-center gap-2">
                  <AlertCircle size={14} /> {modalError}
                </div>
              )}
              <div className="bg-blue-50 rounded-xl px-4 py-3 text-sm">
                <p className="font-bold text-blue-700">Demanda: {activeDemanda.fechaDemanda}</p>
                <p className="text-blue-600">{activeDemanda.totalCajasSolicitadas} cajas solicitadas · {getDemandasReservadasActivas(activeDemanda.id!)} reservadas · <span className="font-bold">{activeDemanda.totalCajasSolicitadas - getDemandasReservadasActivas(activeDemanda.id!)} pendientes</span></p>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Ventana de Carga *</label>
                <select value={formVentanaId} onChange={e => setFormVentanaId(e.target.value)}
                  className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-400 outline-none">
                  <option value="">-- Seleccionar ventana --</option>
                  {ventanasDisponibles.length === 0 && (
                    <option disabled value="">⚠ No hay ventanas disponibles — crea una en Admin Ventanas 53'</option>
                  )}
                  {ventanasDisponibles.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.fecha} · {v.horaInicio}–{v.horaFin} · {v.cajasDisponibles ?? (v.capacidadCajas - (v.cajasReservadas || 0))} disp.
                    </option>
                  ))}
                </select>
                {ventanasDisponibles.length === 0 && (
                  <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle size={12} /> No hay ventanas con estatus "Disponible" o "Parcial". Ve a <strong>Admin Ventanas 53'</strong> y crea una.
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Cajas a Reservar *</label>
                <input type="number" min="1" value={formCajas} onChange={e => setFormCajas(e.target.value)}
                  className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-teal-400 outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">No. Caja / Trailer</label>
                  <input value={formNumeroCaja} onChange={e => setFormNumeroCaja(e.target.value)} placeholder="PENDIENTE"
                    className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-400 outline-none" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Placas</label>
                  <input value={formPlacas} onChange={e => setFormPlacas(e.target.value)} placeholder="Opcional"
                    className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-400 outline-none" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Económico</label>
                  <input value={formEconomico} onChange={e => setFormEconomico(e.target.value)} placeholder="Opcional"
                    className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-400 outline-none" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Operador</label>
                  <input value={formOperador} onChange={e => setFormOperador(e.target.value)} placeholder="Nombre"
                    className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-400 outline-none" />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Comentarios</label>
                <textarea value={formComentarios} onChange={e => setFormComentarios(e.target.value)} rows={2}
                  className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-400 outline-none resize-none" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium">Cancelar</button>
              <button onClick={handleCrearReserva} disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-bold rounded-lg text-sm shadow-sm transition-colors">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                Confirmar Reserva
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
