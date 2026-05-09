import React, { useState, useEffect, useMemo, useRef } from 'react';
import { asignacionCajaService } from '../services/asignacionCajaService';
import { cajaService } from '../services/cajaService';
import { driverService } from '../services/driverService';
import { carrierService } from '../services/carrierService';
import { liberacionService } from '../services/liberacionService';
import { transportLineService } from '../services/transportLineService';
import { AsignacionCajaModel } from '../types/asignacionCaja';
import { CajaModel } from '../types/caja';
import { DriverModel } from '../types/driver';
import { CarrierModel } from '../types/carrier';
import { TransportLineModel } from '../types/transportLine';
import { LiberacionRecord } from '../types';
import { Plus, Edit2, Trash2, Search, Filter, Calendar, Download, UploadCloud, FileSpreadsheet, Truck, Navigation, Container, Box, XCircle, CheckCircle, ChevronUp, ChevronDown, RefreshCw, FileText, Loader2 } from 'lucide-react';
import { uploadFileToDrive } from '../services/googleDriveService.ts';
import { CatalogQueryBuilder, QueryCondition, evaluateCondition } from '../components/CatalogQueryBuilder';
import { SearchableComboBox, ComboOption } from '../components/SearchableComboBox';
import { MultiSearchableComboBox } from '../components/MultiSearchableComboBox';
import { parseCSV } from '../utils/csvHelpers';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';
import modelosCaja from '../utils/modelosCaja.json';
import { useLanguage } from '../context/LanguageContext';

