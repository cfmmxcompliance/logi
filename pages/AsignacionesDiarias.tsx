import React, { useState, useEffect, useMemo, useRef } from 'react';
import { asignacionCajaService } from '../services/asignacionCajaService';
import { cajaService } from '../services/cajaService';
import { driverService } from '../services/driverService';
import { carrierService } from '../services/carrierService';
import { liberacionService } from '../services/liberacionService';
import { AsignacionCajaModel } from '../types/asignacionCaja';
import { CajaModel } from '../types/caja';
import { DriverModel } from '../types/driver';
import { CarrierModel } from '../types/carrier';
import { LiberacionRecord } from '../types';
import { Plus, Edit2, Trash2, Search, Filter, Calendar, Download, UploadCloud, FileSpreadsheet, Truck, Navigation, Container, Box, XCircle, CheckCircle } from 'lucide-react';
import { CatalogQueryBuilder, QueryCondition, evaluateCondition } from '../components/CatalogQueryBuilder';
import { parseCSV } from '../utils/csvHelpers';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';
import modelosCaja from '../utils/modelosCaja.json';

export const AsignacionesDiarias: React.FC = () => {
  const { user } = useAuth();
  const isEmbarques = user?.role === UserRole.EMBARQUES;
  const [asignaciones, setAsignaciones] = useState<AsignacionCajaModel[]>([]);
  const [cajas, setCajas] = useState<CajaModel[]>([]);
  const [drivers, setDrivers] = useState<DriverModel[]>([]);
  const [carriers, setCarriers] = useState<CarrierModel[]>([]);
  const [liberaciones, setLiberaciones] = useState<LiberacionRecord[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importErrors, setImportErrors] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<Partial<AsignacionCajaModel>>({ 
    fecha: new Date().toISOString().split('T')[0],
    horaAsignacion: new Date().toTimeString().substring(0, 5)
  });
  const [isEditing, setIsEditing] = useState(false);

  // Search & Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState({ 
    start: new Date().toISOString().split('T')[0], 
    end: new Date().toISOString().split('T')[0] 
  });
  const [isMassQueryOpen, setIsMassQueryOpen] = useState(false);
  const [queryConditions, setQueryConditions] = useState<QueryCondition[]>([
      { id: '1', column: 'numeroCaja', operator: 'in', type: 'string', input: '' }
  ]);
  const [activeMassQuery, setActiveMassQuery] = useState<QueryCondition[] | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const columns = ['fecha', 'horaAsignacion', 'numeroCaja', 'subLinea', 'placasCaja', 'driverId', 'nombreDriver', 'placasTracto', 'modeloAsignado'];

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
        const [asigData, cajasData, driversData, carriersData, liberacionesData] = await Promise.all([
            asignacionCajaService.getAllAsignaciones().catch(() => []),
            cajaService.getAllCajas().catch(() => []),
            driverService.getAllDrivers().catch(() => []),
            carrierService.getAllCarriers().catch(() => []),
            liberacionService.getAllLiberaciones().catch(() => [])
        ]);
        setAsignaciones(asigData.sort((a,b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()));
        setCajas(cajasData);
        setDrivers(driversData);
        setCarriers(carriersData);
        setLiberaciones(liberacionesData);
    } catch (e) {
        console.error("Error cargando dependencias de Asignación:", e);
    } finally {
        setLoading(false);
    }
  };

  const filteredData = useMemo(() => {
    let result = asignaciones;

    // Date Range Filter
    if (dateRange.start) {
        result = result.filter(a => a.fecha >= dateRange.start);
    }
    if (dateRange.end) {
        result = result.filter(a => a.fecha <= dateRange.end);
    }

    // Multi-term search (spaces/commas)
    if (searchTerm) {
        const terms = searchTerm.toLowerCase().split(/[\s,]+/).filter(t => t);
        result = result.filter(a => 
            terms.some(term => 
                (a.numeroCaja || '').toLowerCase().includes(term) ||
                (a.subLinea || '').toLowerCase().includes(term) ||
                (a.placasCaja || '').toLowerCase().includes(term) ||
                (a.driverId || '').toLowerCase().includes(term) ||
                (a.nombreDriver || '').toLowerCase().includes(term) ||
                (a.placasTracto || '').toLowerCase().includes(term)
            )
        );
    }

    // Massive Query Filter
    if (activeMassQuery && activeMassQuery.length > 0) {
        result = result.filter(c => {
            return activeMassQuery.every(cond => {
                const targetVal = c[cond.column as keyof AsignacionCajaModel];
                return evaluateCondition(targetVal, cond);
            });
        });
    }

    // Sort combined by date and time (ascending - earliest first)
    result.sort((a, b) => {
        const dateTimeA = new Date(`${a.fecha}T${a.horaAsignacion || '00:00'}:00`).getTime();
        const dateTimeB = new Date(`${b.fecha}T${b.horaAsignacion || '00:00'}:00`).getTime();
        if (dateTimeA !== dateTimeB) return dateTimeA - dateTimeB;
        
        // Secondary sort by createdAt to preserve CSV insertion order for identical hours
        const crA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const crB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return crA - crB;
    });

    return result;
  }, [asignaciones, searchTerm, dateRange, activeMassQuery]);

  const handleApplyMassQuery = () => {
    const valid = queryConditions.filter(c => c.operator === 'empty' || c.operator === 'not_empty' || c.input.trim());
    setActiveMassQuery(valid.length > 0 ? valid : null);
    setIsMassQueryOpen(false);
  };

  const handleClearMassQuery = () => {
    setActiveMassQuery(null);
    setQueryConditions([{ id: Math.random().toString(), column: 'numeroCaja', operator: 'in', type: 'string', input: '' }]);
    setIsMassQueryOpen(false);
  };

  const handleCajaChange = (numeroCaja: string) => {
      const selected = cajas.find(c => c.NumeroCaja === numeroCaja);
      if (selected) {
          setFormData(prev => ({
              ...prev,
              numeroCaja: selected.NumeroCaja,
              subLinea: selected.nombreSubLinea || '',
              placasCaja: selected.placas || ''
          }));
      }
  };

  const handleDriverChange = (driverId: string) => {
      const selected = drivers.find(d => d.driverId === driverId);
      if (selected) {
          setFormData(prev => ({
              ...prev,
              driverId: selected.driverId,
              nombreDriver: selected.nombre,
              placasTracto: selected.placasTracto || ''
          }));
      }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fecha || !formData.numeroCaja || !formData.driverId) return;

    if (isEditing && formData.id) {
      await asignacionCajaService.updateAsignacion(formData.id, formData);
    } else {
      await asignacionCajaService.addAsignacion(formData as AsignacionCajaModel);
    }
    setShowModal(false);
    loadData();
  };

  const handleDelete = async (id: string) => {
    if (confirm("¿Seguro que deseas eliminar esta asignación diaria?")) {
      await asignacionCajaService.deleteAsignacion(id);
      setSelectedIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(id);
          return newSet;
      });
      loadData();
    }
  };

  const handleMassDelete = async () => {
    if (selectedIds.size === 0) return;
    if (confirm(`¿Seguro que deseas eliminar las ${selectedIds.size} asignaciones seleccionadas?`)) {
        setLoading(true);
        try {
            for (const id of selectedIds) {
                await asignacionCajaService.deleteAsignacion(id);
            }
            setSelectedIds(new Set());
            loadData();
        } catch (error) {
            console.error("Error deleting items", error);
            alert("Hubo un error borrando algunas asignaciones.");
            loadData();
        }
    }
  };

  const toggleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(filteredData.map(a => a.id!)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const toggleSelectRow = (id: string) => {
    const newSec = new Set(selectedIds);
    if (newSec.has(id)) newSec.delete(id);
    else newSec.add(id);
    setSelectedIds(newSec);
  };

  const openNew = () => {
      setFormData({ 
          fecha: new Date().toISOString().split('T')[0],
          horaAsignacion: new Date().toTimeString().substring(0, 5)
      });
      setIsEditing(false);
      setShowModal(true);
  };

  const openEdit = (record: AsignacionCajaModel) => {
      setFormData({
          ...record,
          horaAsignacion: record.horaAsignacion || new Date().toTimeString().substring(0, 5)
      });
      setIsEditing(true);
      setShowModal(true);
  };

  // CSV EXPORT
  const exportCSV = () => {
      const headers = ["FECHA", "HORA", "NO. OPERACIÓN", "NÚMERO CAJA", "SUB-LÍNEA", "PLACAS CAJA", "DRIVER ID", "NOMBRE DRIVER", "PLACAS TRACTO", "MODELO", "SELLO LIBERACIÓN"];
      const rows = filteredData.map(a => {
          const lib = liberaciones.find(l => l.asignacionCajaId === a.id);
          return [
              a.fecha,
              a.horaAsignacion || '',
              a.numeroOperacion || '',
              a.numeroCaja,
              a.subLinea || '',
              a.placasCaja || '',
              a.driverId,
              a.nombreDriver || '',
              a.placasTracto || '',
              a.modeloAsignado || '',
              lib ? lib.selloValidado : ''
          ];
      });
      const csvContent = [headers, ...rows].map(e => e.map(item => `"${(item || '').replace(/"/g, '""')}"`).join(",")).join("\n");
      const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `asignaciones_diarias_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  // CSV TEMPLATE
  const downloadTemplate = () => {
      const headers = ["FECHA", "HORA", "NO. OPERACIÓN", "NÚMERO CAJA", "DRIVER ID", "MODELO"];
      const example = ["2026-03-25", "09:30", "OP-001", "EMCU-123456", "TRANSPORTES SA DE CV", "COMPACTO, SUV"];
      const csvContent = [headers, example].map(e => e.join(",")).join("\n");
      const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", "plantilla_asignacion_cajas.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  // CSV IMPORT
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (e) => {
          const text = e.target?.result as string;
          const rows = parseCSV(text);
          if (rows.length < 2) return alert("El archivo está vacío o no tiene datos válidos.");

          const headers = rows[0].map(h => h.trim().toUpperCase());
          const fIdx = headers.findIndex(h => h.includes('FECHA'));
          const hIdx = headers.findIndex(h => h.includes('HORA'));
          const oIdx = headers.findIndex(h => h.includes('OPERACI'));
          const cIdx = headers.findIndex(h => h.includes('CAJA'));
          const dIdx = headers.findIndex(h => h.includes('DRIVER'));
          const mIdx = headers.findIndex(h => h.includes('MODELO'));

          if (fIdx === -1 || cIdx === -1 || dIdx === -1) {
              return alert("Estructura inválida. La cabecera debe contener al menos FECHA, NÚMERO CAJA y DRIVER ID.");
          }

          setLoading(true);
          let imported = 0;
          let errors: string[] = [];

          for (let i = 1; i < rows.length; i++) {
              const r = rows[i];
              let rawFecha = r[fIdx]?.trim();
              
              // Normalizar fechas tipo DD/MM/YYYY que exporta Excel a YYYY-MM-DD
              if (rawFecha && rawFecha.includes('/')) {
                  const parts = rawFecha.split('/');
                  if (parts.length === 3) {
                      const year = parts[2].length === 4 ? parts[2] : `20${parts[2]}`;
                      const month = parts[1].padStart(2, '0');
                      const day = parts[0].padStart(2, '0');
                      rawFecha = `${year}-${month}-${day}`;
                  }
              }

              const rawHora = hIdx !== -1 ? r[hIdx]?.trim() : '';
              const rawOperacion = oIdx !== -1 ? r[oIdx]?.trim().toUpperCase() : '';
              const rawCaja = r[cIdx]?.trim().toUpperCase();
              const rawDriver = r[dIdx]?.trim().toUpperCase();
              const rawModelo = mIdx !== -1 ? r[mIdx]?.trim().toUpperCase() : '';

              if (!rawFecha && !rawCaja && !rawDriver) continue;
              if (!rawFecha || !rawCaja || !rawDriver) {
                  errors.push(`Fila ${i + 1}: Faltan datos (Fecha, Caja o Driver)`);
                  continue;
              }

              const matchCaja = cajas.find(c => c.NumeroCaja.toUpperCase() === rawCaja);
              const matchDriver = drivers.find(d => d.driverId.toUpperCase() === rawDriver);

              if (!matchCaja) errors.push(`Fila ${i + 1}: La Caja "${rawCaja}" no existe en catálogo.`);
              if (!matchDriver) errors.push(`Fila ${i + 1}: El Driver "${rawDriver}" no existe en catálogo.`);

              const carrierPadre = matchCaja ? matchCaja.carrierCodigo : (matchDriver ? matchDriver.carrierCodigo : '');

              const asig: AsignacionCajaModel = {
                  fecha: rawFecha,
                  horaAsignacion: rawHora || new Date().toTimeString().substring(0, 5),
                  numeroOperacion: rawOperacion || '',
                  carrierCodigo: carrierPadre,
                  numeroCaja: rawCaja,
                  subLinea: matchCaja ? matchCaja.nombreSubLinea || '' : '',
                  placasCaja: matchCaja ? matchCaja.placas || '' : '',
                  driverId: rawDriver,
                  nombreDriver: matchDriver ? matchDriver.nombre : rawDriver,
                  placasTracto: matchDriver ? matchDriver.placasTracto || '' : '',
                  modeloAsignado: rawModelo || '',
                  createdAt: new Date(Date.now() + i).toISOString()
              };

              try {
                  await asignacionCajaService.addAsignacion(asig);
                  imported++;
              } catch(err: any) {
                  errors.push(`Fila ${i + 1}: Error al guardar - ${err.message || 'Desconocido'}`);
              }
          }
          
          if (fileInputRef.current) fileInputRef.current.value = '';
          
          if (errors.length > 0) {
              setImportErrors([`Se importaron ${imported} registros con éxito.`, ...errors]);
          } else {
              alert(`Importación finalizada. ${imported} registros integrados relacionando maestras.`);
          }
          loadData();
      };
      reader.readAsText(file);
  };

  return (
    <div className="p-6 w-full mx-auto animate-fade-in relative">
      <div className="flex justify-between items-center mb-6">
        <div>
           <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Navigation className="text-blue-600" />
              Asignación Diaria de Cajas
           </h1>
           <p className="text-slate-500 text-sm mt-1">Gestión operativa vinculando Contenedores y Transportistas activos.</p>
        </div>
        
        <div className="flex items-center gap-3">
             <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                    type="text" 
                    placeholder="Búsqueda multi-termino..." 
                    value={searchTerm} 
                    onChange={e => setSearchTerm(e.target.value)}
                    className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none w-56 shadow-sm"
                />
             </div>
             
             <div className="flex items-center bg-white border border-slate-300 rounded-lg pr-2 overflow-hidden shadow-sm">
                <button 
                  onClick={() => {
                    const today = new Date().toISOString().split('T')[0];
                    setDateRange({ start: today, end: today });
                  }}
                  className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold px-3 py-2 text-xs border-r border-slate-200 transition-colors h-full"
                  title="Filtrar por Hoy"
                >
                  HOY
                </button>
                <Calendar size={14} className="text-slate-400 ml-2" />
                <input 
                    type="date"
                    value={dateRange.start}
                    onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                    className="py-2 px-2 text-sm outline-none text-slate-600 bg-transparent"
                    title="Fecha Inicial"
                />
                <span className="text-slate-300">-</span>
                <input 
                    type="date"
                    value={dateRange.end}
                    onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                    className="py-2 px-2 text-sm outline-none text-slate-600 bg-transparent"
                    title="Fecha Final"
                />
             </div>

             {!isEmbarques && selectedIds.size > 0 && (
                 <button onClick={handleMassDelete} className="px-3 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg border border-red-200 transition-colors shadow-sm flex items-center text-sm font-bold animate-fade-in" title="Eliminar Seleccionados">
                    <Trash2 size={16} className="mr-2" /> Borrar ({selectedIds.size})
                 </button>
             )}

             <button onClick={() => setIsMassQueryOpen(true)} className={`px-4 py-2 flex items-center rounded-lg border text-sm font-medium transition-colors shadow-sm ${activeMassQuery ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
                 <Filter size={16} className="mr-2" />
                 Filtros Masivos
             </button>

             {!isEmbarques && (
               <>
                 <button onClick={downloadTemplate} className="px-3 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg border border-slate-300 transition-colors shadow-sm flex items-center text-sm font-medium" title="Plantilla CSV">
                    <FileSpreadsheet size={16} className="text-emerald-600" />
                 </button>

                 <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={handleFileUpload} />
                 <button onClick={() => fileInputRef.current?.click()} className="px-3 py-2 bg-white text-slate-700 hover:bg-slate-50 rounded-lg border border-slate-300 transition-colors shadow-sm flex items-center text-sm font-medium" title="Subir CSV">
                    <UploadCloud size={16} className="text-indigo-600" />
                 </button>
               </>
             )}

             <button onClick={exportCSV} className="px-4 py-2 bg-white text-slate-700 hover:bg-slate-50 rounded-lg border border-slate-300 transition-colors shadow-sm flex items-center text-sm font-medium">
                <Download size={16} className="mr-2 text-slate-500" /> Exportar
             </button>

             {!isEmbarques && (
                 <button onClick={openNew} className="bg-blue-600 text-white px-4 py-2 flex items-center rounded-lg hover:bg-blue-700 shadow-md shadow-blue-500/30 transition-all font-medium text-sm">
                    <Plus size={18} className="mr-2" /> Asignar
                 </button>
             )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs uppercase tracking-wider">
            <tr>
              <th className="p-4 w-12 border-r border-slate-100 bg-slate-100 text-center">
                  {!isEmbarques && <input type="checkbox" checked={filteredData.length > 0 && selectedIds.size === filteredData.length} onChange={toggleSelectAll} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer" />}
              </th>
              <th className="p-4 font-medium border-r border-slate-100 bg-blue-50/50 whitespace-nowrap">Fecha/Hora</th>
              <th className="p-4 font-medium text-pink-800 bg-pink-50/30 whitespace-nowrap">No. Operación</th>
              <th className="p-4 font-medium text-emerald-800 bg-emerald-50/30">Número Caja</th>
              <th className="p-4 font-medium text-emerald-800 bg-emerald-50/30">Sub-Línea</th>
              <th className="p-4 font-medium text-emerald-800 bg-emerald-50/30">Placas Caja</th>
              <th className="p-4 font-medium text-orange-800 bg-orange-50/30 whitespace-nowrap">Driver ID</th>
              <th className="p-4 font-medium text-orange-800 bg-orange-50/30">Nombre / Transportista</th>
              <th className="p-4 font-medium text-orange-800 bg-orange-50/30">Placas Tracto</th>
              <th className="p-4 font-medium text-purple-800 bg-purple-50/30 whitespace-nowrap">Modelo</th>
              <th className="p-4 font-medium text-teal-800 bg-teal-50/30 whitespace-nowrap">Sello Liberación</th>
              <th className="p-4 font-medium text-red-800 bg-red-50/30 text-center">CARGADO</th>
              {!isEmbarques && <th className="p-4 font-medium text-right bg-slate-50">Acciones</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {filteredData.map((a, index) => {
              const hasLiberacion = liberaciones.some(lib => lib.asignacionCajaId === a.id);
              return (
              <tr key={a.id} className={`transition-colors ${selectedIds.has(a.id!) ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}>
                <td className="p-4 bg-slate-50/30 border-r border-slate-100 text-center">
                    {!isEmbarques && <input type="checkbox" checked={selectedIds.has(a.id!)} onChange={() => toggleSelectRow(a.id!)} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer" />}
                </td>
                <td className="p-4 font-medium text-slate-700 border-r border-slate-100 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                       <span className="flex items-center gap-1.5"><Calendar size={12} className="text-blue-500" /> {a.fecha}</span>
                       {a.horaAsignacion && <span className="text-xs text-slate-400 font-mono">| {a.horaAsignacion}</span>}
                    </div>
                </td>
                
                <td className="p-4 font-mono text-pink-700 font-bold tracking-wide whitespace-nowrap">{a.numeroOperacion || '-'}</td>
                <td className="p-4 font-semibold text-emerald-700 font-mono tracking-wide">{a.numeroCaja}</td>
                <td className="p-4 text-slate-600">{a.subLinea || '-'}</td>
                <td className="p-4 font-mono text-slate-500 text-xs uppercase font-medium">{a.placasCaja || '-'}</td>
                
                <td className="p-4 font-mono text-orange-600 font-medium whitespace-nowrap">{a.driverId}</td>
                <td className="p-4 font-medium text-slate-800 whitespace-nowrap">{a.nombreDriver}</td>
                <td className="p-4 font-mono text-slate-500 text-xs uppercase font-medium whitespace-nowrap">{a.placasTracto || '-'}</td>
                <td className="p-4 font-medium text-slate-700 whitespace-nowrap">{a.modeloAsignado || '-'}</td>
                
                <td className="p-4 font-mono text-teal-700 font-bold whitespace-nowrap border-l border-teal-100/50 bg-teal-50/10">
                    {hasLiberacion ? liberaciones.find(l => l.asignacionCajaId === a.id)?.selloValidado : '-'}
                </td>
                
                <td className="p-4 text-center">
                    {hasLiberacion ? (
                        <div title="Caja Liberada" className="inline-flex items-center justify-center p-1.5 bg-emerald-100 rounded-full shadow-sm border border-emerald-200">
                           <CheckCircle size={18} className="text-emerald-600" />
                        </div>
                    ) : (
                        <div title="Pendiente de Cierre" className="inline-flex items-center justify-center p-1.5 bg-red-50 rounded-full border border-red-100">
                           <XCircle size={18} className="text-red-500" />
                        </div>
                    )}
                </td>

                {!isEmbarques && (
                  <td className="p-4 flex gap-2 justify-end items-center">
                    <button onClick={() => openEdit(a)} className="p-1.5 text-blue-600 hover:bg-blue-100 rounded transition-colors" title="Editar">
                      <Edit2 size={16} />
                    </button>
                    <button onClick={() => handleDelete(a.id!)} className="p-1.5 text-red-600 hover:bg-red-100 rounded transition-colors" title="Eliminar">
                      <Trash2 size={16} />
                    </button>
                  </td>
                )}
              </tr>
              );
            })}
            {filteredData.length === 0 && !loading && (
              <tr><td colSpan={12} className="p-12 text-center text-slate-400">No se encontraron asignaciones diarias en este rango.</td></tr>
            )}
            {loading && <tr><td colSpan={12} className="p-12 text-center text-slate-400">Cargando operación diaria...</td></tr>}
          </tbody>
        </table>
      </div>

      <CatalogQueryBuilder 
          isOpen={isMassQueryOpen}
          onClose={() => setIsMassQueryOpen(false)}
          columns={columns}
          conditions={queryConditions}
          setConditions={setQueryConditions}
          onApply={handleApplyMassQuery}
          onClear={handleClearMassQuery}
      />

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[110] animate-fade-in">
           <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-lg transform scale-100 transition-transform">
            <h2 className="text-xl font-bold mb-6 text-slate-800 flex items-center gap-2">
                <Navigation className="text-blue-600" />
                {isEditing ? 'Editar Asignación' : 'Relacionar Caja / Operador'}
            </h2>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-500 mb-1">Fecha Operativa</label>
                  <input type="date" required value={formData.fecha || ''} onChange={e => setFormData({...formData, fecha: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-500 mb-1">Hora (24h)</label>
                  <input type="time" required value={formData.horaAsignacion || ''} onChange={e => setFormData({...formData, horaAsignacion: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-500 mb-1">No. Operación</label>
                  <input type="text" value={formData.numeroOperacion || ''} onChange={e => setFormData({...formData, numeroOperacion: e.target.value.toUpperCase()})} placeholder="Opcional" className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-pink-500 outline-none font-mono uppercase" />
                </div>
              </div>

              <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100 space-y-3">
                 <h3 className="text-xs font-bold text-indigo-800 uppercase flex items-center gap-1.5"><Navigation size={14}/> Carrier Padre (SCAC)</h3>
                 <div>
                    <select required value={formData.carrierCodigo || ''} onChange={e => setFormData({...formData, carrierCodigo: e.target.value, numeroCaja: '', driverId: '', subLinea: '', placasCaja: '', nombreDriver: '', placasTracto: ''})} className="w-full border border-indigo-200 rounded-lg p-2.5 outline-none bg-white font-mono shadow-sm focus:ring-2 focus:ring-indigo-500">
                        <option value="" disabled>Seleccionar Carrier Padre...</option>
                        {carriers.map(c => <option key={c.codigo} value={c.codigo}>{c.codigo} - {c.nombre}</option>)}
                    </select>
                 </div>
              </div>
              
              <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100 space-y-3">
                 <h3 className="text-xs font-bold text-emerald-800 uppercase flex items-center gap-1.5"><Container size={14}/> Equipo (Módulo Cajas)</h3>
                 <div>
                    <select required disabled={!formData.carrierCodigo} value={formData.numeroCaja || ''} onChange={e => handleCajaChange(e.target.value)} className="w-full border border-emerald-200 rounded-lg p-2.5 outline-none bg-white font-mono shadow-sm focus:ring-2 focus:ring-emerald-500 disabled:opacity-50">
                        <option value="" disabled>Seleccionar Número de Caja...</option>
                        {cajas.map(c => <option key={c.NumeroCaja} value={c.NumeroCaja}>{c.NumeroCaja} ({c.nombreSubLinea || 'Sin sublinea'}) {c.carrierCodigo !== formData.carrierCodigo && c.carrierCodigo ? `[${c.carrierCodigo}]` : ''}</option>)}
                    </select>
                 </div>
                 <div className="flex gap-3">
                    <div className="flex-1">
                        <label className="block text-xs text-emerald-700 mb-1">Sub-Línea</label>
                        <input disabled value={formData.subLinea || ''} className="w-full bg-emerald-100/50 border-transparent rounded p-2 text-sm text-emerald-800" placeholder="Auto-completado" />
                    </div>
                    <div className="flex-1">
                        <label className="block text-xs text-emerald-700 mb-1">Placas Caja</label>
                        <input disabled value={formData.placasCaja || ''} className="w-full bg-emerald-100/50 border-transparent rounded p-2 text-sm text-emerald-800 font-mono" placeholder="Auto-completado" />
                    </div>
                 </div>
              </div>

              <div className="p-4 bg-orange-50 rounded-xl border border-orange-100 space-y-3">
                 <h3 className="text-xs font-bold text-orange-800 uppercase flex items-center gap-1.5"><Truck size={14}/> Transportista (Módulo Driver)</h3>
                 <div>
                    <select required disabled={!formData.carrierCodigo} value={formData.driverId || ''} onChange={e => handleDriverChange(e.target.value)} className="w-full border border-orange-200 rounded-lg p-2.5 outline-none bg-white shadow-sm focus:ring-2 focus:ring-orange-500 disabled:opacity-50">
                        <option value="" disabled>Seleccionar Driver ID...</option>
                        {drivers.map(d => <option key={d.driverId} value={d.driverId}>{d.driverId} - {d.nombre} {d.carrierCodigo !== formData.carrierCodigo && d.carrierCodigo ? `[${d.carrierCodigo}]` : ''}</option>)}
                    </select>
                 </div>
                 <div className="flex gap-3">
                    <div className="flex-1">
                        <label className="block text-xs text-orange-700 mb-1">Nombre</label>
                        <input disabled value={formData.nombreDriver || ''} className="w-full bg-orange-100/50 border-transparent rounded p-2 text-sm text-orange-800" placeholder="Auto-completado" />
                    </div>
                    <div className="flex-1">
                        <label className="block text-xs text-orange-700 mb-1">Placas Tracto</label>
                        <input disabled value={formData.placasTracto || ''} className="w-full bg-orange-100/50 border-transparent rounded p-2 text-sm text-orange-800 font-mono" placeholder="Auto-completado" />
                    </div>
                 </div>
              </div>

              <div className="p-4 bg-purple-50 rounded-xl border border-purple-100 space-y-3">
                 <h3 className="text-xs font-bold text-purple-800 uppercase flex items-center gap-1.5"><Box size={14}/> Producto (Modelo)</h3>
                    <select 
                        multiple
                        required 
                        value={formData.modeloAsignado ? formData.modeloAsignado.split(', ') : []} 
                        onChange={e => {
                            const selectedValues = Array.from(e.target.selectedOptions, option => (option as HTMLOptionElement).value);
                            setFormData({...formData, modeloAsignado: selectedValues.join(', ')});
                        }}
                        className="w-full border border-purple-200 rounded-lg p-2.5 outline-none bg-white shadow-sm focus:ring-2 focus:ring-purple-500 min-h-[100px]"
                    >
                        <option value="" disabled>Seleccionar Modelos (Usa Ctrl/Cmd para varios)...</option>
                        {modelosCaja.map((m: string) => <option key={m} value={m}>{m}</option>)}
                    </select>
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
                <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 shadow-md shadow-blue-500/30 transition-all font-bold">
                  {isEditing ? 'Guardar Cambios' : 'Vincular Asignación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV Import Errors Modal */}
      {importErrors && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[80vh]">
                  <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-red-50 text-red-700">
                      <h2 className="text-lg font-bold flex items-center gap-2">
                          <XCircle size={20} />
                          Reporte de Importación
                      </h2>
                      <button onClick={() => setImportErrors(null)} className="p-1 hover:bg-red-100 rounded text-red-500">
                          <XCircle size={20} />
                      </button>
                  </div>
                  <div className="p-6 overflow-y-auto flex-1 space-y-2 font-mono text-sm leading-relaxed">
                      <div className="text-emerald-600 font-bold mb-4 bg-emerald-50 p-3 rounded border border-emerald-100">{importErrors[0]}</div>
                      {importErrors.slice(1).map((err, i) => (
                          <div key={i} className="text-red-600 bg-red-50/50 p-2 rounded border border-red-50 shadow-sm">{err}</div>
                      ))}
                  </div>
                  <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
                      <button onClick={() => setImportErrors(null)} className="px-6 py-2 bg-slate-200 text-slate-700 font-bold rounded-lg hover:bg-slate-300 transition-colors">Cerrar Reporte</button>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
};
