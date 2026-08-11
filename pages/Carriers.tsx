import React, { useState, useEffect, useMemo, useRef } from 'react';
import { carrierService } from '../services/carrierService';
import { CarrierModel } from '../types/carrier';
import { Plus, Edit2, Trash2, Search, Filter, Download, UploadCloud, FileSpreadsheet } from 'lucide-react';
import { CatalogQueryBuilder, QueryCondition, evaluateCondition } from '../components/CatalogQueryBuilder';
import { parseCSV } from '../utils/csvHelpers';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/useAuth';
import { UserRole } from '../types';

export const Carriers: React.FC = () => {
  const { user } = useAuth();
  const scacFilter = user?.role === UserRole.CARRIER ? (user?.scac || '').trim().toUpperCase() : null;
  const [carriers, setCarriers] = useState<CarrierModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<Partial<CarrierModel>>({});
  const [isEditing, setIsEditing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Search & Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const { t } = useLanguage();
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
      // CARRIER role: only show their own SCAC record
      if (scacFilter) {
          result = result.filter(c => c.codigo?.toUpperCase() === scacFilter);
      }
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
  }, [carriers, searchTerm, activeMassQuery, scacFilter]);

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
    if (confirm(t('msg.confirm_delete_carrier'))) {
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

  const exportCSV = () => {
      const headers = ["CÓDIGO (SCAC)", "NOMBRE COMERCIAL", "RAZÓN SOCIAL LEGAL"];
      const rows = filteredCarriers.map(c => [
          c.codigo,
          c.nombre,
          c.razonSocial
      ]);
      const csvContent = [headers, ...rows].map(e => e.map(item => `"${(item || '').replace(/"/g, '""')}"`).join(",")).join("\n");
      const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `carriers_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const downloadTemplate = () => {
      const headers = ["CÓDIGO (SCAC)", "NOMBRE COMERCIAL", "RAZÓN SOCIAL LEGAL"];
      const example = ["EGLV", "Evergreen", "Evergreen Marine Corp."];
      const csvContent = [headers, example].map(e => e.join(",")).join("\n");
      const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", "plantilla_carriers.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (e) => {
          const text = e.target?.result as string;
          const rows = parseCSV(text);
          if (rows.length < 2) return alert(t('msg.empty_file'));

          const headers = rows[0].map(h => h.trim().toUpperCase());
          const cIdx = headers.findIndex(h => h.includes('CÓDIGO') || h.includes('SCAC'));
          const nIdx = headers.findIndex(h => h.includes('NOMBRE'));
          const rIdx = headers.findIndex(h => h.includes('RAZÓN'));

          if (cIdx === -1 || nIdx === -1 || rIdx === -1) {
              return alert(t('msg.invalid_structure'));
          }

          setLoading(true);
          let imported = 0;
          for (let i = 1; i < rows.length; i++) {
              const r = rows[i];
              if (!r[cIdx]) continue;
              
              const carrier: CarrierModel = {
                  codigo: r[cIdx].trim().toUpperCase(),
                  nombre: r[nIdx]?.trim() || '',
                  razonSocial: r[rIdx]?.trim() || ''
              };

              try {
                  await carrierService.addCarrier(carrier);
                  imported++;
              } catch(err) {
                  console.error("Error importing row", r, err);
              }
          }
          if (fileInputRef.current) fileInputRef.current.value = '';
          alert(`${t('msg.import_done')} ${imported} ${t('msg.carriers_registered')}`);
          loadCarriers();
      };
      reader.readAsText(file);
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
                    placeholder={t('common.buscar')} 
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
                 {activeMassQuery ? `${t('btn.mass')} (${activeMassQuery.length})` : t('btn.mass')}
             </button>

             <button onClick={downloadTemplate} className="px-3 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg border border-slate-300 transition-colors shadow-sm flex items-center text-sm font-medium" title="Plantilla CSV">
                <FileSpreadsheet size={16} className="text-emerald-600" />
             </button>

             <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={handleFileUpload} />
             <button onClick={() => fileInputRef.current?.click()} className="px-3 py-2 bg-white text-slate-700 hover:bg-slate-50 rounded-lg border border-slate-300 transition-colors shadow-sm flex items-center text-sm font-medium" title="Subir CSV">
                <UploadCloud size={16} className="text-indigo-600" />
             </button>

             <button onClick={exportCSV} className="px-4 py-2 bg-white text-slate-700 hover:bg-slate-50 rounded-lg border border-slate-300 transition-colors shadow-sm flex items-center text-sm font-medium">
                <Download size={16} className="mr-2 text-slate-500" /> {t('btn.export')}
             </button>

             <button onClick={openNew} className="bg-blue-600 text-white px-4 py-2 flex items-center rounded-lg hover:bg-blue-700 shadow-md shadow-blue-500/30 transition-all font-medium text-sm">
                <Plus size={18} className="mr-2" /> {t('btn.new')}
             </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs uppercase tracking-wider">
            <tr>
              <th className="p-4 font-medium">{t('car.cod')}</th>
              <th className="p-4 font-medium">{t('car.nombre')}</th>
              <th className="p-4 font-medium">{t('car.razon')}</th>
              <th className="p-4 font-medium text-right">{t('btn.acciones')}</th>
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
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('car.cod')}</label>
                <input required disabled={isEditing} value={formData.codigo || ''} onChange={e => setFormData({...formData, codigo: e.target.value.toUpperCase()})} className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400" placeholder={t('car.form.cod')} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('car.nombre')}</label>
                <input required value={formData.nombre || ''} onChange={e => setFormData({...formData, nombre: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none" placeholder={t('car.form.nombre')} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('car.razon')}</label>
                <input required value={formData.razonSocial || ''} onChange={e => setFormData({...formData, razonSocial: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none" placeholder={t('car.form.razon')} />
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2.5 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors">{t('btn.cancelar')}</button>
                <button type="submit" className="px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 shadow-lg shadow-blue-500/30 transition-all">{t('btn.guardar')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
