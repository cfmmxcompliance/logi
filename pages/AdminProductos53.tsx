import React, { useState, useEffect } from 'react';
import { productosService, Producto } from '../services/productosService';
import { useAuth } from '../context/useAuth';
import { Loader2, Save, CheckCircle, AlertCircle, Package } from 'lucide-react';

export const AdminProductos53: React.FC = () => {
  const { user } = useAuth();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProductos();
  }, []);

  const loadProductos = async () => {
    setLoading(true);
    try {
      const data = await productosService.getAllProductos();
      setProductos(data);
      const vals: Record<string, string> = {};
      data.forEach(p => {
        vals[p.id] = p.unidadesPorCaja53 != null ? String(p.unidadesPorCaja53) : '';
      });
      setEditValues(vals);
    } catch (e: any) {
      setError('Error al cargar productos: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (producto: Producto) => {
    const raw = editValues[producto.id];
    const val = parseInt(raw, 10);
    if (!raw || isNaN(val) || val <= 0) {
      setError(`El valor de "${producto.modelo}" debe ser un número mayor a 0.`);
      return;
    }
    setError(null);
    setSaving(prev => ({ ...prev, [producto.id]: true }));
    try {
      await productosService.updateUnidadesPorCaja(producto.id, val);
      setProductos(prev =>
        prev.map(p => p.id === producto.id ? { ...p, unidadesPorCaja53: val } : p)
      );
      setSaved(prev => ({ ...prev, [producto.id]: true }));
      setTimeout(() => setSaved(prev => ({ ...prev, [producto.id]: false })), 2500);
    } catch (e: any) {
      setError('Error al guardar: ' + e.message);
    } finally {
      setSaving(prev => ({ ...prev, [producto.id]: false }));
    }
  };

  const isConfigured = (p: Producto) =>
    p.unidadesPorCaja53 != null && p.unidadesPorCaja53 > 0;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="p-3 bg-indigo-100 rounded-xl">
          <Package size={28} className="text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-800">Administración de Productos</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Configura las unidades por caja 53' (acomodo) para cada producto.
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-medium">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-indigo-400" />
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Modelo</th>
                <th className="text-left px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Estilo (ID)</th>
                <th className="text-center px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">
                  Unidades por Caja 53'<br /><span className="normal-case font-normal text-slate-400">(Acomodo)</span>
                </th>
                <th className="text-center px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Estado</th>
                <th className="px-6 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {productos.map(p => (
                <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-bold text-slate-800">{p.modelo}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-mono text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">{p.estilo}</span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <input
                      type="number"
                      min="1"
                      value={editValues[p.id] ?? ''}
                      onChange={e => setEditValues(prev => ({ ...prev, [p.id]: e.target.value }))}
                      className="w-28 text-center border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono font-bold focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none transition-all"
                      placeholder="Ej. 32"
                    />
                  </td>
                  <td className="px-6 py-4 text-center">
                    {isConfigured(p) ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-full border border-emerald-200">
                        <CheckCircle size={12} />
                        Configurado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 text-xs font-bold rounded-full border border-amber-200">
                        <AlertCircle size={12} />
                        Pendiente
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleSave(p)}
                      disabled={saving[p.id]}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs font-bold rounded-lg transition-colors shadow-sm"
                    >
                      {saving[p.id] ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : saved[p.id] ? (
                        <><CheckCircle size={14} /> Guardado</>
                      ) : (
                        <><Save size={14} /> Guardar</>
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 text-xs text-slate-400">
            {productos.filter(isConfigured).length} de {productos.length} productos configurados
          </div>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700">
        <strong>Nota:</strong> Este valor determina cuántas unidades caben en una caja seca 53'. 
        Es usado por el sistema para calcular automáticamente el número de cajas requeridas al crear una demanda.
      </div>
    </div>
  );
};
