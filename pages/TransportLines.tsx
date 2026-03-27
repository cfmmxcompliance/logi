import React, { useState, useEffect, useMemo } from 'react';
import { transportLineService } from '../services/transportLineService';
import { carrierService } from '../services/carrierService';
import { TransportLineModel } from '../types/transportLine';
import { CarrierModel } from '../types/carrier';
import { Plus, Edit2, Trash2, Truck, Search, Filter } from 'lucide-react';
import { CatalogQueryBuilder, QueryCondition, evaluateCondition } from '../components/CatalogQueryBuilder';

export const TransportLines: React.FC = () => {
  const [lines, setLines] = useState<TransportLineModel[]>([]);
  const [carriers, setCarriers] = useState<CarrierModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<Partial<TransportLineModel>>({});
  const [isEditing, setIsEditing] = useState(false);

  // Search & Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const [isMassQueryOpen, setIsMassQueryOpen] = useState(false);
  const [queryConditions, setQueryConditions] = useState<QueryCondition[]>([
      { id: '1', column: 'transportLineId', operator: 'in', type: 'string', input: '' }
  ]);
  const [activeMassQuery, setActiveMassQuery] = useState<QueryCondition[] | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [linesData, carriersData] = await Promise.all([
        transportLineService.getAllTransportLines(),
        carrierService.getAllCarriers()
    ]);
    setLines(linesData);
    setCarriers(carriersData);
    setLoading(false);
  };

  const getCarrierName = (code: string) => carriers.find(c => c.codigo === code)?.nombre || code;

  const filteredLines = useMemo(() => {
      let result = lines;
      if (searchTerm) {
          const lowerTerm = searchTerm.toLowerCase();
          result = result.filter(c => 
              c.transportLineId.toLowerCase().includes(lowerTerm) || 
              c.TransportLine.toLowerCase().includes(lowerTerm) ||
              c.razonSocial.toLowerCase().includes(lowerTerm) ||
              c.carrierCodigo.toLowerCase().includes(lowerTerm) ||
              (c.nombreSubLinea && c.nombreSubLinea.toLowerCase().includes(lowerTerm))
          );
      }
      if (activeMassQuery && activeMassQuery.length > 0) {
          result = result.filter(c => {
             return activeMassQuery.every(cond => {
                 const targetVal = c[cond.column as keyof TransportLineModel];
                 return evaluateCondition(targetVal, cond);
             });
          });
      }
      return result;
  }, [lines, searchTerm, activeMassQuery]);

  const handleApplyMassQuery = () => {
      const valid = queryConditions.filter(c => c.operator === 'empty' || c.operator === 'not_empty' || c.input.trim());
      setActiveMassQuery(valid.length > 0 ? valid : null);
      setIsMassQueryOpen(false);
  };

  const handleClearMassQuery = () => {
      setActiveMassQuery(null);
      setQueryConditions([{ id: Math.random().toString(), column: 'transportLineId', operator: 'in', type: 'string', input: '' }]);
      setIsMassQueryOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.transportLineId || !formData.carrierCodigo || !formData.TransportLine || !formData.razonSocial) return;

    if (isEditing) {
      await transportLineService.updateTransportLine(formData.transportLineId, formData);
    } else {
      await transportLineService.addTransportLine(formData as TransportLineModel);
    }
    setShowModal(false);
    loadData();
  };

  const handleDelete = async (id: string) => {
    if (confirm("¿Seguro que deseas eliminar el proveedor de transporte?")) {
      await transportLineService.deleteTransportLine(id);
      loadData();
    }
  };

  const openEdit = (line: TransportLineModel) => {
    setFormData(line);
    setIsEditing(true);
    setShowModal(true);
  };

  const openNew = () => {
    setFormData({ carrierCodigo: carriers[0]?.codigo || '' });
    setIsEditing(false);
    setShowModal(true);
  };


  return (
    <div className="p-6 max-w-6xl mx-auto animate-fade-in relative">
      <div className="flex justify-between items-center mb-6">
        <div>
           <h1 className="text-2xl font-bold text-slate-800">Líneas de Transporte Terrestre</h1>
           <p className="text-slate-500 text-sm mt-1">Administra sub-proveedores asociados a los Carriers.</p>
        </div>
        
        <div className="flex items-center gap-3">
             <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                    type="text" 
                    placeholder="Buscar Línea..." 
                    value={searchTerm} 
                    onChange={e => setSearchTerm(e.target.value)}
                    className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-64 shadow-sm"
                />
             </div>
             <button 
                 onClick={() => setIsMassQueryOpen(true)} 
                 className={`px-4 py-2 flex items-center rounded-lg border text-sm font-medium transition-colors shadow-sm ${activeMassQuery ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}
             >
                 <Filter size={16} className="mr-2" />
                 {activeMassQuery ? `Filtros (${activeMassQuery.length})` : 'Mass Query'}
             </button>
             <button onClick={openNew} className="bg-indigo-600 text-white px-4 py-2 flex items-center rounded-lg hover:bg-indigo-700 shadow-md shadow-indigo-500/30 transition-all font-medium text-sm">
                <Plus size={18} className="mr-2" /> Agregar Línea
             </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs uppercase tracking-wider">
            <tr>
              <th className="p-4 font-medium">Línea ID (Key)</th>
              <th className="p-4 font-medium">Carrier Padre</th>
              <th className="p-4 font-medium">Nombre Sub-Línea</th>
              <th className="p-4 font-medium">Razón Social</th>
              <th className="p-4 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {filteredLines.map(c => (
              <tr key={c.transportLineId} className="hover:bg-slate-50 transition-colors">
                <td className="p-4 font-semibold text-slate-800 flex items-center gap-2">
                    <Truck size={14} className="text-slate-400" />
                    {c.transportLineId}
                </td>
                <td className="p-4">
                    <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-medium">
                        {getCarrierName(c.carrierCodigo)}
                    </span>
                </td>
                <td className="p-4 font-medium text-slate-700">{c.TransportLine}</td>
                <td className="p-4 text-indigo-600 font-medium">{c.nombreSubLinea || '-'}</td>
                <td className="p-4 text-slate-500">{c.razonSocial}</td>
                <td className="p-4 flex gap-2 justify-end">
                  <button onClick={() => openEdit(c)} className="p-1.5 text-indigo-600 hover:bg-indigo-100 rounded transition-colors" title="Editar">
                    <Edit2 size={16} />
                  </button>
                  <button onClick={() => handleDelete(c.transportLineId)} className="p-1.5 text-red-600 hover:bg-red-100 rounded transition-colors" title="Eliminar">
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {filteredLines.length === 0 && !loading && (
              <tr><td colSpan={5} className="p-12 text-center text-slate-400">No hay líneas que coincidan.</td></tr>
            )}
            {loading && <tr><td colSpan={5} className="p-12 text-center text-slate-400">Cargando base de datos...</td></tr>}
          </tbody>
        </table>
      </div>

      <CatalogQueryBuilder 
          isOpen={isMassQueryOpen}
          onClose={() => setIsMassQueryOpen(false)}
          columns={['transportLineId', 'carrierCodigo', 'TransportLine', 'razonSocial']}
          conditions={queryConditions}
          setConditions={setQueryConditions}
          onApply={handleApplyMassQuery}
          onClear={handleClearMassQuery}
      />

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[110]">
          <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-md">
            <h2 className="text-xl font-bold mb-6 text-slate-800">{isEditing ? 'Editar Transport Line' : 'Nueva Línea'}</h2>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">ID Único (Ej. TL-001)</label>
                <input required disabled={isEditing} value={formData.transportLineId || ''} onChange={e => setFormData({...formData, transportLineId: e.target.value.toUpperCase()})} className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-slate-100" placeholder="Ej. APL-001" />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Carrier Principal (Asociación)</label>
                <select required value={formData.carrierCodigo || ''} onChange={e => setFormData({...formData, carrierCodigo: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 outline-none bg-white">
                    <option value="" disabled>Selecciona el Carrier matriz...</option>
                    {carriers.map(car => (
                        <option key={car.codigo} value={car.codigo}>{car.codigo} - {car.nombre}</option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre Comercial de la Línea</label>
                <input required value={formData.TransportLine || ''} onChange={e => setFormData({...formData, TransportLine: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Ej. APL Logistics" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre Sub-Línea</label>
                <input 
                    value={formData.nombreSubLinea || ''} 
                    onChange={e => setFormData({...formData, nombreSubLinea: e.target.value.toUpperCase()})} 
                    className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-500 uppercase" 
                    placeholder="Ej. DIVISION REEFER" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Razón Social</label>
                <input required value={formData.razonSocial || ''} onChange={e => setFormData({...formData, razonSocial: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Ej. Empresa SA de CV" />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2.5 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
                <button type="submit" className="px-5 py-2.5 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 shadow-lg shadow-indigo-500/30 transition-all">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