export const AsignacionesDiarias: React.FC = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  // Roles con acceso de solo lectura — sin botones de escritura
  const isReadOnly = user?.role === UserRole.EMBARQUES || user?.role === UserRole.CLIENT;
  const isEmbarques = isReadOnly; // alias para compatibilidad con código existente
  const scacFilter = user?.role === UserRole.CARRIER ? (user?.scac || '').trim().toUpperCase() : null;
  const subLineaFilter = user?.role === UserRole.TRANSPORTISTA ? (user?.subLinea || '').trim() : null;
  const [asignaciones, setAsignaciones] = useState<AsignacionCajaModel[]>([]);
  const [cajas, setCajas] = useState<CajaModel[]>([]);
  const [drivers, setDrivers] = useState<DriverModel[]>([]);
  const [carriers, setCarriers] = useState<CarrierModel[]>([]);
  const [transportLines, setTransportLines] = useState<TransportLineModel[]>([]);
  const [liberaciones, setLiberaciones] = useState<LiberacionRecord[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importErrors, setImportErrors] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<Partial<AsignacionCajaModel>>({ 
    fecha: new Date().toISOString().split('T')[0],
    horaAsignacion: new Date().toTimeString().substring(0, 5)
  });
  const [isEditing, setIsEditing] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);

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
  const ASIG_DOCS_FOLDER_ID = '1ETyhI2Zddsw_btLBMIQGcYfhkrsmIEQj';
  const [uploadingFor, setUploadingFor] = useState<{ id: string; field: 'layoutUrl' | 'ccpUrl' | 'anexo29Url' } | null>(null);

  // Converts a Drive webViewLink to a direct download URL
  const toDriveDownload = (viewUrl: string) => {
    const match = viewUrl.match(/\/d\/([^/]+)\//);  
    return match ? `https://drive.google.com/uc?export=download&id=${match[1]}` : viewUrl;
  };

  const handleUploadDoc = async (recordId: string, field: 'layoutUrl' | 'ccpUrl' | 'anexo29Url', file: File, numeroCaja: string) => {
    try {
      setUploadingFor({ id: recordId, field });
      const labelMap: Record<string, string> = { layoutUrl: 'LAYOUT', ccpUrl: 'CCP', anexo29Url: 'ANEXO29' };
      const label = labelMap[field] || field.toUpperCase();
      const ext = file.name.split('.').pop() || 'file';
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${label}_${numeroCaja}_${ts}.${ext}`;
      const result = await uploadFileToDrive(file, filename, ASIG_DOCS_FOLDER_ID);
      const url = result?.webViewLink || '';
      const uploadedBy = user?.email || 'sistema';
      const uploadedAt = new Date().toISOString();

      if (field === 'layoutUrl') {
        await asignacionCajaService.updateAsignacion(recordId, {
          layoutUrl: url,
          layoutUploadedBy: uploadedBy,
          layoutUploadedAt: uploadedAt,
        });
        setAsignaciones(prev => prev.map(a => a.id === recordId
          ? { ...a, layoutUrl: url, layoutUploadedBy: uploadedBy, layoutUploadedAt: uploadedAt }
          : a));
      } else if (field === 'ccpUrl') {
        await asignacionCajaService.updateAsignacion(recordId, {
          ccpUrl: url,
          ccpUploadedBy: uploadedBy,
          ccpUploadedAt: uploadedAt,
        });
        setAsignaciones(prev => prev.map(a => a.id === recordId
          ? { ...a, ccpUrl: url, ccpUploadedBy: uploadedBy, ccpUploadedAt: uploadedAt }
          : a));
      } else {
        await asignacionCajaService.updateAsignacion(recordId, {
          anexo29Url: url,
          anexo29UploadedBy: uploadedBy,
          anexo29UploadedAt: uploadedAt,
        });
        setAsignaciones(prev => prev.map(a => a.id === recordId
          ? { ...a, anexo29Url: url, anexo29UploadedBy: uploadedBy, anexo29UploadedAt: uploadedAt }
          : a));
      }
    } catch (e: any) {
      alert(`Error subiendo archivo: ${e.message}`);
    } finally {
      setUploadingFor(null);
    }
  };
  const columns = ['fecha', 'horaAsignacion', 'numeroOperacion', 'numeroCaja', 'subLinea', 'placasCaja', 'transportLineId', 'driverId', 'nombreDriver', 'placasTracto', 'modeloAsignado'];

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
        const [asigData, cajasData, driversData, carriersData, liberacionesData, linesData] = await Promise.all([
            asignacionCajaService.getAllAsignaciones().catch(() => []),
            cajaService.getAllCajas().catch(() => []),
            driverService.getAllDrivers().catch(() => []),
            carrierService.getAllCarriers().catch(() => []),
            liberacionService.getAllLiberaciones().catch(() => []),
            transportLineService.getAllTransportLines().catch(() => [])
        ]);
        setAsignaciones(asigData.sort((a,b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()));
        setCajas(cajasData);
        setDrivers(driversData);
        setCarriers(carriersData);
        setLiberaciones(liberacionesData);
        setTransportLines(linesData);
    } catch (e) {
        console.error("Error cargando dependencias de Asignación:", e);
    } finally {
        setLoading(false);
    }
  };

  const filteredData = useMemo(() => {
    let result = asignaciones;

    // CARRIER role: only show assignments for their SCAC
    if (scacFilter) {
        result = result.filter(a => (a.carrierCodigo || '').toUpperCase() === scacFilter);
    }

    // TRANSPORTISTA role: only show assignments whose transport line matches their Nombre Comercial
    if (subLineaFilter) {
        const matchingIds = new Set(
            transportLines
                .filter(tl => (tl.TransportLine || '').toLowerCase() === subLineaFilter.toLowerCase())
                .map(tl => tl.transportLineId)
        );
        result = result.filter(a => matchingIds.has(a.transportLineId || ''));
    }

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

    // Apply sorting
    if (sortConfig) {
        result.sort((a, b) => {
            let valA: any = a[sortConfig.key as keyof AsignacionCajaModel];
            let valB: any = b[sortConfig.key as keyof AsignacionCajaModel];

            // Special case for Liberacion
            if (sortConfig.key === 'selloLiberacion') {
                const libA = liberaciones.find(l => l.asignacionCajaId === a.id);
                const libB = liberaciones.find(l => l.asignacionCajaId === b.id);
                valA = libA ? libA.selloValidado : '';
                valB = libB ? libB.selloValidado : '';
            }

            if (!valA) valA = '';
            if (!valB) valB = '';
            
            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    } else {
        // Default Sort: No. Operacion (asc), then tie-break with createdAt (CSV sequence)
        result.sort((a, b) => {
            const opA = a.numeroOperacion || '';
            const opB = b.numeroOperacion || '';
            
            if (opA < opB) return -1;
            if (opA > opB) return 1;
            
            // Secondary sort by createdAt to preserve CSV insertion order for identical operations
            const crA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const crB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return crA - crB;
        });
    }

    return result;
  }, [asignaciones, searchTerm, dateRange, activeMassQuery, sortConfig, liberaciones, scacFilter, subLineaFilter, transportLines]);

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

  const handleSort = (key: string) => {
      if (sortConfig && sortConfig.key === key) {
          if (sortConfig.direction === 'asc') setSortConfig({ key, direction: 'desc' });
          else setSortConfig(null);
      } else {
          setSortConfig({ key, direction: 'asc' });
      }
  };

  const renderSortIcon = (key: string) => {
      if (sortConfig?.key === key) {
          return sortConfig.direction === 'asc' 
              ? <ChevronUp size={16} className="inline-block ml-1 text-blue-600 font-bold" /> 
              : <ChevronDown size={16} className="inline-block ml-1 text-blue-600 font-bold" />;
      }
      return <ChevronUp size={16} className="inline-block ml-1 text-slate-400 opacity-50 group-hover:opacity-100 transition-opacity" />;
  };

  const renderColumnHeader = (label: string, key: string) => (
    <div 
        onClick={() => handleSort(key)} 
        className={`flex items-center gap-1 cursor-pointer hover:text-blue-600 transition-colors group ${sortConfig?.key === key ? 'text-blue-700 font-bold' : ''}`}
    >
        {label}
        {renderSortIcon(key)}
    </div>
  );

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

    // VALIDACIÓN DE DUPLICADOS: No permitir misma caja el mismo día
    const isDuplicate = asignaciones.some(a => 
      a.fecha === formData.fecha && 
      a.numeroCaja === formData.numeroCaja && 
      (!isEditing || a.id !== formData.id)
    );

    if (isDuplicate) {
      alert(`ERROR: La caja "${formData.numeroCaja}" ya tiene una asignación registrada para el día ${formData.fecha}. No se permiten duplicados en la misma fecha operativa.`);
      return;
    }

    if (isEditing && formData.id) {
      await asignacionCajaService.updateAsignacion(formData.id, formData);
    } else {
      const newRecord: AsignacionCajaModel = {
        ...(formData as AsignacionCajaModel),
        createdBy: user?.email || 'sistema',
        createdAt: new Date().toISOString()
      };
      await asignacionCajaService.addAsignacion(newRecord);
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

  const openNew = async () => {
      const today = new Date().toISOString().split('T')[0];
      const nextOp = await asignacionCajaService.getNextOperationNumber(today);
      setFormData({
          fecha: today,
          horaAsignacion: new Date().toTimeString().substring(0, 5),
          numeroOperacion: nextOp,
          // CARRIER role: pre-fill their SCAC
          ...(scacFilter ? { carrierCodigo: scacFilter } : {})
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
      const headers = ["FECHA", "HORA", "NO. OPERACIÓN", "NÚMERO CAJA", "SUB-LÍNEA", "PLACAS CAJA", "TRANSPORT LINE ID", "DRIVER ID", "NOMBRE DRIVER", "PLACAS TRACTO", "MODELO", "SELLO LIBERACIÓN", "FECHA SELLADO", "OBSERVACIONES"];
      const rows = filteredData.map(a => {
          const lib = liberaciones.find(l => l.asignacionCajaId === a.id);
          return [
              a.fecha,
              a.horaAsignacion || '',
              a.numeroOperacion || '',
              a.numeroCaja,
              a.subLinea || '',
              a.placasCaja || '',
              a.transportLineId || '',
              a.driverId,
              a.nombreDriver || '',
              a.placasTracto || '',
              a.modeloAsignado || '',
              lib ? lib.selloValidado : '',
              lib && lib.fechaHoraRegistro ? lib.fechaHoraRegistro : '',
              a.observaciones || ''
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
      const headers = ["FECHA", "HORA", "NO. OPERACIÓN", "NÚMERO CAJA", "TRANSPORT LINE ID (Opcional)", "DRIVER ID", "MODELO", "OBSERVACIONES"];
      const example = ["2026-03-25", "09:30", "OP-001", "EMCU-123456", "TL-001", "ARC-001", "MODEL A, MODEL B", "Carga prioritaria"];
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
          const obsIdx = headers.findIndex(h => h.includes('OBSERVACIONES'));

          if (fIdx === -1 || cIdx === -1 || dIdx === -1) {
              return alert("Estructura inválida. La cabecera debe contener al menos FECHA, NÚMERO CAJA y DRIVER ID.");
          }

          setLoading(true);
          let imported = 0;
          let errors: string[] = [];
          const seenInBatch = new Set<string>();

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
              const rawObs = obsIdx !== -1 ? r[obsIdx]?.trim().substring(0, 50) : '';

              if (!rawFecha && !rawCaja && !rawDriver) continue;
              if (!rawFecha || !rawCaja || !rawDriver) {
                  errors.push(`Fila ${i + 1}: Faltan datos (Fecha, Caja o Driver)`);
                  continue;
              }

              // VALIDACIÓN DE DUPLICADOS EN IMPORTACIÓN
              const isDuplicateInDb = asignaciones.some(a => a.fecha === rawFecha && a.numeroCaja === rawCaja);
              const batchKey = `${rawFecha}|${rawCaja}`;
              const isDuplicateInBatch = seenInBatch.has(batchKey);

              if (isDuplicateInDb || isDuplicateInBatch) {
                  errors.push(`Fila ${i + 1}: La caja "${rawCaja}" ya está asignada para el ${rawFecha} (Duplicado omitido)`);
                  continue;
              }
              seenInBatch.add(batchKey);

              const matchCaja = cajas.find(c => c.NumeroCaja.toUpperCase() === rawCaja);
              const matchDriver = drivers.find(d => d.driverId.toUpperCase() === rawDriver);

              const carrierPadre = matchCaja ? matchCaja.carrierCodigo : (matchDriver ? matchDriver.carrierCodigo : '');
              const transportId = matchDriver?.transportLineId || '';

              const asig: AsignacionCajaModel = {
                  fecha: rawFecha,
                  horaAsignacion: rawHora || new Date().toTimeString().substring(0, 5),
                  numeroOperacion: rawOperacion || '',
                  carrierCodigo: carrierPadre,
                  transportLineId: transportId,
                  numeroCaja: rawCaja,
                  subLinea: matchCaja ? matchCaja.nombreSubLinea || '' : '',
                  placasCaja: matchCaja ? matchCaja.placas || '' : '',
                  driverId: rawDriver,
                  nombreDriver: matchDriver ? matchDriver.nombre : rawDriver,
                  placasTracto: matchDriver ? matchDriver.placasTracto || '' : '',
                  modeloAsignado: rawModelo || '',
                  observaciones: rawObs || '',
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
              {t('asig.title')}
           </h1>
           <p className="text-slate-500 text-sm mt-1">{t('asig.subtitle')}</p>
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
                  {t('common.hoy')}
                </button>
                <Calendar size={14} className="text-slate-400 ml-2" />
                <input 
                    type="date"
                    value={dateRange.start}
                    onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                    className="py-2 px-2 text-sm outline-none text-slate-600 bg-transparent"
                    title={t('common.fecha_inicial')}
                />
                <span className="text-slate-300">-</span>
                <input 
                    type="date"
                    value={dateRange.end}
                    onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                    className="py-2 px-2 text-sm outline-none text-slate-600 bg-transparent"
                    title={t('common.fecha_final')}
                />
             </div>

             {!isEmbarques && selectedIds.size > 0 && (
                 <button onClick={handleMassDelete} className="px-3 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg border border-red-200 transition-colors shadow-sm flex items-center text-sm font-bold animate-fade-in" title="Eliminar Seleccionados">
                    <Trash2 size={16} className="mr-2" /> {t('btn.borrar')} ({selectedIds.size})
                 </button>
             )}

             <button onClick={() => setIsMassQueryOpen(true)} className={`px-4 py-2 flex items-center rounded-lg border text-sm font-medium transition-colors shadow-sm ${activeMassQuery ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
                 <Filter size={16} className="mr-2" />
                 {t('btn.mass')}
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
                <Download size={16} className="mr-2 text-slate-500" /> {t('btn.export')}
             </button>

             <button
               onClick={async () => { setIsRefreshing(true); await loadData(); setIsRefreshing(false); }}
               disabled={isRefreshing}
               className="px-3 py-2 bg-white text-slate-700 hover:bg-emerald-50 rounded-lg border border-slate-300 hover:border-emerald-400 transition-colors shadow-sm flex items-center text-sm font-medium disabled:opacity-60"
               title="Actualizar datos sin recargar la página"
             >
               <RefreshCw size={16} className={`mr-1.5 text-emerald-600 ${isRefreshing ? 'animate-spin' : ''}`} />
               {isRefreshing ? t('btn.actualizando') : t('btn.actualizar')}
             </button>

             {!isEmbarques && (
                 <button onClick={openNew} className="bg-blue-600 text-white px-4 py-2 flex items-center rounded-lg hover:bg-blue-700 shadow-md shadow-blue-500/30 transition-all font-medium text-sm">
                    <Plus size={18} className="mr-2" /> {t('btn.new')}
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
              <th className="p-4 font-medium min-w-[120px]">{renderColumnHeader(t('col.fecha'), 'fecha')}</th>
              <th className="p-4 font-medium min-w-[100px]">{renderColumnHeader(t('col.arribo'), 'arribo')}</th>
              <th className="p-4 font-medium min-w-[180px]">{renderColumnHeader(t('col.comentariosArribo'), 'comentariosArribo')}</th>
              <th className="p-4 font-medium min-w-[120px]">{renderColumnHeader(t('col.operacion'), 'numeroOperacion')}</th>
              <th className="p-4 font-medium min-w-[140px]">{renderColumnHeader(t('col.caja'), 'numeroCaja')}</th>
              <th className="p-4 font-medium">{renderColumnHeader(t('col.placascaja'), 'placasCaja')}</th>
              <th className="p-4 font-medium min-w-[160px] text-blue-600 uppercase text-xs">{renderColumnHeader(t('col.lineatransporte'), 'transportLineId')}</th>
              <th className="p-4 font-medium min-w-[140px]">{renderColumnHeader(t('col.driverid'), 'driverId')}</th>
              <th className="p-4 font-medium min-w-[140px]">{renderColumnHeader(t('col.driver'), 'nombreDriver')}</th>
              <th className="p-4 font-medium">{renderColumnHeader(t('col.placastracto'), 'placasTracto')}</th>
              <th className="p-4 font-medium min-w-[120px]">{renderColumnHeader(t('col.modelo'), 'modeloAsignado')}</th>
              <th className="p-4 font-medium min-w-[170px] text-violet-700 bg-violet-50/40 whitespace-nowrap">CREADO</th>
              <th className="p-4 font-medium text-center text-indigo-700 bg-indigo-50/30 whitespace-nowrap">LAYOUT</th>
              <th className="p-4 font-medium text-center text-sky-700 bg-sky-50/30 whitespace-nowrap">CCP</th>
              <th className="p-4 font-medium text-center text-emerald-700 bg-emerald-50/30 whitespace-nowrap">Anexo29</th>
              <th className="p-4 font-medium min-w-[100px]">{renderColumnHeader(t('col.sello'), 'selloLiberacion')}</th>
              <th className="p-4 font-medium text-red-800 bg-red-50/30 text-center">{t('col.cargado')}</th>
              <th className="p-4 font-medium text-teal-800 bg-teal-50/30 whitespace-nowrap">{t('col.sellado_time')}</th>
              <th className="p-4 font-medium text-slate-800 bg-slate-100/50">{t('col.observaciones')}</th>
              {!isEmbarques && <th className="p-4 font-medium text-right bg-slate-50">{t('btn.acciones')}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {filteredData.map((a, index) => {
              const liberacion = liberaciones.find(lib => lib.asignacionCajaId === a.id);
              const hasLiberacion = !!liberacion;

              // Base alternating stripe for visual consistency
              const isEven = index % 2 === 0;
              let rowColorClass = isEven ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/60 hover:bg-slate-100/60';

              // Urgency overlay (no-liberacion + overtime)
              if (!hasLiberacion && a.fecha && a.horaAsignacion) {
                  let timeStr = (a.horaAsignacion || '').toLowerCase().trim();
                  let isPM = timeStr.includes('pm') || timeStr.includes('p.m.');
                  let isAM = timeStr.includes('am') || timeStr.includes('a.m.');
                  let [hours, minutes] = timeStr.replace(/[a-z\s.]/g, '').split(':');
                  let h = parseInt(hours || '0', 10);
                  if (isPM && h < 12) h += 12;
                  if (isAM && h === 12) h = 0;
                  const asigDate = new Date(`${a.fecha}T${String(h).padStart(2, '0')}:${minutes || '00'}:00`);
                  if (!isNaN(asigDate.getTime())) {
                      const diffHours = (new Date().getTime() - asigDate.getTime()) / (1000 * 60 * 60);
                      if (diffHours > 4)  rowColorClass = 'bg-red-50 hover:bg-red-100 transition-colors';
                      else if (diffHours > 2) rowColorClass = 'bg-amber-50 hover:bg-amber-100 transition-colors';
                  }
              }

              if (selectedIds.has(a.id!)) rowColorClass = 'bg-blue-50/70';

              return (
              <tr key={a.id} className={rowColorClass}>
                <td className="p-4 bg-slate-50/30 border-r border-slate-100 text-center">
                    {!isEmbarques && <input type="checkbox" checked={selectedIds.has(a.id!)} onChange={() => toggleSelectRow(a.id!)} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer" />}
                </td>
                <td className="p-4 font-medium text-slate-700 border-r border-slate-100 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                       <span className="flex items-center gap-1.5"><Calendar size={12} className="text-blue-500" /> {a.fecha}</span>
                       {a.horaAsignacion && <span className="text-xs text-slate-400 font-mono">| {a.horaAsignacion}</span>}
                    </div>
                </td>
                <td className="p-4 font-mono text-amber-600 font-semibold whitespace-nowrap">{(a as any).arribo || '—'}</td>
                <td className="p-4 text-slate-500 text-xs max-w-[180px] truncate" title={(a as any).comentariosArribo || ''}>{(a as any).comentariosArribo || '—'}</td>
                
                <td className="p-4 font-mono text-pink-700 font-bold tracking-wide whitespace-nowrap">{a.numeroOperacion || '-'}</td>
                <td className="p-4 font-semibold text-emerald-700 font-mono tracking-wide">{a.numeroCaja}</td>
                <td className="p-4 font-mono text-slate-500 text-xs uppercase font-medium">{a.placasCaja || '-'}</td>
                
                <td className="p-4 text-xs font-bold text-blue-800 whitespace-nowrap">
                    {transportLines.find(tl => tl.transportLineId === a.transportLineId)?.nombreSubLinea || a.transportLineId || '-'}
                </td>

                <td className="p-4 font-mono text-orange-600 font-medium whitespace-nowrap">{a.driverId}</td>
                <td className="p-4 font-medium text-slate-800 whitespace-nowrap">{a.nombreDriver}</td>
                <td className="p-4 font-mono text-slate-500 text-xs uppercase font-medium whitespace-nowrap">{a.placasTracto || '-'}</td>
                <td className="p-4 font-medium text-slate-700 whitespace-nowrap">{a.modeloAsignado || '-'}</td>
                
                 <td className="p-4 bg-violet-50/20 border-l border-violet-100/50 whitespace-nowrap">
                     {(a as any).createdAt ? (
                         <div className="flex flex-col gap-0">
                             <span className="text-xs text-violet-700 font-mono">
                                 {new Date((a as any).createdAt).toLocaleDateString('es-MX', { timeZone: 'America/Monterrey', day: '2-digit', month: '2-digit', year: 'numeric' })}
                             </span>
                             <span className="text-[10px] text-slate-400 font-mono">
                                 {new Date((a as any).createdAt).toLocaleTimeString('es-MX', { timeZone: 'America/Monterrey', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                             </span>
                         </div>
                     ) : (
                         <span className="text-xs text-slate-300">—</span>
                     )}
                 </td>

                 {/* ── LAYOUT Excel ── (descarga forzada) */}
                 <td className="p-4 text-center bg-indigo-50/20 border-l border-indigo-100/50">
                   {uploadingFor?.id === a.id && uploadingFor.field === 'layoutUrl' ? (
                     <Loader2 size={18} className="animate-spin text-indigo-400 mx-auto" />
                   ) : a.layoutUrl ? (
                     <a href={toDriveDownload(a.layoutUrl)}
                        className="inline-flex items-center justify-center p-1.5 rounded-lg text-blue-600 hover:bg-blue-100 transition-colors"
                        title="Descargar LAYOUT" onClick={e => e.stopPropagation()}>
                       <FileText size={18} />
                     </a>
                   ) : (
                     <label className="inline-flex items-center justify-center p-1.5 rounded-lg text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 transition-colors cursor-pointer"
                            title="Subir LAYOUT (Excel)" onClick={e => e.stopPropagation()}>
                       <FileText size={18} />
                       <input type="file" accept=".xlsx,.xls,.csv" className="hidden"
                              onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadDoc(a.id!, 'layoutUrl', f, a.numeroCaja); e.target.value = ''; }} />
                     </label>
                   )}
                 </td>

                 {/* ── CCP PDF ── */}
                 <td className="p-4 text-center bg-sky-50/20 border-l border-sky-100/50">
                   {uploadingFor?.id === a.id && uploadingFor.field === 'ccpUrl' ? (
                     <Loader2 size={18} className="animate-spin text-sky-400 mx-auto" />
                   ) : a.ccpUrl ? (
                     <a href={a.ccpUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center justify-center p-1.5 rounded-lg text-blue-600 hover:bg-blue-100 transition-colors"
                        title="Ver CCP en Drive" onClick={e => e.stopPropagation()}>
                       <FileText size={18} />
                     </a>
                   ) : (
                     <label className="inline-flex items-center justify-center p-1.5 rounded-lg text-slate-300 hover:text-sky-500 hover:bg-sky-50 transition-colors cursor-pointer"
                            title="Subir CCP PDF" onClick={e => e.stopPropagation()}>
                       <FileText size={18} />
                       <input type="file" accept="application/pdf" className="hidden"
                              onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadDoc(a.id!, 'ccpUrl', f, a.numeroCaja); e.target.value = ''; }} />
                     </label>
                   )}
                 </td>

                 {/* ── Anexo29 PDF ── */}
                 <td className="p-4 text-center bg-emerald-50/20 border-l border-emerald-100/50">
                   {uploadingFor?.id === a.id && uploadingFor.field === 'anexo29Url' ? (
                     <Loader2 size={18} className="animate-spin text-emerald-400 mx-auto" />
                   ) : a.anexo29Url ? (
                     <a href={a.anexo29Url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center justify-center p-1.5 rounded-lg text-blue-600 hover:bg-blue-100 transition-colors"
                        title="Ver Anexo29 en Drive" onClick={e => e.stopPropagation()}>
                       <FileText size={18} />
                     </a>
                   ) : (
                     <label className="inline-flex items-center justify-center p-1.5 rounded-lg text-slate-300 hover:text-emerald-500 hover:bg-emerald-50 transition-colors cursor-pointer"
                            title="Subir Anexo29 PDF" onClick={e => e.stopPropagation()}>
                       <FileText size={18} />
                       <input type="file" accept="application/pdf" className="hidden"
                              onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadDoc(a.id!, 'anexo29Url', f, a.numeroCaja); e.target.value = ''; }} />
                     </label>
                   )}
                 </td>
                
                <td className="p-4 font-mono text-teal-700 font-bold whitespace-nowrap border-l border-teal-100/50 bg-teal-50/10">
                    {liberacion ? liberacion.selloValidado : '-'}
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

                <td className="p-4 font-mono text-xs text-teal-800 font-medium whitespace-nowrap">
                    {liberacion?.fechaHoraRegistro ? liberacion.fechaHoraRegistro : '-'}
                </td>
                
                <td className="p-4 text-xs text-slate-600 truncate max-w-[200px]" title={a.observaciones || ''}>
                    {a.observaciones || '-'}
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
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[110] animate-fade-in p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[92vh]">
            
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Navigation className="text-blue-600" size={20} />
                {isEditing ? 'Editar Asignación' : 'Relacionar Caja / Operador'}
              </h2>
              <button type="button" onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
              {/* Scrollable body */}
              <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
                
                {/* Row 1: Fecha / Hora / No. Operación */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Fecha Operativa</label>
                    <input type="date" required value={formData.fecha || ''} onChange={e => setFormData({...formData, fecha: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Hora (24h)</label>
                    <input type="time" required value={formData.horaAsignacion || ''} onChange={e => setFormData({...formData, horaAsignacion: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">No. Operación</label>
                    <input type="text" value={formData.numeroOperacion || ''} onChange={e => setFormData({...formData, numeroOperacion: e.target.value.toUpperCase()})} placeholder="Auto" className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-pink-500 outline-none font-mono uppercase" />
                  </div>
                </div>

                {/* Row 2: Two columns — Left: Carrier + Transport Line | Right: Caja + Driver */}
                <div className="grid grid-cols-2 gap-4">

                  {/* LEFT COLUMN */}
                  <div className="space-y-3">

                    {/* Carrier */}
                    <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-100 space-y-2">
                      <h3 className="text-xs font-bold text-indigo-800 uppercase flex items-center gap-1.5">
                        <Navigation size={12}/> Carrier Padre (SCAC)
                      </h3>
                      <SearchableComboBox
                        required
                        value={formData.carrierCodigo || ''}
                        onChange={val => setFormData({...formData, carrierCodigo: val, transportLineId: '', numeroCaja: '', driverId: '', subLinea: '', placasCaja: '', nombreDriver: '', placasTracto: ''})}
                        options={carriers.map(c => ({ value: c.codigo, label: c.nombre, sublabel: c.codigo }))}
                        placeholder="Seleccionar Carrier..."
                        disabled={!!scacFilter || !!subLineaFilter}
                      />
                    </div>

                    {/* Transport Line */}
                    <div className="p-3 bg-violet-50 rounded-xl border border-violet-100 space-y-2">
                      <h3 className="text-xs font-bold text-violet-800 uppercase flex items-center gap-1.5">
                        <Truck size={12}/> Línea de Transporte
                      </h3>
                      <SearchableComboBox
                        value={formData.transportLineId || ''}
                        onChange={val => setFormData({...formData, transportLineId: val, driverId: '', nombreDriver: '', placasTracto: ''})}
                        options={transportLines
                          .filter(tl => !formData.carrierCodigo || tl.carrierCodigo === formData.carrierCodigo)
                          .map(tl => ({ value: tl.transportLineId, label: tl.nombreSubLinea || tl.TransportLine }))}
                        placeholder={formData.carrierCodigo ? 'Seleccionar Sub-Línea...' : 'Selecciona un Carrier primero'}
                        disabled={!formData.carrierCodigo}
                      />
                    </div>

                    {/* Observaciones — fills empty left space */}
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                      <h3 className="text-xs font-bold text-slate-600 uppercase">Observaciones</h3>
                      <input
                        type="text"
                        maxLength={50}
                        value={formData.observaciones || ''}
                        onChange={e => setFormData({...formData, observaciones: e.target.value})}
                        placeholder="Opcional... (máx. 50 caracteres)"
                        className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>

                  </div>

                  {/* RIGHT COLUMN */}
                  <div className="space-y-3">

                    {/* Caja */}
                    <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100 space-y-2">
                      <h3 className="text-xs font-bold text-emerald-800 uppercase flex items-center gap-1.5">
                        <Container size={12}/> {t('form.caja_sec')}
                      </h3>
                      <SearchableComboBox
                        required
                        value={formData.numeroCaja || ''}
                        onChange={val => handleCajaChange(val)}
                        options={cajas
                          .filter(c => {
                            if (!formData.carrierCodigo) return false;
                            if (c.carrierCodigo !== formData.carrierCodigo) return false;
                            if (formData.transportLineId) {
                              const selectedTL = transportLines.find(tl => tl.transportLineId === formData.transportLineId);
                              const targetSubLinea = selectedTL?.nombreSubLinea?.trim().toUpperCase();
                              const cajaSubLinea = (c.nombreSubLinea || '').trim().toUpperCase();
                              if (targetSubLinea && cajaSubLinea !== targetSubLinea) return false;
                            }
                            return true;
                          })
                          .map(c => ({ value: c.NumeroCaja, label: c.NumeroCaja, sublabel: c.nombreSubLinea || '' }))}
                        placeholder={formData.transportLineId ? 'Seleccionar Caja...' : (formData.carrierCodigo ? 'Selecciona la Línea primero' : 'Selecciona un Carrier primero')}
                        disabled={!formData.carrierCodigo}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs text-emerald-700 mb-0.5">Sub-Línea</label>
                          <input disabled value={formData.subLinea || ''} className="w-full bg-emerald-100/50 border-transparent rounded p-1.5 text-xs text-emerald-800 font-medium" placeholder="Auto" />
                        </div>
                        <div>
                          <label className="block text-xs text-emerald-700 mb-0.5">Placas Caja</label>
                          <input disabled value={formData.placasCaja || ''} className="w-full bg-emerald-100/50 border-transparent rounded p-1.5 text-xs text-emerald-800 font-mono" placeholder="Auto" />
                        </div>
                      </div>
                    </div>

                    {/* Driver */}
                    <div className="p-3 bg-orange-50 rounded-xl border border-orange-100 space-y-2">
                      <h3 className="text-xs font-bold text-orange-800 uppercase flex items-center gap-1.5">
                        <Truck size={12}/> {t('form.tracto_sec')}
                      </h3>
                      <SearchableComboBox
                        required
                        value={formData.driverId || ''}
                        onChange={val => handleDriverChange(val)}
                        options={drivers
                          .filter(d => {
                            if (!formData.carrierCodigo) return false;
                            if (formData.transportLineId) return d.transportLineId === formData.transportLineId;
                            return d.carrierCodigo === formData.carrierCodigo;
                          })
                          .map(d => ({ value: d.driverId, label: d.nombre, sublabel: d.driverId }))}
                        placeholder={formData.transportLineId ? 'Seleccionar Driver...' : (formData.carrierCodigo ? 'Selecciona la Línea primero' : 'Selecciona un Carrier primero')}
                        disabled={!formData.carrierCodigo}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs text-orange-700 mb-0.5">Nombre</label>
                          <input disabled value={formData.nombreDriver || ''} className="w-full bg-orange-100/50 border-transparent rounded p-1.5 text-xs text-orange-800" placeholder="Auto" />
                        </div>
                        <div>
                          <label className="block text-xs text-orange-700 mb-0.5">Placas Tracto</label>
                          <input
                            value={formData.placasTracto || ''}
                            onChange={e => setFormData({...formData, placasTracto: e.target.value.toUpperCase()})}
                            className="w-full bg-white border border-orange-200 rounded p-1.5 text-xs text-orange-800 font-mono focus:ring-2 focus:ring-orange-400 outline-none"
                            placeholder="Ej. ABC-123"
                          />
                        </div>
                      </div>
                    </div>

                  </div>
                </div>

                {/* Row 3: Producto (Modelo) — full width */}
                <div className="p-3 bg-purple-50 rounded-xl border border-purple-100 space-y-2">
                  <h3 className="text-xs font-bold text-purple-800 uppercase flex items-center gap-1.5"><Box size={12}/> Producto (Modelo)</h3>
                  <MultiSearchableComboBox
                    options={modelosCaja.map((m: string) => ({ value: m, label: m }))}
                    value={formData.modeloAsignado ? formData.modeloAsignado.split(', ') : []}
                    onChange={values => setFormData({...formData, modeloAsignado: values.join(', ')})}
                    placeholder="Seleccionar modelos de producto..."
                  />
                </div>

              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 shrink-0 bg-slate-50 rounded-b-2xl">
                <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2 text-slate-600 font-medium hover:bg-slate-200 rounded-lg transition-colors">Cancelar</button>
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
