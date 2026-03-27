import React, { useState, useEffect, useMemo } from 'react';
import { driverService } from '../services/driverService';
import { carrierService } from '../services/carrierService';
import { DriverModel } from '../types/driver';
import { CarrierModel } from '../types/carrier';
import { Plus, Edit2, Trash2, User, Search, Filter } from 'lucide-react';
import { CatalogQueryBuilder, QueryCondition, evaluateCondition } from '../components/CatalogQueryBuilder';

export const Drivers: React.FC = () => {
  const [drivers, setDrivers] = useState<DriverModel[]>([]);
  const [carriers, setCarriers] = useState<CarrierModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<Partial<DriverModel>>({});
  const [isEditing, setIsEditing] = useState(false);

  // Search & Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const [isMassQueryOpen, setIsMassQueryOpen] = useState(false);
  const [queryConditions, setQueryConditions] = useState<QueryCondition[]>([
      { id: '1', column: 'driverId', operator: 'in', type: 'string', input: '' }
  ]);
  const [activeMassQuery, setActiveMassQuery] = useState<QueryCondition[] | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [driversData, carriersData] = await Promise.all([
        driverService.getAllDrivers(),
        carrierService.getAllCarriers()
    ]);
    setDrivers(driversData);
    setCarriers(carriersData);
    setLoading(false);
  };

  const getCarrierName = (code: string) => carriers.find(c => c.codigo === code)?.nombre || code;

  const filteredDrivers = useMemo(() => {
      let result = drivers;
      if (searchTerm) {
          const lowerTerm = searchTerm.toLowerCase();
          result = result.filter(c => 
              c.driverId.toLowerCase().includes(lowerTerm) || 
              c.nombre.toLowerCase().includes(lowerTerm) ||
              c.licencia.toLowerCase().includes(lowerTerm) ||
              (c.placasTracto && c.placasTracto.toLowerCase().includes(lowerTerm)) ||
              c.carrierCodigo.toLowerCase().includes(lowerTerm)
          );
      }
      if (activeMassQuery && activeMassQuery.length > 0) {
          result = result.filter(c => {
             return activeMassQuery.every(cond => {
                 const targetVal = c[cond.column as keyof DriverModel];
                 return evaluateCondition(targetVal, cond);
             });
          });
      }
      return result;
  }, [drivers, searchTerm, activeMassQuery]);

  const handleApplyMassQuery = () => {
      const valid = queryConditions.filter(c => c.operator === 'empty' || c.operator === 'not_empty' || c.input.trim());
      setActiveMassQuery(valid.length > 0 ? valid : null);
      setIsMassQueryOpen(false);
  };

  const handleClearMassQuery = () => {
      setActiveMassQuery(null);
      setQueryConditions([{ id: Math.random().toString(), column: 'driverId', operator: 'in', type: 'string', input: '' }]);
      setIsMassQueryOpen(false);
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.driverId || !formData.carrierCodigo || !formData.nombre || !formData.licencia) return;

    if (isEditing) {
      await driverService.updateDriver(formData.driverId, formData);
    } else {
      await driverService.addDriver(formData as DriverModel);
    }
    setShowModal(false);
    loadData();
  };

  const handleDelete = async (id: string) => {
    if (confirm("¿Seguro que deseas eliminar a este chófer?")) {
      await driverService.deleteDriver(id);
      loadData();
    }
  };

  const openEdit = (driver: DriverModel) => {
    setFormData(driver);
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
           <h1 className="text-2xl font-bold text-slate-800">Directorio de Choferes</h1>
           <p className="text-slate-500 text-sm mt-1">Gestión de operadores físicos asignados a los carriers.</p>
        </div>
        
        <div className="flex items-center gap-3">
             <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                    type="text" 
                    placeholder="Buscar Chofer..." 
                    value={searchTerm} 
                    onChange={e => setSearchTerm(e.target.value)}
                    className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none w-64 shadow-sm"
                />
             </div>
             <button 
                 onClick={() => setIsMassQueryOpen(true)} 
                 className={`px-4 py-2 flex items-center rounded-lg border text-sm font-medium transition-colors shadow-sm ${activeMassQuery ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}
             >
                 <Filter size={16} className="mr-2" />
                 {activeMassQuery ? `Filtros (${activeMassQuery.length})` : 'Mass Query'}
             </button>
             <button onClick={openNew} className="bg-teal-600 text-white px-4 py-2 flex items-center rounded-lg hover:bg-teal-700 shadow-md shadow-teal-500/30 transition-all font-medium text-sm">
                <Plus size={18} className="mr-2" /> Alta de Chofer
             </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs uppercase tracking-wider">
            <tr>
              <th className="p-4 font-medium">Nombre (Driver ID)</th>
              <th className="p-4 font-medium">Carrier Padre</th>
              <th className="p-4 font-medium">Licencia</th>
              <th className="p-4 font-medium">Teléfono</th>
              <th className="p-4 font-medium">Placas Tracto</th>
              <th className="p-4 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {filteredDrivers.map(c => (
              <tr key={c.driverId} className="hover:bg-slate-50 transition-colors">
                <td className="p-4 font-semibold text-slate-800 flex items-center gap-2">
                    <User size={14} className="text-slate-400" />
                    <div>
                        <div className="text-slate-800">{c.nombre}</div>
                        <div className="text-xs text-slate-400 font-normal">{c.driverId}</div>
                    </div>
                </td>
                <td className="p-4">
                    <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-medium">
                        {getCarrierName(c.carrierCodigo)}
                    </span>
                </td>
                <td className="p-4 font-medium text-slate-600">{c.licencia}</td>
                <td className="p-4 text-slate-500">{c.telefono}</td>
                <td className="p-4 text-slate-500">{c.placasTracto || '-'}</td>
                <td className="p-4 flex gap-2 justify-end items-center">
                  <button onClick={() => openEdit(c)} className="p-1.5 text-teal-600 hover:bg-teal-100 rounded transition-colors" title="Editar">
                    <Edit2 size={16} />
                  </button>
                  <button onClick={() => handleDelete(c.driverId)} className="p-1.5 text-red-600 hover:bg-red-100 rounded transition-colors" title="Eliminar">
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {filteredDrivers.length === 0 && !loading && (
              <tr><td colSpan={6} className="p-12 text-center text-slate-400">No hay choferes que coincidan.</td></tr>
            )}
            {loading && <tr><td colSpan={6} className="p-12 text-center text-slate-400">Cargando base de datos...</td></tr>}
          </tbody>
        </table>
      </div>

      <CatalogQueryBuilder 
          isOpen={isMassQueryOpen}
          onClose={() => setIsMassQueryOpen(false)}
          columns={['driverId', 'carrierCodigo', 'nombre', 'licencia', 'telefono', 'placasTracto']}
          conditions={queryConditions}
          setConditions={setQueryConditions}
          onApply={handleApplyMassQuery}
          onClear={handleClearMassQuery}
      />

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[110]">
          <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-lg">
            <h2 className="text-xl font-bold mb-6 text-slate-800">{isEditing ? 'Editar Chofer' : 'Registrar Nuevo Chofer'}</h2>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              
              <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Driver ID (Curp/RFC/etc)</label>
                    <input required disabled={isEditing} value={formData.driverId || ''} onChange={e => setFormData({...formData, driverId: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-teal-500 outline-none disabled:bg-slate-100" placeholder="ID único" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Carrier Principal</label>
                    <select required value={formData.carrierCodigo || ''} onChange={e => setFormData({...formData, carrierCodigo: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-teal-500 outline-none bg-white">
                        <option value="" disabled>Selecciona el Carrier...</option>
                        {carriers.map(car => (
                            <option key={car.codigo} value={car.codigo}>{car.codigo} - {car.nombre}</option>
                        ))}
                    </select>
                  </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre Completo</label>
                <input required value={formData.nombre || ''} onChange={e => setFormData({...formData, nombre: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-teal-500" placeholder="Ej. Juan Pérez" />
              </div>

              <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Licencia</label>
                    <input required value={formData.licencia || ''} onChange={e => setFormData({...formData, licencia: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-teal-500" placeholder="No. de Licencia" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
                    <input required value={formData.telefono || ''} onChange={e => setFormData({...formData, telefono: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-teal-500" placeholder="Tel o Celular" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Placas Tracto</label>
                    <input value={formData.placasTracto || ''} onChange={e => setFormData({...formData, placasTracto: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-teal-500" placeholder="ABC-123" />
                  </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2.5 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
                <button type="submit" className="px-5 py-2.5 bg-teal-600 text-white font-medium rounded-lg hover:bg-teal-700 shadow-lg shadow-teal-500/30 transition-all">Guardar Datos</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
