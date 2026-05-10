import React, { useState, useEffect, useMemo, useRef } from 'react';
import { transportLineService } from '../services/transportLineService';
import { carrierService } from '../services/carrierService';
import { TransportLineModel } from '../types/transportLine';
import { CarrierModel } from '../types/carrier';
import { Plus, Edit2, Trash2, Truck, Search, Filter, Download, UploadCloud, FileSpreadsheet } from 'lucide-react';
import { CatalogQueryBuilder, QueryCondition, evaluateCondition } from '../components/CatalogQueryBuilder';
import { SearchableComboBox, ComboOption } from '../components/SearchableComboBox';
import { parseCSV } from '../utils/csvHelpers';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';

export const TransportLines: React.FC = () => {
  const { user } = useAuth();
  const scacFilter = user?.role === UserRole.CARRIER ? (user?.scac || '').trim().toUpperCase() : null;
  const subLineaFilter = user?.role === UserRole.TRANSPORTISTA ? (user?.scac || '').trim().toUpperCase() : null;
  const [lines, setLines] = useState<TransportLineModel[]>([]);
  const [carriers, setCarriers] = useState<CarrierModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<Partial<TransportLineModel>>({});
  const [isEditing, setIsEditing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Search & Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const { t } = useLanguage();
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
      // CARRIER role: only show lines belonging to their SCAC
      if (scacFilter) {
          result = result.filter(c => c.carrierCodigo?.toUpperCase() === scacFilter);
      }
      // TRANSPORTISTA role: strictly filter by Nombre Comercial. If unconfigured → show nothing.
      if (user?.role === UserRole.TRANSPORTISTA) {
          if (!subLineaFilter) {
              result = [];
          } else {
              result = result.filter(c => (c.TransportLine || '').toLowerCase() === subLineaFilter.toLowerCase());
          }
      }
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
  }, [lines, searchTerm, activeMassQuery, scacFilter, subLineaFilter, user]);

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

  const exportCSV = () => {
      const headers = ["LÍNEA ID (KEY)", "CARRIER (SCAC)", "NOMBRE COMERCIAL", "NOMBRE SUB-LÍNEA", "RAZÓN SOCIAL", "LÍNEA MEXICANA"];
      const rows = filteredLines.map(c => [
          c.transportLineId,
          c.carrierCodigo,
          c.TransportLine,
          c.nombreSubLinea || '',
          c.razonSocial,
          c.lineaMexicana || ''
      ]);
      const csvContent = [headers, ...rows].map(e => e.map(item => `"${(item || '').replace(/"/g, '""')}"`).join(",")).join("\n");
      const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `transport_lines_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const downloadTemplate = () => {
      const headers = ["LÍNEA ID (KEY)", "CARRIER (SCAC)", "NOMBRE COMERCIAL", "NOMBRE SUB-LÍNEA", "RAZÓN SOCIAL", "LÍNEA MEXICANA"];
      const example = ["TL-001", "EGLV", "APL Logistics", "DIVISION REEFER", "Logistics SA de CV", "Transportes Mexicanos SA"];
      const csvContent = [headers, example].map(e => e.join(",")).join("\n");
      const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", "plantilla_transport_lines.csv");
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
          if (rows.length < 2) return alert("El archivo está vacío o no tiene datos válidos.");

          const headers = rows[0].map(h => h.trim().toUpperCase());
          const lIdx = headers.findIndex(h => h.includes('LÍNEA ID') || h.includes('KEY'));
          const cIdx = headers.findIndex(h => h.includes('CARRIER') || h.includes('SCAC'));
          const nIdx = headers.findIndex(h => h.includes('NOMBRE COMERCIAL'));
          const sIdx = headers.findIndex(h => h.includes('SUB-LÍNEA'));
          const rIdx = headers.findIndex(h => h.includes('RAZÓN SOCIAL'));
          const mIdx = headers.findIndex(h => h.includes('LÍNEA MEXICANA') || h.includes('MEXICANA'));

          if (lIdx === -1 || cIdx === -1 || nIdx === -1) {
              return alert("Estructura inválida. Asegúrate de usar la plantilla descargable.");
          }

          setLoading(true);
          let imported = 0;
          for (let i = 1; i < rows.length; i++) {
              const r = rows[i];
              if (!r[lIdx] || !r[cIdx]) continue;
              
              const line: TransportLineModel = {
                  transportLineId: r[lIdx].trim().toUpperCase(),
                  carrierCodigo: r[cIdx].trim().toUpperCase(),
                  TransportLine: r[nIdx]?.trim() || '',
                  nombreSubLinea: r[sIdx]?.trim().toUpperCase() || '',
                  razonSocial: r[rIdx]?.trim() || '',
                  lineaMexicana: mIdx !== -1 ? r[mIdx]?.trim() || '' : ''
              };

              try {
                  await transportLineService.addTransportLine(line);
                  imported++;
              } catch(err) {
                  console.error("Error importing row", r, err);
              }
          }
          if (fileInputRef.current) fileInputRef.current.value = '';
          alert(`Importación finalizada. ${imported} líneas registradas.`);
          loadData();
      };
      reader.readAsText(file);
  };

  return (
    <div className="h-[calc(100vh-4rem)] -mt-8 -mx-8 flex flex-col overflow-hidden animate-fade-in w-full mx-auto">
      {/* ── FIXED HEADER / CONTROLS ── */}
      <div className="flex-shrink-0 p-6 pb-2 relative z-20">
        <div className="flex justify-between items-center mb-4">
          <div>
             <h1 className="text-2xl font-bold text-slate-800">Líneas de Transporte Terrestre</h1>
             <p className="text-slate-500 text-sm mt-1">Administra sub-proveedores asociados a los Carriers.</p>
          </div>
          
          <div className="flex items-center gap-3">
             <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                    type="text" 
                    placeholder={t('common.buscar')} 
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

             <button onClick={openNew} className="bg-indigo-600 text-white px-4 py-2 flex items-center rounded-lg hover:bg-indigo-700 shadow-md shadow-indigo-500/30 transition-all font-medium text-sm">
                <Plus size={18} className="mr-2" /> {t('btn.new')}
             </button>
          </div>
        </div>
      </div>

      {/* ── SCROLLABLE TABLE AREA ── */}
      <div className="flex-1 flex flex-col min-h-0 p-6 pt-2 relative z-10">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-auto flex-1 relative">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs uppercase tracking-wider sticky top-0 z-30 shadow-sm">
              <tr>
              <th className="p-4 font-medium">{t('tl.id')}</th>
              <th className="p-4 font-medium">{t('tl.carrier')}</th>
              <th className="p-4 font-medium">{t('tl.sublinea')}</th>
              <th className="p-4 font-medium">{t('tl.razon')}</th>
              <th className="p-4 font-medium">{t('tl.mexicana')}</th>
              <th className="p-4 font-medium text-right">{t('btn.acciones')}</th>
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
                <td className="p-4 text-emerald-700 font-medium">{c.lineaMexicana || '-'}</td>
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
                <tr><td colSpan={6} className="p-12 text-center">
                  {user?.role === UserRole.TRANSPORTISTA && !subLineaFilter
                    ? <span className="text-amber-600 font-medium">⚠️ Tu perfil no tiene Nombre Comercial asignado. Contacta al administrador para configurarlo.</span>
                    : <span className="text-slate-400">No hay líneas que coincidan.</span>
                  }
                </td></tr>
              )}
            {loading && <tr><td colSpan={6} className="p-12 text-center text-slate-400">Cargando base de datos...</td></tr>}
          </tbody>
        </table>
        </div>
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
                <input required disabled={isEditing} value={formData.transportLineId || ''} onChange={e => setFormData({...formData, transportLineId: e.target.value.toUpperCase()})} className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-slate-100 placeholder:text-slate-400" placeholder="Ej. APL-001" />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Carrier Principal (Asociación)</label>
                <SearchableComboBox
                  required
                  value={formData.carrierCodigo || ''}
                  onChange={val => setFormData({...formData, carrierCodigo: val})}
                  options={carriers.map(car => ({
                    value: car.codigo,
                    label: car.nombre,
                    sublabel: car.codigo
                  }))}
                  placeholder="Selecciona el Carrier matriz..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre Comercial</label>
                <input required value={formData.TransportLine || ''} onChange={e => setFormData({...formData, TransportLine: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 outline-none placeholder:text-slate-400" placeholder="Ej. APL Logistics" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre Sub-Línea</label>
                <input value={formData.nombreSubLinea || ''} onChange={e => setFormData({...formData, nombreSubLinea: e.target.value.toUpperCase()})} className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 outline-none placeholder:text-slate-400 uppercase" placeholder="Ej. DIVISION REEFER" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Razón Social Legal</label>
                <input required value={formData.razonSocial || ''} onChange={e => setFormData({...formData, razonSocial: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 outline-none placeholder:text-slate-400" placeholder="Ej. Logistics SA de CV" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Línea Mexicana</label>
                <input value={formData.lineaMexicana || ''} onChange={e => setFormData({...formData, lineaMexicana: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 outline-none placeholder:text-slate-400" placeholder="Ej. Transportes Mexicanos SA" />
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
