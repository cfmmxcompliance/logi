import React, { useState, useEffect } from 'react';
import { ventanaCarga53Service } from '../services/ventanaCarga53Service';
import { VentanaCarga53, VentanaEstatus } from '../types/ventanaCarga53';
import { useAuth } from '../context/AuthContext';
import {
  Loader2, Plus, CalendarDays, Clock, Package, CheckCircle,
  AlertCircle, XCircle, Minus, Edit2, X
} from 'lucide-react';

const ESTATUS_COLORS: Record<VentanaEstatus, string> = {
  Disponible: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Parcial: 'bg-amber-50 text-amber-700 border-amber-200',
  Llena: 'bg-red-50 text-red-600 border-red-200',
  Cerrada: 'bg-slate-100 text-slate-500 border-slate-200',
  Cancelada: 'bg-slate-100 text-slate-400 border-slate-200',
};

const ESTATUS_ICON: Record<VentanaEstatus, React.ReactNode> = {
  Disponible: <CheckCircle size={12} />,
  Parcial: <AlertCircle size={12} />,
  Llena: <XCircle size={12} />,
  Cerrada: <Minus size={12} />,
  Cancelada: <XCircle size={12} />,
};

const emptyForm = (): Omit<VentanaCarga53, 'id' | 'cajasReservadas' | 'cajasDisponibles'> => ({
  fecha: new Date().toISOString().split('T')[0],
  horaInicio: '08:00',
  horaFin: '10:00',
  capacidadCajas: 5,
  modelo: '',
  estatus: 'Disponible',
  creadoPor: '',
  creadoEn: '',
  actualizadoPor: '',
  actualizadoEn: '',
});

