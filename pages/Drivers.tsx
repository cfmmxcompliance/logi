import React, { useState, useEffect, useMemo, useRef } from 'react';
import { driverService } from '../services/driverService';
import { carrierService } from '../services/carrierService';
import { transportLineService } from '../services/transportLineService';
import { DriverModel } from '../types/driver';
import { CarrierModel } from '../types/carrier';
import { TransportLineModel } from '../types/transportLine';
import { Plus, Edit2, Trash2, User, Search, Filter, Download, UploadCloud, FileSpreadsheet, Truck } from 'lucide-react';
import { CatalogQueryBuilder, QueryCondition, evaluateCondition } from '../components/CatalogQueryBuilder';
import { SearchableComboBox, ComboOption } from '../components/SearchableComboBox';
import { parseCSV } from '../utils/csvHelpers';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';

export const Drivers: React.FC = () => {
  const { user } = useAuth();
  const scacFilter = user?.role === UserRole.CARRIER ? (user?.scac || '').trim().toUpperCase() : null;
  const subLineaFilter = user?.role === UserRole.TRANSPORTISTA ? (user?.scac || '').trim().toUpperCase() : null;
  const [drivers, setDrivers] = useState<DriverModel[]>([]);
  const [carriers, setCarriers] = useState<CarrierModel[]>([]);
  const [transportLines, setTransportLines] = useState<TransportLineModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<Partial<DriverModel>>({});
  const [isEditing, setIsEditing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Search & Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const { t } = useLanguage();
  const [isMassQueryOpen, setIsMassQueryOpen] = useState(false);
  const [queryConditions, setQueryConditions] = useState<QueryCondition[]>([
      { id: '1', column: 'driverId', operator: 'in', type: 'string', input: '' }
  ]);
  const [activeMassQuery, setActiveMassQuery] = useState<QueryCondition[] | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [driversData, carriersData, linesData] = await Promise.all([
        driverService.getAllDrivers(),
        carrierService.getAllCarriers(),
        transportLineService.getAllTransportLines()
    ]);
    setDrivers(driversData);
    setCarriers(carriersData);
    setTransportLines(linesData);
    setLoading(false);
  };

  const getCarrierName = (code: string) => carriers.find(c => c.codigo === code)?.nombre || code;
  const getTransportLineName = (id?: string) => {
    if (!id) return '-';
    const tl = transportLines.find(t => t.transportLineId === id);
    return tl ? (tl.nombreSubLinea || tl.TransportLine) : id;
  };

  const filteredDrivers = useMemo(() => {
      let result = drivers;
      // CARRIER role: only show drivers belonging to their SCAC
      if (scacFilter) {
          result = result.filter(c => c.carrierCodigo?.toUpperCase() === scacFilter);
      }
      // TRANSPORTISTA role: filter by carrierCodigo linked to their Nombre Comercial (TransportLine)
      // Drivers always have carrierCodigo; transportLineId is optional and often missing.
      if (user?.role === UserRole.TRANSPORTISTA) {
          if (!subLineaFilter) {
              result = [];
          } else {
              // Find all carrier codes that belong to transport lines with matching Nombre Comercial
              const matchingCarriers = new Set(
                  transportLines
                      .filter(tl => (tl.TransportLine || '').toLowerCase() === subLineaFilter.toLowerCase())
                      .map(tl => (tl.carrierCodigo || '').toUpperCase())
                      .filter(Boolean)
              );
              result = result.filter(d => matchingCarriers.has((d.carrierCodigo || '').toUpperCase()));
          }
      }
      if (searchTerm) {
          const lowerTerm = searchTerm.toLowerCase();
          result = result.filter(c =>
              c.driverId.toLowerCase().includes(lowerTerm) ||
              c.nombre.toLowerCase().includes(lowerTerm) ||
              c.licencia.toLowerCase().includes(lowerTerm) ||
              (c.placasTracto && c.placasTracto.toLowerCase().includes(lowerTerm)) ||
              c.carrierCodigo.toLowerCase().includes(lowerTerm) ||
              getTransportLineName(c.transportLineId).toLowerCase().includes(lowerTerm)
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
  }, [drivers, searchTerm, activeMassQuery, scacFilter, subLineaFilter, getTransportLineName, transportLines, user]);

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

    // VALIDACIÓN: Solicitar aprobación si el nombre es idéntico a otro registro
    const inputName = (formData.nombre || '').trim().toLowerCase();
    const isDuplicateName = drivers.some(d =>
        d.nombre.trim().toLowerCase() === inputName &&
        d.driverId !== formData.driverId
    );

    if (isDuplicateName) {
        if (!confirm(`Ya existe un chófer registrado con el nombre "${formData.nombre}". ¿Estás seguro de que deseas guardar este registro duplicado?`)) {
            return;
        }
    }

    if (isEditing && formData.driverId) {
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

  const openNew = async () => {
    const nextId = await driverService.getNextDriverId();
    setFormData({
      driverId: nextId,
      carrierCodigo: carriers[0]?.codigo || ''
    });
    setIsEditing(false);
    setShowModal(true);
  };

  const exportCSV = () => {
      const headers = ["DRIVER ID", "CARRIER (SCAC)", "TRANSPORT LINE ID", "NOMBRE", "LICENCIA", "TELÉFONO", "PLACAS TRACTO"];
      const rows = filteredDrivers.map(c => [
          c.driverId,
          c.carrierCodigo,
          c.transportLineId || '',
          c.nombre,
          c.licencia,
          c.telefono,
          c.placasTracto || ''
      ]);
      const csvContent = [headers, ...rows].map(e => e.map(item => `"${(item || '').replace(/"/g, '""')}"`).join(",")).join("\n");
      const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `drivers_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const downloadTemplate = () => {
      const headers = ["DRIVER ID", "CARRIER (SCAC)", "TRANSPORT LINE ID", "NOMBRE", "LICENCIA", "TELÉFONO", "PLACAS TRACTO"];
      const example = ["ARC-001", "EGLV", "TL-001", "Juan Perez", "123456789", "555-1234", "ABC-123"];
      const csvContent = [headers, example].map(e => e.join(",")).join("\n");
      const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", "plantilla_choferes.csv");
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
          const dIdx = headers.findIndex(h => h.includes('DRIVER'));
          const cIdx = headers.findIndex(h => h.includes('CARRIER') || h.includes('SCAC'));
          const tlIdx = headers.findIndex(h => h.includes('TRANSPORT LINE') || h.includes('TRANSPORT_LINE'));
          const nIdx = headers.findIndex(h => h.includes('NOMBRE'));
          const lIdx = headers.findIndex(h => h.includes('LICENCIA'));
          const tIdx = headers.findIndex(h => h.includes('TEL'));
          const pIdx = headers.findIndex(h => h.includes('PLACAS'));

          if (dIdx === -1 || cIdx === -1 || nIdx === -1) {
              return alert("Estructura inválida. Asegúrate de usar la plantilla descargable.");
          }

          setLoading(true);
          let imported = 0;
          for (let i = 1; i < rows.length; i++) {
              const r = rows[i];
              if (!r[dIdx] || !r[cIdx]) continue;

              const driver: DriverModel = {
                  driverId: r[dIdx].trim().toUpperCase(),
                  carrierCodigo: r[cIdx].trim().toUpperCase(),
                  transportLineId: tlIdx !== -1 ? r[tlIdx]?.trim() || '' : '',
                  nombre: r[nIdx]?.trim() || '',
                  licencia: r[lIdx]?.trim() || '',
                  telefono: r[tIdx]?.trim() || '',
                  placasTracto: r[pIdx]?.trim() || ''
              };

              try {
                  await driverService.addDriver(driver);
                  imported++;
              } catch(err) {
                  console.error("Error importing row", r, err);
              }
          }
          if (fileInputRef.current) fileInputRef.current.value = '';
          alert(`Importación finalizada. ${imported} choferes registrados.`);
          loadData();
      };
      reader.readAsText(file);
  };

  // Combobox options
  const carrierOptions: ComboOption[] = carriers.map(c => ({
    value: c.codigo,
    label: c.nombre,
    sublabel: c.codigo
  }));

  const transportLineOptions: ComboOption[] = transportLines
    .filter(tl => !formData.carrierCodigo || tl.carrierCodigo === formData.carrierCodigo)
    .map(tl => ({
      value: tl.transportLineId,
      label: tl.nombreSubLinea || tl.TransportLine
    }));

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
                    placeholder={t('common.buscar')}
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

             <button onClick={openNew} className="bg-teal-600 text-white px-4 py-2 flex items-center rounded-lg hover:bg-teal-700 shadow-md shadow-teal-500/30 transition-all font-medium text-sm">
                <Plus size={18} className="mr-2" /> {t('btn.new')}
             </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs uppercase tracking-wider">
            <tr>
              <th className="p-4 font-medium">{t('driver.name')}</th>
              <th className="p-4 font-medium">{t('driver.carrier')}</th>
              <th className="p-4 font-medium">{t('driver.linea')}</th>
              <th className="p-4 font-medium">{t('driver.licencia')}</th>
              <th className="p-4 font-medium">{t('driver.tel')}</th>
              <th className="p-4 font-medium">{t('driver.placas')}</th>
              <th className="p-4 font-medium text-right">{t('btn.acciones')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {filteredDrivers.map(c => (
              <tr key={c.driverId} className="hover:bg-slate-50 transition-colors">
                <td className="p-4 font-semibold text-slate-800">
                    <div className="flex items-center gap-2">
                      <User size={14} className="text-slate-400" />
                      <div>
                          <div className="text-slate-800">{c.nombre}</div>
                          <div className="text-xs text-slate-400 font-mono font-normal">{c.driverId}</div>
                      </div>
                    </div>
                </td>
                <td className="p-4">
                    <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-medium">
                        {getCarrierName(c.carrierCodigo)}
                    </span>
                </td>
                <td className="p-4 text-indigo-700 font-medium text-xs">
                    {getTransportLineName(c.transportLineId)}
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
              <tr><td colSpan={7} className="p-12 text-center">
                {user?.role === UserRole.TRANSPORTISTA && !subLineaFilter
                  ? <span className="text-amber-600 font-medium">⚠️ Tu perfil no tiene Nombre Comercial asignado. Contacta al administrador para configurarlo.</span>
                  : <span className="text-slate-400">No hay choferes que coincidan.</span>
                }
              </td></tr>
            )}
            {loading && <tr><td colSpan={7} className="p-12 text-center text-slate-400">Cargando base de datos...</td></tr>}
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
          <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-6 text-slate-800">{isEditing ? 'Editar Chofer' : 'Registrar Nuevo Chofer'}</h2>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">

              {/* Driver ID + Carrier */}
              <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Driver ID (Auto)</label>
                    <div className="flex items-center gap-2">
                      <input
                        required
                        disabled={isEditing}
                        value={formData.driverId || ''}
                        onChange={e => setFormData({...formData, driverId: e.target.value.toUpperCase()})}
                        className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-teal-500 outline-none disabled:bg-slate-100 font-mono font-bold text-teal-700"
                        placeholder="ARC-001"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Carrier Principal</label>
                    <SearchableComboBox
                      required
                      value={formData.carrierCodigo || ''}
                      onChange={val => setFormData({...formData, carrierCodigo: val, transportLineId: ''})}
                      options={carrierOptions}
                      placeholder="Seleccionar Carrier..."
                    />
                  </div>
              </div>

              {/* TransportLine (Razón Social) */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1.5">
                  <Truck size={13} className="text-indigo-500" /> Línea de Transporte (Razón Social)
                </label>
                <SearchableComboBox
                  value={formData.transportLineId || ''}
                  onChange={val => setFormData({...formData, transportLineId: val})}
                  options={transportLineOptions}
                  placeholder={formData.carrierCodigo ? 'Seleccionar Razón Social...' : 'Primero selecciona un Carrier'}
                  disabled={!formData.carrierCodigo}
                />
                {formData.carrierCodigo && transportLineOptions.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">No hay líneas registradas para este carrier.</p>
                )}
              </div>

              {/* Nombre */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre Completo</label>
                <input required value={formData.nombre || ''} onChange={e => setFormData({...formData, nombre: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-teal-500" placeholder="Ej. Juan Pérez" />
              </div>

              {/* Licencia, Teléfono, Placas */}
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
                    <input value={formData.placasTracto || ''} onChange={e => setFormData({...formData, placasTracto: e.target.value.toUpperCase()})} className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-teal-500" placeholder="ABC-123" />
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
