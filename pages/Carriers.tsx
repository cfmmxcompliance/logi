import React, { useState, useEffect, useMemo } from 'react';
import { carrierService } from '../services/carrierService';
import { CarrierModel } from '../types/carrier';
import { Plus, Edit2, Trash2, Search, Filter } from 'lucide-react';
import { CatalogQueryBuilder, QueryCondition, evaluateCondition } from '../components/CatalogQueryBuilder';

export const Carriers: React.FC = () => {
  const [carriers, setCarriers] = useState<CarrierModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<Partial<CarrierModel>>({});
  const [isEditing, setIsEditing] = useState(false);

  // Search & Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const [isMassQueryOpen, setIsMassQueryOpen] = useState(false);
  const [queryConditions, setQueryConditions] = useState<QueryCondition[]>([
      { id: '1', column: 'codigo', operator: 'in', type: 'string', input: '' }
  ]);
  const [activeMassQuery, setActiveMassQuery] = useState<QueryCondition[] | null>(null);

  useEffect(() => {
    loadCarriers();
  }, []);

  const loadCarriers = async () => {
    const data = await carrierService.getAllCarriers();
    setCarriers(data);
    setLoading(false);
  };

  const filteredCarriers = useMemo(() => {
      let result = carriers;
      if (searchTerm) {
          const terms = searchTerm.toLowerCase().split(/[\s,]+/).filter(t => t);
          result = result.filter(c => 
             terms.some(term =>
                c.codigo.toLowerCase().includes(term) || 
                c.nombre.toLowerCase().includes(term) ||
                c.razonSocial.toLowerCase().includes(term)
             )
          );
      }
      if (activeMassQuery && activeMassQuery.length > 0) {
          result = result.filter(c => {
             return activeMassQuery.every(cond => {
                 const targetVal = c[cond.column as keyof CarrierModel];
                 return evaluateCondition(targetVal, cond);
             });
          });
      }
      return result;
  }, [carriers, searchTerm, activeMassQuery]);

  const handleApplyMassQuery = () => {
      const valid = queryConditions.filter(c => c.operator === 'empty' || c.operator === 'not_empty' || c.input.trim());
      setActiveMassQuery(valid.length > 0 ? valid : null);
      setIsMassQueryOpen(false);
  };

  const handleClearMassQuery = () => {
      setActiveMassQuery(null);
      setQueryConditions([{ id: Math.random().toString(), column: 'codigo', operator: 'in', type: 'string', input: '' }]);
      setIsMassQueryOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.codigo || !formData.nombre || !formData.razonSocial) return;

    if (isEditing) {
      await carrierService.updateCarrier(formData.codigo, formData);
    } else {
      await carrierService.addCarrier(formData as CarrierModel);
    }
    setShowModal(false);
    loadCarriers();
  };

  const handleDelete = async (codigo: string) => {
    if (confirm("Are you sure you want to delete this carrier?")) {
      await carrierService.deleteCarrier(codigo);
      loadCarriers();
    }
  };

  const openEdit = (carrier: CarrierModel) => {
    setFormData(carrier);
    setIsEditing(true);
    setShowModal(true);
  };

  const openNew = () => {
    setFormData({});
    setIsEditing(false);
    setShowModal(true);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto animate-fade-in relative">
      <div className="flex justify-between items-center mb-6">
        <div>
           <h1 className="text-2xl font-bold text-slate-800">Catálogo de Transportistas (Carriers)</h1>
           <p className="text-slate-500 text-sm mt-1">Administra las líneas navieras o empresas madre de transporte.</p>
        </div>
        
        <div className="flex items-center gap-3">
             <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                    type="text" 
                    placeholder="Multibúsqueda (ej: EGLV, Evergreen)..." 
                    value={searchTerm} 
                    onChange={e => setSearchTerm(e.target.value)}
                    className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none w-72 shadow-sm"
                />
             </div>
             <button 
                 onClick={() => setIsMassQueryOpen(true)} 
                 className={`px-4 py-2 flex items-center rounded-lg border text-sm font-medium transition-colors shadow-sm ${activeMassQuery ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}
             >
                 <Filter size={16} className="mr-2" />
                 {activeMassQuery ? `Filtros (${activeMassQuery.length})` : 'Mass Query'}
             </button>
             <button onClick={openNew} className="bg-blue-600 text-white px-4 py-2 flex items-center rounded-lg hover:bg-blue-700 shadow-md shadow-blue-500/30 transition-all font-medium text-sm">
                <Plus size={18} className="mr-2" /> Agregar Carrier
             </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs uppercase tracking-wider">
            <tr>
              <th className="p-4 font-medium">Código</th>
              <th className="p-4 font-medium">Nombre / Alias</th>
              <th className="p-4 font-medium">Razón Social</th>
              <th className="p-4 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {filteredCarriers.map(c => (
              <tr key={c.codigo} className="hover:bg-slate-50 transition-colors">
                <td className="p-4 font-semibold text-blue-900">{c.codigo}</td>
                <td className="p-4 text-slate-700">{c.nombre}</td>
                <td className="p-4 text-slate-500">{c.razonSocial}</td>
                <td className="p-4 flex gap-2 justify-end">
                  <button onClick={() => openEdit(c)} className="p-1.5 text-blue-600 hover:bg-blue-100 rounded transition-colors" title="Editar">
                    <Edit2 size={16} />
                  </button>
                  <button onClick={() => handleDelete(c.codigo)} className="p-1.5 text-red-600 hover:bg-red-100 rounded transition-colors" title="Eliminar">
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {filteredCarriers.length === 0 && !loading && (
              <tr><td colSpan={4} className="p-12 text-center text-slate-400">No hay carriers registrados o no coinciden con la búsqueda.</td></tr>
            )}
            {loading && <tr><td colSpan={4} className="p-12 text-center text-slate-400">Cargando base de datos...</td></tr>}
          </tbody>
        </table>
      </div>

      <CatalogQueryBuilder 
          isOpen={isMassQueryOpen}
          onClose={() => setIsMassQueryOpen(false)}
          columns={['codigo', 'nombre', 'razonSocial']}
          conditions={queryConditions}
          setConditions={setQueryConditions}
          onApply={handleApplyMassQuery}
          onClear={handleClearMassQuery}
      />

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[110] animate-fade-in">
          <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-md transform scale-100 transition-transform">
            <h2 className="text-xl font-bold mb-6 text-slate-800">{isEditing ? 'Editar Carrier' : 'Nuevo Carrier'}</h2>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Código Único (KEY)</label>
                <input required disabled={isEditing} value={formData.codigo || ''} onChange={e => setFormData({...formData, codigo: e.target.value.toUpperCase()})} className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400" placeholder="Ej. EGLV" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre Comercial</label>
                <input required value={formData.nombre || ''} onChange={e => setFormData({...formData, nombre: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none" placeholder="Ej. Evergreen" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Razón Social Legal</label>
                <input required value={formData.razonSocial || ''} onChange={e => setFormData({...formData, razonSocial: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none" placeholder="Ej. Evergreen Marine Corp..." />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2.5 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
                <button type="submit" className="px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 shadow-lg shadow-blue-500/30 transition-all">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