export const AdminVentanas53: React.FC = () => {
  const { user } = useAuth();
  const [ventanas, setVentanas] = useState<VentanaCarga53[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterFecha, setFilterFecha] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await ventanaCarga53Service.getAllVentanas();
      data.sort((a, b) => (a.fecha + a.horaInicio).localeCompare(b.fecha + b.horaInicio));
      setVentanas(data);
    } finally {
      setLoading(false);
    }
  };

  const openNew = () => {
    setForm(emptyForm());
    setEditingId(null);
    setError(null);
    setShowModal(true);
  };

  const openEdit = (v: VentanaCarga53) => {
    setForm({
      fecha: v.fecha,
      horaInicio: v.horaInicio,
      horaFin: v.horaFin,
      capacidadCajas: v.capacidadCajas,
      modelo: (v as any).modelo || '',
      estatus: v.estatus,
      creadoPor: v.creadoPor,
      creadoEn: v.creadoEn,
      actualizadoPor: v.actualizadoPor,
      actualizadoEn: v.actualizadoEn,
    } as any);
    setEditingId(v.id!);
    setError(null);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.fecha || !form.horaInicio || !form.horaFin) {
      setError('Fecha, hora inicio y hora fin son requeridos.');
      return;
    }
    if (form.capacidadCajas <= 0) {
      setError('La capacidad debe ser mayor a cero.');
      return;
    }
    if (form.horaInicio >= form.horaFin) {
      setError('La hora de fin debe ser posterior a la hora de inicio.');
      return;
    }
    setError(null);
    setSaving(true);
    const now = new Date().toISOString();
    const email = user?.email || user?.username || 'sistema';

    try {
      if (editingId) {
        await ventanaCarga53Service.updateVentana(editingId, {
          ...form,
          actualizadoPor: email,
          actualizadoEn: now,
        });
      } else {
        await ventanaCarga53Service.createVentana({
          ...form,
          cajasReservadas: 0,
          cajasDisponibles: form.capacidadCajas,
          creadoPor: email,
          creadoEn: now,
          actualizadoPor: email,
          actualizadoEn: now,
        });
      }
      setShowModal(false);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const filtered = filterFecha
    ? ventanas.filter(v => v.fecha === filterFecha)
    : ventanas;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-violet-100 rounded-xl">
            <CalendarDays size={28} className="text-violet-600" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-800">Administración de Ventanas</h1>
            <p className="text-slate-500 text-sm">Ventanas de carga disponibles para carriers</p>
          </div>
        </div>
        <button
          onClick={openNew}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-xl shadow-md shadow-violet-200 transition-all text-sm"
        >
          <Plus size={18} /> Nueva Ventana
        </button>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-slate-600">Filtrar por fecha:</label>
        <input
          type="date"
          value={filterFecha}
          onChange={e => setFilterFecha(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-violet-400 outline-none"
        />
        {filterFecha && (
          <button onClick={() => setFilterFecha('')} className="text-xs text-slate-400 hover:text-slate-700 underline">
            Limpiar
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {(['Disponible', 'Parcial', 'Llena', 'Cerrada'] as VentanaEstatus[]).map(st => (
          <div key={st} className={`rounded-xl border px-4 py-3 text-center ${ESTATUS_COLORS[st]}`}>
            <p className="text-2xl font-black">{filtered.filter(v => v.estatus === st).length}</p>
            <p className="text-xs font-bold uppercase tracking-wide mt-0.5">{st}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={32} className="animate-spin text-violet-400" /></div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-500 uppercase tracking-widest">
                <th className="px-5 py-3 text-left">Fecha</th>
                <th className="px-5 py-3 text-left">Modelo</th>
                <th className="px-5 py-3 text-left">Horario</th>
                <th className="px-5 py-3 text-center">Capacidad</th>
                <th className="px-5 py-3 text-center">Reservadas</th>
                <th className="px-5 py-3 text-center">Disponibles</th>
                <th className="px-5 py-3 text-center">Estatus</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="text-center py-12 text-slate-300 text-sm">Sin ventanas registradas</td></tr>
              )}
              {filtered.map(v => (
                <tr key={v.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-5 py-3 font-mono text-sm font-bold text-slate-700">{v.fecha}</td>
                  <td className="px-5 py-3">
                    {(v as any).modelo
                      ? <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-full border border-indigo-100">{(v as any).modelo}</span>
                      : <span className="text-slate-300 text-xs">—</span>
                    }
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1 text-sm text-slate-600">
                      <Clock size={14} className="text-slate-400" />
                      {v.horaInicio} – {v.horaFin}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-center font-bold text-slate-800">{v.capacidadCajas}</td>
                  <td className="px-5 py-3 text-center font-bold text-amber-600">{v.cajasReservadas || 0}</td>
                  <td className="px-5 py-3 text-center font-bold text-emerald-600">{v.cajasDisponibles ?? (v.capacidadCajas - (v.cajasReservadas || 0))}</td>
                  <td className="px-5 py-3 text-center">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${ESTATUS_COLORS[v.estatus]}`}>
                      {ESTATUS_ICON[v.estatus]} {v.estatus}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => openEdit(v)}
                      className="p-1.5 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
                      title="Editar"
                    >
                      <Edit2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-lg font-black text-slate-800">
                {editingId ? 'Editar Ventana' : 'Nueva Ventana de Carga'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <X size={18} className="text-slate-500" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {error && (
                <div className="bg-red-50 text-red-600 text-sm rounded-lg px-4 py-2 border border-red-100 flex items-center gap-2">
                  <AlertCircle size={14} /> {error}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Modelo (opcional)</label>
                  <input value={(form as any).modelo || ''}
                    onChange={e => setForm(f => ({ ...f, modelo: e.target.value } as any))}
                    placeholder="Ej. NK300, CF800"
                    className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-400 outline-none" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Fecha</label>
                  <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
                    className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-400 outline-none" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Hora Inicio</label>
                  <input type="time" value={form.horaInicio} onChange={e => setForm(f => ({ ...f, horaInicio: e.target.value }))}
                    className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-400 outline-none" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Hora Fin</label>
                  <input type="time" value={form.horaFin} onChange={e => setForm(f => ({ ...f, horaFin: e.target.value }))}
                    className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-400 outline-none" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Capacidad de Cajas</label>
                  <input type="number" min="1" value={form.capacidadCajas}
                    onChange={e => setForm(f => ({ ...f, capacidadCajas: parseInt(e.target.value) || 0 }))}
                    className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-violet-400 outline-none" />
                </div>
                {editingId && (
                  <div className="col-span-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Estatus</label>
                    <select value={form.estatus} onChange={e => setForm(f => ({ ...f, estatus: e.target.value as VentanaEstatus }))}
                      className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-400 outline-none">
                      {(['Disponible', 'Parcial', 'Llena', 'Cerrada', 'Cancelada'] as VentanaEstatus[]).map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 text-white font-bold rounded-lg text-sm transition-colors shadow-sm">
                {saving ? <><Loader2 size={14} className="animate-spin" /> Guardando...</> : 'Guardar Ventana'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
