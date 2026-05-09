import React, { useState, useEffect, useMemo } from 'react';
import { demandaCarga53Service } from '../services/demandaCarga53Service';
import { productosService, Producto } from '../services/productosService';
import { DemandaCarga53, DemandaItem53, DemandaEstatus } from '../types/demandaCarga53';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';
import {
  Loader2, Plus, X, Trash2, CheckCircle, AlertCircle,
  ClipboardList, ChevronDown, ChevronUp, Edit2, Package
} from 'lucide-react';

const ESTATUS_COLORS: Record<DemandaEstatus, string> = {
  'Borrador': 'bg-slate-100 text-slate-600 border-slate-200',
  'Confirmada': 'bg-blue-50 text-blue-700 border-blue-200',
  'Enviada a carriers': 'bg-violet-50 text-violet-700 border-violet-200',
  'En proceso de reserva': 'bg-amber-50 text-amber-700 border-amber-200',
  'Completada': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Cancelada': 'bg-red-50 text-red-600 border-red-200',
};

export const DemandaCajas53: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.CONTROLLER;
  const email = user?.email || user?.username || 'sistema';

  const [demandas, setDemandas] = useState<DemandaCarga53[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingDemanda, setEditingDemanda] = useState<DemandaCarga53 | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Record<string, DemandaItem53[]>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formFecha, setFormFecha] = useState(new Date().toISOString().split('T')[0]);
  const [formObs, setFormObs] = useState('');
  const [formItems, setFormItems] = useState<Omit<DemandaItem53, 'id'>[]>([]);
  const [selectedProductoId, setSelectedProductoId] = useState('');
  const [cantidadInput, setCantidadInput] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [d, p] = await Promise.all([
        demandaCarga53Service.getAllDemandas(),
        productosService.getAllProductos(),
      ]);
      d.sort((a, b) => b.fechaDemanda.localeCompare(a.fechaDemanda));
      setDemandas(d);
      setProductos(p);
    } finally { setLoading(false); }
  };

  const openNew = () => {
    setEditingDemanda(null);
    setFormFecha(new Date().toISOString().split('T')[0]);
    setFormObs('');
    setFormItems([]);
    setSelectedProductoId('');
    setCantidadInput('');
    setError(null);
    setShowModal(true);
  };

  const addItem = () => {
    const producto = productos.find(p => p.id === selectedProductoId);
    if (!producto) { setError('Selecciona un producto.'); return; }
    if (!producto.unidadesPorCaja53 || producto.unidadesPorCaja53 <= 0) {
      setError(`"${producto.modelo}" no tiene configurado unidadesPorCaja53. Ve a Administración de Productos.`);
      return;
    }
    const cantidad = parseInt(cantidadInput, 10);
    if (!cantidad || cantidad <= 0) { setError('La cantidad debe ser mayor a 0.'); return; }
    setError(null);
    const cajas = Math.ceil(cantidad / producto.unidadesPorCaja53);
    setFormItems(prev => [...prev, {
      productoId: producto.id,
      estilo: producto.estilo,
      modelo: producto.modelo,
      cantidadDemandada: cantidad,
      unidadesPorCaja53: producto.unidadesPorCaja53!,
      cajasSolicitadas: cajas,
    }]);
    setSelectedProductoId('');
    setCantidadInput('');
  };

  const removeItem = (idx: number) => setFormItems(prev => prev.filter((_, i) => i !== idx));

  const totalUnidades = useMemo(() => formItems.reduce((s, i) => s + i.cantidadDemandada, 0), [formItems]);
  const totalCajas = useMemo(() => formItems.reduce((s, i) => s + i.cajasSolicitadas, 0), [formItems]);

  const handleSave = async (confirmar: boolean) => {
    if (!formFecha) { setError('Fecha requerida.'); return; }
    if (formItems.length === 0) { setError('Agrega al menos un producto.'); return; }
    if (confirmar && formItems.some(i => i.unidadesPorCaja53 <= 0)) {
      setError('Todos los productos deben tener unidadesPorCaja53 configurado.'); return;
    }
    setSaving(true); setError(null);
    const now = new Date().toISOString();
    try {
      const demandaData: Omit<DemandaCarga53, 'id'> = {
        fechaDemanda: formFecha,
        estatus: confirmar ? 'Confirmada' : 'Borrador',
        totalUnidadesDemandadas: totalUnidades,
        totalCajasSolicitadas: totalCajas,
        modelos: [...new Set(formItems.map(i => i.modelo))] as string[],
        observaciones: formObs,
        creadoPor: email,
        creadoEn: now,
        actualizadoPor: email,
        actualizadoEn: now,
        ...(confirmar ? { confirmadoPor: email, confirmadoEn: now } : {}),
      };
      const demandaId = await demandaCarga53Service.createDemanda(demandaData);
      for (const item of formItems) {
        await demandaCarga53Service.addItem(demandaId, item);
      }
      setShowModal(false);
      await load();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleConfirmar = async (d: DemandaCarga53) => {
    if (!window.confirm(`¿Confirmar la demanda del ${d.fechaDemanda}? Quedará visible para carriers.`)) return;
    try {
      await demandaCarga53Service.confirmarDemanda(d.id!, email);
      await load();
    } catch (e: any) { alert(e.message); }
  };

  const handleCancelar = async (d: DemandaCarga53) => {
    if (!window.confirm('¿Cancelar esta demanda? No se eliminará del historial.')) return;
    try {
      await demandaCarga53Service.cancelarDemanda(d.id!, email);
      await load();
    } catch (e: any) { alert(e.message); }
  };

  const toggleExpand = async (d: DemandaCarga53) => {
    if (expandedId === d.id) { setExpandedId(null); return; }
    setExpandedId(d.id!);
    if (!expandedItems[d.id!]) {
      const items = await demandaCarga53Service.getItemsByDemanda(d.id!);
      setExpandedItems(prev => ({ ...prev, [d.id!]: items }));
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-100 rounded-xl">
            <ClipboardList size={28} className="text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-800">Demanda de Cajas 53'</h1>
            <p className="text-slate-500 text-sm">Gestión de demanda y cálculo automático de cajas</p>
          </div>
        </div>
        {isAdmin && (
          <button onClick={openNew}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md shadow-blue-200 transition-all text-sm">
            <Plus size={18} /> Nueva Demanda
          </button>
        )}
      </div>

      {/* Summary cards */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {(['Borrador', 'Confirmada', 'En proceso de reserva', 'Completada'] as DemandaEstatus[]).map(st => (
            <div key={st} className={`rounded-xl border px-4 py-3 text-center ${ESTATUS_COLORS[st]}`}>
              <p className="text-2xl font-black">{demandas.filter(d => d.estatus === st).length}</p>
              <p className="text-[10px] font-bold uppercase tracking-wide mt-0.5">{st}</p>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={32} className="animate-spin text-blue-400" /></div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          {demandas.length === 0 && (
            <div className="text-center py-16 text-slate-300">No hay demandas registradas</div>
          )}
          {demandas.map(d => (
            <div key={d.id} className="border-b border-slate-50 last:border-0">
              <div className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50/50 cursor-pointer"
                onClick={() => toggleExpand(d)}>
                <div className="flex-1 grid grid-cols-2 sm:grid-cols-6 gap-3 items-center">
                  <span className="font-mono font-bold text-slate-800 text-sm">{d.fechaDemanda}</span>
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border w-fit ${ESTATUS_COLORS[d.estatus]}`}>
                    {d.estatus}
                  </span>
                  {/* Modelos column */}
                  <div className="flex flex-wrap gap-1">
                    {(d.modelos && d.modelos.length > 0)
                      ? d.modelos.map(m => (
                          <span key={m} className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-full border border-indigo-100">{m}</span>
                        ))
                      : <span className="text-xs text-slate-300">—</span>
                    }
                  </div>
                  <span className="text-slate-600 text-sm"><span className="font-bold">{d.totalUnidadesDemandadas}</span> uds</span>
                  <span className="text-slate-600 text-sm"><span className="font-bold text-blue-700">{d.totalCajasSolicitadas}</span> cajas</span>
                  <span className="text-xs text-slate-400 truncate">{d.observaciones || '—'}</span>
                </div>
                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  {isAdmin && d.estatus === 'Borrador' && (
                    <button onClick={() => handleConfirmar(d)}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors">
                      Confirmar
                    </button>
                  )}
                  {isAdmin && !['Cancelada', 'Completada'].includes(d.estatus) && (
                    <button onClick={() => handleCancelar(d)}
                      className="px-3 py-1.5 text-red-500 hover:bg-red-50 text-xs font-bold rounded-lg transition-colors border border-red-100">
                      Cancelar
                    </button>
                  )}
                </div>
                {expandedId === d.id ? <ChevronUp size={16} className="text-slate-400 flex-shrink-0" /> : <ChevronDown size={16} className="text-slate-400 flex-shrink-0" />}
              </div>

              {/* Expanded items */}
              {expandedId === d.id && (
                <div className="bg-slate-50 px-8 py-4 border-t border-slate-100">
                  {!expandedItems[d.id] ? (
                    <Loader2 size={16} className="animate-spin text-slate-400" />
                  ) : expandedItems[d.id].length === 0 ? (
                    <p className="text-xs text-slate-400">Sin items</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-slate-500 uppercase tracking-wide">
                          <th className="text-left pb-2">Modelo</th>
                          <th className="text-left pb-2">Estilo</th>
                          <th className="text-right pb-2">Unidades</th>
                          <th className="text-right pb-2">Uds/Caja</th>
                          <th className="text-right pb-2">Cajas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {expandedItems[d.id].map(item => (
                          <tr key={item.id} className="border-t border-slate-100">
                            <td className="py-1.5 font-medium text-slate-700">{item.modelo}</td>
                            <td className="py-1.5 font-mono text-xs text-slate-500">{item.estilo}</td>
                            <td className="py-1.5 text-right font-bold">{item.cantidadDemandada}</td>
                            <td className="py-1.5 text-right text-slate-500">{item.unidadesPorCaja53}</td>
                            <td className="py-1.5 text-right font-black text-blue-700">{item.cajasSolicitadas}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-200">
                          <td colSpan={2} className="pt-2 text-xs font-bold text-slate-500 uppercase">Total</td>
                          <td className="pt-2 text-right font-black">{d.totalUnidadesDemandadas}</td>
                          <td></td>
                          <td className="pt-2 text-right font-black text-blue-700">{d.totalCajasSolicitadas}</td>
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal Nueva Demanda */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-lg font-black text-slate-800">Nueva Demanda de Cajas 53'</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <X size={18} className="text-slate-500" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
              {error && (
                <div className="bg-red-50 text-red-600 text-sm rounded-lg px-4 py-2 border border-red-100 flex items-center gap-2">
                  <AlertCircle size={14} /> {error}
                </div>
              )}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Fecha de Demanda</label>
                <input type="date" value={formFecha} onChange={e => setFormFecha(e.target.value)}
                  className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 outline-none" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Observaciones</label>
                <textarea value={formObs} onChange={e => setFormObs(e.target.value)} rows={2}
                  className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 outline-none resize-none"
                  placeholder="Notas adicionales..." />
              </div>

              {/* Add item */}
              <div className="border border-blue-100 bg-blue-50/50 rounded-xl p-4 space-y-3">
                <p className="text-xs font-bold text-blue-700 uppercase tracking-wide flex items-center gap-1.5">
                  <Package size={13} /> Agregar Producto
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-500">Producto</label>
                    <select value={selectedProductoId} onChange={e => setSelectedProductoId(e.target.value)}
                      className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 outline-none">
                      <option value="">-- Seleccionar --</option>
                      {productos.map(p => (
                        <option key={p.id} value={p.id} disabled={!p.unidadesPorCaja53}>
                          {p.modelo} {!p.unidadesPorCaja53 ? '⚠ sin configurar' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Cantidad de Unidades</label>
                    <input type="number" min="1" value={cantidadInput}
                      onChange={e => setCantidadInput(e.target.value)}
                      className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 outline-none"
                      placeholder="Ej. 120" />
                  </div>
                </div>
                {selectedProductoId && cantidadInput && (() => {
                  const p = productos.find(x => x.id === selectedProductoId);
                  const u = p?.unidadesPorCaja53;
                  const c = parseInt(cantidadInput, 10);
                  if (u && c > 0) {
                    const cajas = Math.ceil(c / u);
                    return (
                      <p className="text-xs text-blue-700 font-medium">
                        {c} ÷ {u} = {cajas} caja(s) requeridas
                      </p>
                    );
                  }
                  return null;
                })()}
                <button onClick={addItem}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors">
                  <Plus size={14} /> Agregar
                </button>
              </div>

              {/* Items list */}
              {formItems.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Items de la Demanda</p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-slate-400">
                        <th className="text-left pb-1">Modelo</th>
                        <th className="text-right pb-1">Unidades</th>
                        <th className="text-right pb-1">Uds/Caja</th>
                        <th className="text-right pb-1 text-blue-700">Cajas</th>
                        <th className="pb-1"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {formItems.map((item, idx) => (
                        <tr key={idx} className="border-t border-slate-50">
                          <td className="py-1.5 font-medium">{item.modelo}</td>
                          <td className="py-1.5 text-right">{item.cantidadDemandada}</td>
                          <td className="py-1.5 text-right text-slate-400">{item.unidadesPorCaja53}</td>
                          <td className="py-1.5 text-right font-black text-blue-700">{item.cajasSolicitadas}</td>
                          <td className="py-1.5 text-right">
                            <button onClick={() => removeItem(idx)} className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded">
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 font-black">
                        <td className="pt-2 text-slate-500 text-xs uppercase">Total</td>
                        <td className="pt-2 text-right">{totalUnidades}</td>
                        <td></td>
                        <td className="pt-2 text-right text-blue-700">{totalCajas}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium">
                Cancelar
              </button>
              <button onClick={() => handleSave(false)} disabled={saving || formItems.length === 0}
                className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 rounded-lg text-sm font-bold transition-colors">
                {saving ? <Loader2 size={14} className="animate-spin" /> : 'Guardar Borrador'}
              </button>
              <button onClick={() => handleSave(true)} disabled={saving || formItems.length === 0}
                className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold rounded-lg text-sm shadow-sm transition-colors">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <><CheckCircle size={14} /> Confirmar</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
