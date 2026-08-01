import React, { useState, useEffect, useMemo } from 'react';
import { Package, Search, Download, RefreshCw, Loader2, Calendar, Trash2 , ChevronUp, ChevronDown, UserCheck, FileText, UploadCloud, MessageCircle } from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { contratoService } from '../services/contratoService.ts';
import { asignacionCajaService } from '../services/asignacionCajaService.ts';
import { checkInService } from '../services/checkInService';
import { selloService } from '../services/selloService';
import { ContratoRecord } from '../types/contrato';
import { UserRole } from '../types.ts';
import { CheckInModel } from '../types/checkIn';
import { uploadFileToDrive } from '../services/googleDriveService.ts';
import * as XLSX from 'xlsx';

import { nowMX, todayMX, toMXDate } from '../utils/mexTime';

export const Embarques: React.FC = () => {
  const [data, setData] = useState<ContratoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);
  
  const [startDate, setStartDate] = useState(todayMX());
  const [endDate, setEndDate] = useState(todayMX());

  const [activeTab, setActiveTab] = useState<'TODOS' | 'CON_LAYOUT' | 'SIN_CIERREEMB' | 'CON_CCP' | 'CHECK_IN'>('TODOS');
  const [checkInsData, setCheckInsData] = useState<CheckInModel[]>([]);
  const [checkInFilter, setCheckInFilter] = useState<'ALL' | 'CON_CITA' | 'SIN_CITA' | 'CON_ERRORES'>('ALL');
  const [docks, setDocks] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
  const { user } = useAuth();
  const [isAssigning, setIsAssigning] = useState(false);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);

  const EMBARQUES_FOLDER_ID = '1ETyhI2Zddsw_btLBMIQGcYfhkrsmIEQj'; // mismo folder que Asignaciones

  const toDriveDownload = (viewUrl: string) => {
    const match = viewUrl.match(/\/d\/([^/]+)\//);  
    return match ? `https://drive.google.com/uc?export=download&id=${match[1]}` : viewUrl;
  };

  const handleUploadLayout = async (recordId: string, numeroCaja: string, file: File) => {
    try {
      setUploadingFor(recordId);
      const ext = file.name.split('.').pop() || 'file';
      const ts = nowMX().replace(/[:.-]/g, '');
      const filename = `LAYOUT_${numeroCaja}_${ts}.${ext}`;
      const result = await uploadFileToDrive(file, filename, EMBARQUES_FOLDER_ID);
      const url = result?.webViewLink || '';
      const uploadedBy = user?.email || 'sistema';
      const uploadedAt = nowMX();
      
      const extractId = (u: string) => {
        if (!u) return '';
        const parts = u.split('/d/');
        if (parts.length > 1) return parts[1].split(/[/?#]/)[0];
        const m = u.match(/[?&]id=([\w-]+)/);
        return m ? m[1] : '';
      };
      const driveFileId = result?.id || (result as any)?.fileId || extractId(url);

      let cfmRef = '';
      let vehiculos = '';

      if (file.name) {
        const rawName = file.name.replace(/\.[^/.]+$/, '');
        const pi = rawName.toUpperCase().indexOf('LAY OUT CCP_');
        if (pi !== -1) cfmRef = rawName.substring(pi + 12).trim();
      }

      try {
        const { read } = await import('xlsx');
        const buffer = await file.arrayBuffer();
        const wb = read(buffer, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        if (sheet && sheet['D27']?.v !== undefined) vehiculos = String(sheet['D27'].v).trim();
      } catch (err) {
        console.warn('[Layout Embarques] Local parse error:', err);
      }

      // Construir la cadena de sincronización con Asignación (secuencial internamente, paralela con el update del contrato)
      const record = data.find(d => d.id === recordId);
      const asigChain: Promise<any> = record?.numeroOperacion
        ? asignacionCajaService.getAsignacionByNumeroOperacion(record.numeroOperacion).then(async asigDoc => {
            if (asigDoc && asigDoc.id) {
              const asigUpdates: any = {
                layoutUrl: url,
                layoutUploadedBy: uploadedBy,
                layoutUploadedAt: uploadedAt,
                layoutFileName: file.name,
                layoutFileId: driveFileId,
                ...(cfmRef ? { cfmRef } : {}),
                ...(vehiculos ? { vehiculos } : {}),
              };
              await asignacionCajaService.updateAsignacion(asigDoc.id, asigUpdates);
              if (cfmRef) {
                const { storageService } = await import('../services/storageService');
                await storageService.upsertHistoricoExpos([{ id: `exp_${asigDoc.id}`, cfmRef } as any]);
              }
            }
          })
        : Promise.resolve();

      // Correr en paralelo: update del contrato + toda la cadena de asignación
      await Promise.all([
        contratoService.updateContrato(recordId, {
          layoutUrl: url,
          layoutUploadedBy: uploadedBy,
          layoutUploadedAt: uploadedAt,
          layoutFileName: file.name,
        }),
        asigChain
      ]);

      setData(prev => prev.map(d => d.id === recordId ? { ...d, layoutUrl: url, layoutUploadedBy: uploadedBy, layoutUploadedAt: uploadedAt, layoutFileName: file.name } : d));
    } catch (e: any) {
      alert(`Error subiendo LAYOUT: ${e.message}`);
    } finally {
      setUploadingFor(null);
    }
  };

  const handleUploadCCP = async (recordId: string, numeroCaja: string, file: File) => {
    try {
      setUploadingFor(recordId);
      const uploadResult = await uploadFileToDrive(file, `CCP_${numeroCaja}`);
      const { url, id: driveFileId } = uploadResult as any;
      const uploadedBy = user?.email || user?.name || 'Desconocido';
      const uploadedAt = nowMX();

      // Sincronizar con Asignación Diaria de Cajas
      const record = data.find(d => d.id === recordId);
      let asigPromise: Promise<any> = Promise.resolve();
      if (record && record.numeroOperacion) {
        asigPromise = asignacionCajaService.getAsignacionByNumeroOperacion(record.numeroOperacion).then(asigDoc => {
          if (asigDoc && asigDoc.id) {
            const asigUpdates: any = {
              ccpUrl: url,
              ccpUploadedBy: uploadedBy,
              ccpUploadedAt: uploadedAt,
              ccpFileName: file.name,
              ccpFileId: driveFileId,
            };
            return asignacionCajaService.updateAsignacion(asigDoc.id, asigUpdates);
          }
        });
      }

      await Promise.all([
        contratoService.updateContrato(recordId, {
          ccpUrl: url || (uploadResult as any).webViewLink,
          ccpUploadedBy: uploadedBy,
          ccpUploadedAt: uploadedAt,
          ccpFileName: file.name
        }),
        asigPromise
      ]);

      setData(prev => prev.map(d => d.id === recordId ? { ...d, ccpUrl: url, ccpUploadedBy: uploadedBy, ccpUploadedAt: uploadedAt, ccpFileName: file.name } : d));
    } catch (e: any) {
      alert(`Error subiendo CCP: ${e.message}`);
    } finally {
      setUploadingFor(null);
    }
  };

  const handleCierreRow = async (id: string) => {
    try {
      await contratoService.updateContrato(id, { cerrado: true });
      setData(prev => prev.map(d => d.id === id ? { ...d, cerrado: true } : d));
    } catch (error) {
      console.error(error);
      alert('Error cerrando el registro');
    }
  };

  const handleAssign = async () => {
    if (selectedIds.size === 0) return;
    setIsAssigning(true);
    const assigneeName = user?.email || user?.name || 'Desconocido';
    try {
      for (const id of selectedIds) {
        await contratoService.updateContrato(id, { asignadoA: assigneeName });
      }
      await fetchData();
      setSelectedIds(new Set());
    } catch (error) {
      console.error("Error assigning records:", error);
      alert("Hubo un error al asignar los registros.");
    } finally {
      setIsAssigning(false);
    }
  };


  const fetchData = async () => {
    setLoading(true);
    setSelectedIds(new Set());
    try {
      const [asigData, asignaciones, sellos, checkIns] = await Promise.all([
        contratoService.getContratosByDateRange(startDate, endDate),
        asignacionCajaService.getAsignacionesByDateRange(startDate, endDate).catch(() => []),
        selloService.getSellosByDateRange(startDate, endDate).catch(() => []),
        checkInService.getUnprocessedCheckIns().catch(() => [])
      ]);
      
      // O(1) Lookup Maps for faster merging (Phase 1 Optimization)
      const asigMap = new Map<string, typeof asignaciones[0]>();
      asignaciones.forEach(a => {
        if (a.numeroOperacion) {
          asigMap.set(a.numeroOperacion, a);
        }
      });

      const sellosMap = new Map<string, typeof sellos[0]>();
      const sellosByCajaDateMap = new Map<string, typeof sellos[0]>();
      sellos.forEach(s => {
        if (s.asignacionCajaId) sellosMap.set(s.asignacionCajaId, s);
        if (s.numeroCaja && s.fechaAsignacion) {
          sellosByCajaDateMap.set(`${s.numeroCaja}_${s.fechaAsignacion}`, s);
        }
      });
      
      const mergedData = asigData.map(c => {
        const a = asigMap.get(c.numeroOperacion || '');
        
        let selloFinal = c.selloAsignado;
        if (!selloFinal && a) {
           let sRow = sellosMap.get(a.id || '');
           if (!sRow) {
             sRow = sellosByCajaDateMap.get(`${a.numeroCaja}_${a.fecha}`);
           }
           if (sRow) selloFinal = sRow.selloAsignado;
        }

        return { 
          ...c, 
          selloAsignado: selloFinal,
          scac: (a as any)?.scac || a?.carrierCodigo || '',
          carrierRef: a?.carrierRef || '',
          observaciones: a?.observaciones || ''
        };
      });
      
      // DEDUPLICATION GUARD: Remove exact Firestore document duplicates by ID
      const deduped = Array.from(new Map(mergedData.map(r => [r.id, r])).values());
      
      setData(deduped);
      setCheckInsData(checkIns);
      
      const initialDocks: Record<string, string> = {};
      checkIns.forEach(c => {
        if (c.id && c.dockAsignado) initialDocks[c.id] = c.dockAsignado;
      });
      setDocks(initialDocks);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const safeFetch = async () => {
      if (cancelled) return;
      await fetchData();
    };

    safeFetch();

    const handleRefresh = () => {
      safeFetch();
    };

    window.addEventListener('data:refresh', handleRefresh);
    // NOTE: 'reserva:changed' was intentionally removed — it's dispatched
    // by AsignacionesDiarias on every date change, causing infinite reload loops.

    return () => {
      cancelled = true;
      window.removeEventListener('data:refresh', handleRefresh);
    };
  }, [startDate, endDate]);

  const filteredData = useMemo(() => {
    return data.filter(item => {
      if (activeTab === 'CON_LAYOUT' && !item.layoutUrl) return false;
      if (activeTab === 'CON_CCP' && !item.ccpUrl) return false;
      if (activeTab === 'SIN_CIERREEMB' && item.cerrado) return false;

      if (debouncedSearchTerm) {
        const term = debouncedSearchTerm.toLowerCase();
        const sello = (item.selloAsignado || '').toLowerCase();
        const match = (item.numeroOperacion || '').toLowerCase().includes(term) ||
                      (item.numeroCaja || '').toLowerCase().includes(term) ||
                      (item.contrato || '').toLowerCase().includes(term) ||
                      sello.includes(term);
        if (!match) return false;
      }
      return true;
    });
  }, [data, activeTab, debouncedSearchTerm]);

  const sortedData = useMemo(() => {
    const sorted = [...filteredData];
    if (sortConfig) {
      sorted.sort((a, b) => {
        let valA: string = (a[sortConfig.key as keyof ContratoRecord] || '').toString().toLowerCase();
        let valB: string = (b[sortConfig.key as keyof ContratoRecord] || '').toString().toLowerCase();

        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sorted;
  }, [filteredData, sortConfig]);

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
            ? <ChevronUp size={14} className="text-indigo-600" /> 
            : <ChevronDown size={14} className="text-indigo-600" />;
    }
    return <ChevronUp size={14} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />;
  };

  const SortableHeader = ({ label, sortKey, className = "" }: { label: string, sortKey: string, className?: string }) => (
    <th className={`py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200 ${className}`}>
      <div 
        onClick={() => handleSort(sortKey)} 
        className={`flex items-center gap-1 cursor-pointer hover:text-indigo-600 transition-colors group select-none ${className.includes('text-center') ? 'justify-center' : ''} ${sortConfig?.key === sortKey ? 'text-indigo-700 font-bold' : ''}`}
      >
        {label}
        {renderSortIcon(sortKey)}
      </div>
    </th>
  );

  // toggleSelectAll moved down below filteredCheckIns

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleAssignDock = async (checkInId: string) => {
    const dock = docks[checkInId];
    if (!dock) return;
    try {
      const checkIn = checkInsData.find(c => c.id === checkInId);
      if (!checkIn) return;
      
      await checkInService.markAsProcessed(checkInId, dock);
      
      if (checkIn.asignacionCajaId) {
        const getNowTime = () => {
          const now = new Date();
          return now.toLocaleTimeString('es-MX', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: 'America/Mexico_City'
          });
        };
        await asignacionCajaService.updateAsignacion(checkIn.asignacionCajaId, {
           arribo: getNowTime(),
           arriboAt: nowMX(),
           arriboBy: user?.email || 'Embarques',
           dockArribo: dock,
           checkInStatus: checkIn.checkInStatus
        } as any);
      }
      
      alert('Dock asignado y Arribo registrado exitosamente.');
      await fetchData();
    } catch (e) {
      alert('Error asignando dock');
    }
  };

  const filteredCheckIns = checkInsData.filter(a => {
    // Use toMXDate to convert any stored timestamp to Mexico local date before comparing
    const checkInDate = toMXDate(a.checkInAt || '');
    if (checkInDate && (checkInDate < startDate || checkInDate > endDate)) return false;

    if (checkInFilter === 'CON_CITA') {
      if (a.checkInStatus && a.checkInStatus !== 'PUNTUAL / OK') return false;
    } else if (checkInFilter === 'SIN_CITA') {
      if (a.checkInStatus !== 'SIN CITA') return false;
    } else if (checkInFilter === 'CON_ERRORES') {
      if (a.checkInStatus !== 'CITA CON POSIBLE ERROR') return false;
    }

    if (debouncedSearchTerm) {
      const term = debouncedSearchTerm.toLowerCase();
      const match = (a.numeroOperacion || '').toLowerCase().includes(term) ||
                    (a.numeroCaja || '').toLowerCase().includes(term) ||
                    (a.placasTracto || '').toLowerCase().includes(term) ||
                    (a.transportista || '').toLowerCase().includes(term);
      if (!match) return false;
    }
    return true;
  });

  const toggleSelectAll = () => {
    if (activeTab === 'CHECK_IN') {
      if (selectedIds.size === filteredCheckIns.length && filteredCheckIns.length > 0) {
        setSelectedIds(new Set());
      } else {
        setSelectedIds(new Set(filteredCheckIns.map(item => item.id!)));
      }
    } else {
      if (selectedIds.size === sortedData.length && sortedData.length > 0) {
        setSelectedIds(new Set());
      } else {
        setSelectedIds(new Set(sortedData.map(item => item.id!)));
      }
    }
  };

  const handleDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`¿Estás seguro de que deseas eliminar ${selectedIds.size} registro(s)?`)) return;

    setIsDeleting(true);
    try {
      if (activeTab === 'CHECK_IN') {
        for (const id of selectedIds) {
          await checkInService.deleteCheckIn(id);
        }
      } else {
        for (const id of selectedIds) {
          await contratoService.deleteContrato(id);
        }
      }
      setSelectedIds(new Set());
      await fetchData();
    } catch (error) {
      console.error("Error deleting records:", error);
      alert("Hubo un error al eliminar los registros.");
    } finally {
      setIsDeleting(false);
    }
  };

  const exportToExcel = () => {
    const exportData = sortedData.map(item => ({
      'NO. OPERACIÓN': item.numeroOperacion || '',
      'NÚMERO CAJA': item.numeroCaja || '',
      'SELLO ASIGNADO': item.selloAsignado || '',
      'CONTRATO': item.contrato || '',
      'ASIGNADO': item.asignadoA || ''
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Embarques');
    XLSX.writeFile(wb, `Embarques_${startDate}_al_${endDate}.xlsx`);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 w-full overflow-hidden relative">
      {/* Header */}
      <div className="shrink-0 px-6 py-6 border-b border-slate-200 bg-white">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl shrink-0">
            <Package size={24} />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">Embarques</h1>
            <p className="text-slate-500 text-sm mt-1">
              Revisión de Contratos y datos de Embarque.
            </p>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="shrink-0 px-6 py-4 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-4">
        
        <div className="flex items-center gap-4">
          {/* Tabs */}
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('TODOS')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
                activeTab === 'TODOS' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
              }`}
            >
              Todos <span className="bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded text-[10px] font-bold">{data.length}</span>
            </button>
            <button
              onClick={() => setActiveTab('CON_LAYOUT')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
                activeTab === 'CON_LAYOUT' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
              }`}
            >
              Con Layout <span className="bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded text-[10px] font-bold">{data.filter(d => !!d.layoutUrl).length}</span>
            </button>
            <button
              onClick={() => setActiveTab('CON_CCP')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
                activeTab === 'CON_CCP' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
              }`}
            >
              Con CCP <span className="bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded text-[10px] font-bold">{data.filter(d => !!d.ccpUrl).length}</span>
            </button>
            <button
              onClick={() => setActiveTab('SIN_CIERREEMB')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
                activeTab === 'SIN_CIERREEMB' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
              }`}
            >
              Sin CierreEmb <span className="bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded text-[10px] font-bold">{data.filter(d => !d.cerrado).length}</span>
            </button>
            <button
              onClick={() => setActiveTab('CHECK_IN')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
                activeTab === 'CHECK_IN' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
              }`}
            >
              Check in <span className={`${activeTab === 'CHECK_IN' ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-600'} px-1.5 py-0.5 rounded text-[10px] font-bold`}>
                {checkInsData.filter(a => {
                  const d = toMXDate(a.checkInAt || '');
                  return !d || (d >= startDate && d <= endDate);
                }).length}
              </span>
            </button>
          </div>
          
          {activeTab === 'CHECK_IN' && (
            <select
              value={checkInFilter}
              onChange={(e) => setCheckInFilter(e.target.value as any)}
              className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-700 focus:outline-none focus:border-indigo-500"
            >
              <option value="ALL">Todos los estatus</option>
              <option value="CON_CITA">Con Cita</option>
              <option value="SIN_CITA">Sin Cita</option>
              <option value="CON_ERRORES">Con Errores</option>
            </select>
          )}

          {selectedIds.size > 0 && (
            <>
              <button
                onClick={handleDelete}
                disabled={isDeleting || isAssigning || (user?.role !== UserRole.ADMIN && user?.role !== UserRole.EXPO_COORDINATOR)}
                title={(user?.role !== UserRole.ADMIN && user?.role !== UserRole.EXPO_COORDINATOR) ? "Sólo el administrador o Expo Coordinator pueden borrar" : ""}
                className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {isDeleting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                Borrar ({selectedIds.size})
              </button>
              {activeTab !== 'CHECK_IN' && (
                <button
                  onClick={handleAssign}
                  disabled={isDeleting || isAssigning}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {isAssigning ? <Loader2 size={18} className="animate-spin" /> : <UserCheck size={18} />}
                  Asignar ({selectedIds.size})
                </button>
              )}
            </>
          )}
        </div>

        {/* Search & Actions */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text"
              placeholder="Buscar caja, OP o contrato..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-64"
            />
          </div>

          <div className="flex items-center bg-white border border-slate-300 rounded-lg overflow-hidden">
            <button
              onClick={() => {
                const today = getMexicoDateString();
                setStartDate(today);
                setEndDate(today);
              }}
              className="px-3 py-2 text-xs font-bold text-indigo-600 bg-indigo-50 border-r border-slate-300 hover:bg-indigo-100 transition-colors"
            >
              HOY
            </button>
            <div className="px-3 py-2 border-r border-slate-300 bg-slate-50 text-slate-500">
              <Calendar size={18} />
            </div>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="px-3 py-2 text-sm focus:outline-none"
            />
            <span className="text-slate-400">-</span>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="px-3 py-2 text-sm focus:outline-none"
            />
          </div>

          <button 
            onClick={fetchData}
            className="p-2 text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            title="Recargar"
          >
            <RefreshCw size={18} className={loading ? "animate-spin text-indigo-500" : ""} />
          </button>
          
          <button 
            onClick={exportToExcel}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-sm font-medium transition-colors"
          >
            <Download size={18} />
            Exportar
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 relative p-6">
        <div className="absolute inset-x-6 inset-y-0 bottom-6 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto">
            {activeTab === 'CHECK_IN' ? (
              <table className="w-full text-left border-collapse min-w-max">
                <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="py-3 px-4 w-12 border-b border-slate-200">
                      <input 
                        type="checkbox" 
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        checked={filteredCheckIns.length > 0 && selectedIds.size === filteredCheckIns.length}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">Arribo</th>
                    <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">No. Operación</th>
                    <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">Caja / Placas</th>
                    <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">Línea</th>
                    <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">SCAC</th>
                    <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">Carrier Ref</th>
                    <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">Estatus</th>
                    <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-right">Asignar Dock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center">
                        <Loader2 className="animate-spin text-indigo-500 mx-auto" size={32} />
                        <p className="text-slate-500 mt-2 text-sm">Cargando check-ins...</p>
                      </td>
                    </tr>
                  ) : filteredCheckIns.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-500">
                        No hay check-ins registrados en estas fechas.
                      </td>
                    </tr>
                  ) : (
                    filteredCheckIns.map(a => (
                      <tr key={a.id} className={`transition-colors ${selectedIds.has(a.id!) ? 'bg-indigo-50/50' : 'hover:bg-slate-50/50'}`}>
                        <td className="py-3 px-4 border-b border-slate-100">
                          <input 
                            type="checkbox" 
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            checked={selectedIds.has(a.id!)}
                            onChange={() => toggleSelect(a.id!)}
                          />
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-semibold text-slate-700">{new Date(a.checkInAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit'})}</span>
                          <div className="text-xs text-slate-400">{new Date(a.checkInAt).toLocaleDateString('es-MX')}</div>
                          {a.horaAgendada && (
                            <div className="mt-1 text-[10px] bg-slate-100 text-slate-500 px-1 py-0.5 rounded inline-block">
                              Cita: {a.horaAgendada}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-sm">
                          <div>{a.numeroOperacion}</div>
                          {a.fechaAgendada && <div className="text-[10px] text-slate-400">{a.fechaAgendada}</div>}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold">{a.numeroCaja} <span className="text-slate-400 font-normal">/ {a.placasTracto || 'S/N'}</span></div>
                          {a.nombreDriver && <div className="text-xs text-slate-500 truncate max-w-[150px]" title={a.nombreDriver}>{a.nombreDriver}</div>}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-sm truncate max-w-[200px]" title={a.transportista}>{a.transportista || 'N/A'}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-sm font-mono text-slate-600">{a.scac || 'N/A'}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-sm text-slate-600">{a.carrierRef || 'S/N'}</div>
                        </td>
                        <td className="py-3 px-4">
                          {a.checkInStatus === 'SIN CITA' ? (
                            <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-bold">SIN CITA</span>
                          ) : a.checkInStatus === 'CITA CON POSIBLE ERROR' ? (
                            <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs font-bold">POSIBLE ERROR</span>
                          ) : (
                            <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-xs font-bold">{a.checkInStatus || 'OK'}</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right flex items-center justify-end gap-2">
                          <select
                            value={docks[a.id!] || ''}
                            onChange={(e) => setDocks({ ...docks, [a.id!]: e.target.value })}
                            className="border border-slate-300 rounded px-2 py-1 text-sm bg-white"
                          >
                            <option value="">Seleccionar Dock</option>
                            {Array.from({ length: 13 }, (_, i) => `DOCK ${i + 1}`).map(d => (
                              <option key={d} value={d}>{d}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleAssignDock(a.id!)}
                            disabled={!docks[a.id!]}
                            className="px-3 py-1 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50"
                          >
                            Guardar
                          </button>
                          <button
                            onClick={() => {
                              const dockStr = docks[a.id!] || '___';
                              const numDock = dockStr.replace('DOCK ', '');
                              const text = `Chofer: ${a.nombreDriver || 'N/A'}\nNo. Operación: ${a.numeroOperacion || 'S/N'}\nCaja: ${a.numeroCaja || 'S/N'}\nIngresar a Dock: ${numDock}\nPlanta: 5`;
                              window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                            }}
                            title="Notificar por WhatsApp"
                            className="p-1.5 bg-[#25D366] text-white rounded hover:bg-[#128C7E] transition-colors shadow-sm"
                          >
                            <MessageCircle size={18} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-left border-collapse min-w-max">
                <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="py-3 px-4 w-12 border-b border-slate-200">
                    <input 
                      type="checkbox" 
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      checked={sortedData.length > 0 && selectedIds.size === sortedData.length}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <SortableHeader label="No. Operación" sortKey="numeroOperacion" />
                  <SortableHeader label="Registro" sortKey="createdAt" />
                  <SortableHeader label="Caja" sortKey="numeroCaja" />
                  <SortableHeader label="Sello Asignado" sortKey="selloAsignado" />
                  <SortableHeader label="Carrier Ref" sortKey="carrierRef" />
                  <SortableHeader label="Observaciones" sortKey="observaciones" />
                  <SortableHeader label="SCAC" sortKey="scac" />
                  <SortableHeader label="Contrato" sortKey="contrato" />
                  <SortableHeader label="LAYOUT" sortKey="layoutUrl" className="text-center bg-indigo-50/40" />
                  <SortableHeader label="CCP" sortKey="ccpUrl" className="text-center bg-sky-50/40" />
                  <SortableHeader label="Asignado" sortKey="asignadoA" />
                  <SortableHeader label="CIERREEMB" sortKey="cerrado" className="text-center" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={13} className="py-12 text-center">
                      <Loader2 className="animate-spin text-indigo-500 mx-auto" size={32} />
                      <p className="text-slate-500 mt-2 text-sm">Cargando contratos...</p>
                    </td>
                  </tr>
                ) : sortedData.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="py-12 text-center text-slate-500">
                      No se encontraron registros en estas fechas.
                    </td>
                  </tr>
                ) : (
                  sortedData.map((item) => (
                    <tr 
                      key={item.id} 
                      className={`hover:bg-slate-50 transition-colors ${item.cerrado ? 'bg-emerald-50/60' : selectedIds.has(item.id!) ? 'bg-indigo-50/30' : ''}`}
                    >
                      <td className="py-3 px-4">
                        <input 
                          type="checkbox"
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          checked={selectedIds.has(item.id!)}
                          onChange={() => toggleSelect(item.id!)}
                        />
                      </td>
                      <td className="py-3 px-4 text-sm font-medium text-slate-900">
                        {item.numeroOperacion || '-'}
                      </td>
                      <td className="py-3 px-4">
                        {item.createdAt ? (
                          <div className="flex flex-col">
                            <span className="text-sm font-semibold text-slate-700">
                              {new Date(item.createdAt).toLocaleDateString('es-MX', { timeZone: 'America/Monterrey' })}
                            </span>
                            <span className="text-xs text-slate-500 font-mono">
                              {new Date(item.createdAt).toLocaleTimeString('es-MX', { timeZone: 'America/Monterrey', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        ) : (
                          <span className="text-sm text-slate-400">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-sm font-medium text-slate-900">
                        {item.numeroCaja || '-'}
                      </td>
                      <td className="py-3 px-4 text-sm font-medium text-slate-900">
                        {item.selloAsignado || '-'}
                      </td>
                      <td className="py-3 px-4 text-sm font-medium text-slate-900">
                        {item.carrierRef || '-'}
                      </td>
                      <td className="py-3 px-4 text-sm text-slate-600 max-w-xs truncate" title={item.observaciones}>
                        {item.observaciones || '-'}
                      </td>
                      <td className="py-3 px-4 text-sm font-medium text-orange-600">
                        {item.scac || '-'}
                      </td>
                      <td className="py-3 px-4 text-sm">
                        {item.contrato ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 font-medium border border-emerald-100">
                            {item.contrato}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Sin capturar</span>
                        )}
                      </td>
                      {/* LAYOUT */}
                      <td className="py-3 px-4 text-center bg-indigo-50/20 border-l border-indigo-100/50">
                        {uploadingFor === item.id ? (
                          <Loader2 size={18} className="animate-spin text-indigo-400 mx-auto" />
                        ) : item.layoutUrl ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <div className="flex items-center justify-center gap-1">
                              <a href={toDriveDownload(item.layoutUrl)} target="_blank" rel="noreferrer"
                                 className="inline-flex items-center justify-center p-1.5 rounded-lg text-blue-600 hover:bg-blue-100 transition-colors"
                                 title="Descargar LAYOUT">
                                <FileText size={18} />
                              </a>
                              <label className="inline-flex items-center justify-center p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-100 transition-colors cursor-pointer"
                                     title="Reemplazar LAYOUT">
                                <UploadCloud size={16} />
                                <input type="file" accept=".xlsx,.xls,.csv" className="hidden"
                                       onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadLayout(item.id!, item.numeroCaja, f); e.target.value = ''; }} />
                              </label>
                            </div>
                            {item.layoutUploadedAt && (
                              <span className="text-[10px] text-indigo-400 font-mono whitespace-nowrap">
                                {new Date(item.layoutUploadedAt).toLocaleDateString('es-MX', { timeZone: 'America/Monterrey', day: '2-digit', month: '2-digit' })} {new Date(item.layoutUploadedAt).toLocaleTimeString('es-MX', { timeZone: 'America/Monterrey', hour: '2-digit', minute: '2-digit', hour12: false })}
                              </span>
                            )}
                          </div>
                        ) : (
                          <label className="inline-flex items-center justify-center p-1.5 rounded-lg text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 transition-colors cursor-pointer"
                                 title="Subir LAYOUT (Excel)">
                            <FileText size={18} />
                            <input type="file" accept=".xlsx,.xls,.csv" className="hidden"
                                   onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadLayout(item.id!, item.numeroCaja, f); e.target.value = ''; }} />
                          </label>
                        )}
                      </td>
                      {/* CCP */}
                      <td className="py-3 px-4 text-center bg-sky-50/20 border-l border-sky-100/50">
                        {uploadingFor === item.id ? (
                          <Loader2 size={18} className="animate-spin text-sky-400 mx-auto" />
                        ) : item.ccpUrl ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <div className="flex items-center justify-center gap-1">
                              <a href={toDriveDownload(item.ccpUrl)} target="_blank" rel="noreferrer"
                                 className="inline-flex items-center justify-center p-1.5 rounded-lg text-blue-600 hover:bg-blue-100 transition-colors"
                                 title="Descargar CCP">
                                <FileText size={18} />
                              </a>
                              <label className="inline-flex items-center justify-center p-1.5 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-100 transition-colors cursor-pointer"
                                     title="Reemplazar CCP">
                                <UploadCloud size={16} />
                                <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden"
                                       onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadCCP(item.id!, item.numeroCaja, f); e.target.value = ''; }} />
                              </label>
                            </div>
                            {item.ccpUploadedAt && (
                              <span className="text-[10px] text-sky-500 font-mono whitespace-nowrap">
                                {new Date(item.ccpUploadedAt).toLocaleDateString('es-MX', { timeZone: 'America/Monterrey', day: '2-digit', month: '2-digit' })} {new Date(item.ccpUploadedAt).toLocaleTimeString('es-MX', { timeZone: 'America/Monterrey', hour: '2-digit', minute: '2-digit', hour12: false })}
                              </span>
                            )}
                          </div>
                        ) : (
                          <label className="inline-flex items-center justify-center p-1.5 rounded-lg text-slate-300 hover:text-sky-500 hover:bg-sky-50 transition-colors cursor-pointer"
                                 title="Subir CCP">
                            <FileText size={18} />
                            <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden"
                                   onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadCCP(item.id!, item.numeroCaja, f); e.target.value = ''; }} />
                          </label>
                        )}
                      </td>
                      <td className="py-3 px-4 text-sm text-slate-500">
                        {item.asignadoA ? (
                          <span className="flex items-center gap-1"><UserCheck size={14} className="text-indigo-400" /> {item.asignadoA}</span>
                        ) : (
                          <span className="text-slate-300 italic">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center border-l border-slate-100">
                        {item.cerrado ? (
                          <span className="inline-block px-2 py-1 bg-emerald-100 text-emerald-700 font-bold text-xs rounded tracking-wider">CERRADO</span>
                        ) : selectedIds.has(item.id!) ? (
                          <button
                            onClick={() => handleCierreRow(item.id!)}
                            className="px-3 py-1 bg-emerald-600 text-white rounded text-xs font-semibold hover:bg-emerald-700 shadow-sm transition-colors"
                          >
                            CIERRE
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
