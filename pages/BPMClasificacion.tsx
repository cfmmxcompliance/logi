import React, { useState, useEffect, useMemo, useRef } from 'react';
import { DownloadCloud, UploadCloud, Search, Image as ImageIcon, CheckCircle, RefreshCcw, Loader2, Edit3, Trash2 } from 'lucide-react';
import { bpmService } from '../services/bpmService';
import { BPMRecord, UserRole } from '../types.ts';
import * as xlsx from 'xlsx';
import { useAuth } from '../context/AuthContext.tsx';
import { CatalogQueryBuilder, QueryCondition, evaluateCondition } from '../components/CatalogQueryBuilder';

const TEMPLATE_HEADERS = [
  'Ref No', 'part no', 'Description(CN)', 'Description(EN)', 
  'material（CN）', 'material （EN）', 'function（CN）', 'function （EN）', 
  'Net Weight(KGs)', 'Can be imported or not', 'RRYNAS', 'Remarks', 
  'Certification', 'SPANISH DESCRIPTION', 'U.M', 'HTS', 'PROSEC', 
  'R8', 'REGIMEN', 'SENSIBLE', 'IGI', 'CLAVESAT',
  'TypeMaterial', 'HTSMXBASE', 'HTSMXNICO', 'DESCRIPCION_R8', 'COMPANY'
];

export const BPMClasificacion = () => {
  const { user } = useAuth();
  const [data, setData] = useState<BPMRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadingPhotoRow, setUploadingPhotoRow] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [selectedPhotoBpmId, setSelectedPhotoBpmId] = useState<string | null>(null);

  // Mass Query State
  const [isMassQueryOpen, setIsMassQueryOpen] = useState(false);
  const [queryConditions, setQueryConditions] = useState<QueryCondition[]>([
      { id: '1', column: 'folio_seguimiento', operator: 'in', type: 'string', input: '' }
  ]);
  const [activeMassQuery, setActiveMassQuery] = useState<QueryCondition[] | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkEditModalOpen, setIsBulkEditModalOpen] = useState(false);
  const [bulkEditField, setBulkEditField] = useState<string>('');
  const [bulkEditValue, setBulkEditValue] = useState('');
  
  // Row Edit State
  const [editingRow, setEditingRow] = useState<BPMRecord | null>(null);

  const bpmColumns = [
    'folio_seguimiento', 'secuencia_lote', 'ref_no', 'part_no', 'description_cn', 'description_en',
    'material_cn', 'material_en', 'function_cn', 'function_en', 'net_weight', 'imported_or_not',
    'rrynas', 'remarks', 'certification', 'spanish_description', 'um', 'hts', 'prosec', 'r8', 'regimen', 'sensible', 'igi', 'clavesat',
    'type_material', 'hts_base', 'hts_nico', 'descripcion_r8', 'company'
  ];

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const records = await bpmService.getAllBPMs();
      // Sort by Date Descending roughly (using folio)
      records.sort((a, b) => (b.folio_seguimiento || '').localeCompare(a.folio_seguimiento || ''));
      setData(records);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const processSearchStr = (query: string) => {
    return query.split(',').map(s => s.trim().toLowerCase()).filter(s => s.length > 0);
  };

  const filteredData = useMemo(() => {
    let result = data;
    
    // Apply local text search
    if (searchQuery.trim()) {
      const terms = processSearchStr(searchQuery);
      result = result.filter(item => {
        return terms.some(term => {
          return (item.part_no?.toLowerCase() || '').includes(term) ||
                 (item.folio_seguimiento?.toLowerCase() || '').includes(term) ||
                 (item.hts?.toLowerCase() || '').includes(term);
        });
      });
    }

    // Apply Catalog Query Builder (Mass Query)
    if (activeMassQuery && activeMassQuery.length > 0) {
      result = result.filter(item => {
         return activeMassQuery.every(cond => {
             const targetVal = item[cond.column as keyof BPMRecord];
             return evaluateCondition(targetVal, cond);
         });
      });
    }
    
    return result;
  }, [data, searchQuery, activeMassQuery]);

  const handleApplyMassQuery = () => {
      const valid = queryConditions.filter(c => c.operator === 'empty' || c.operator === 'not_empty' || c.input.trim());
      setActiveMassQuery(valid.length > 0 ? valid : null);
      setIsMassQueryOpen(false);
  };

  const handleClearMassQuery = () => {
      setActiveMassQuery(null);
      setQueryConditions([{ id: Math.random().toString(), column: 'folio_seguimiento', operator: 'in', type: 'string', input: '' }]);
      setIsMassQueryOpen(false);
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.checked) {
          setSelectedIds(new Set(filteredData.filter(d => d.id).map(d => d.id as string)));
      } else {
          setSelectedIds(new Set());
      }
  };

  const handleSelectRow = (id: string) => {
      const newSet = new Set(selectedIds);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      setSelectedIds(newSet);
  };

  const handleApplyBulkEdit = async () => {
      if (!bulkEditField || selectedIds.size === 0) return;
      if (!confirm(`¿Estás seguro de modificar ${selectedIds.size} registros?`)) return;
      
      try {
          const promises = Array.from(selectedIds).map(id => 
              bpmService.updateBPM(id, { [bulkEditField as string]: bulkEditValue } as Partial<BPMRecord>)
          );
          await Promise.all(promises);
          alert("Cambio masivo aplicado con éxito.");
          setIsBulkEditModalOpen(false);
          setSelectedIds(new Set());
          await fetchData();
      } catch (err: any) {
          alert("Error aplicando cambio masivo: " + err.message);
      }
  };

  const handleDownloadTemplate = () => {
    const ws = xlsx.utils.aoa_to_sheet([TEMPLATE_HEADERS]);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "BPM Template");
    xlsx.writeFile(wb, "BPM_Upload_Template.xlsx");
  };

  const handleDownloadExport = () => {
    if (filteredData.length === 0) return alert('No hay datos para exportar');
    
    const exportHeaders = [...TEMPLATE_HEADERS, 'Folio', 'Secuencia', 'FOTO'];
    const rows = filteredData.map(d => [
      d.ref_no, d.part_no, d.description_cn, d.description_en,
      d.material_cn, d.material_en, d.function_cn, d.function_en,
      d.net_weight, d.imported_or_not, d.rrynas, d.remarks,
      d.certification, d.spanish_description, d.um, d.hts, d.prosec,
      d.r8, d.regimen, d.sensible, d.igi, d.clavesat,
      d.type_material, d.hts_base, d.hts_nico, d.descripcion_r8, d.company,
      d.subidoPor,
      d.fotoUrls ? d.fotoUrls.join(', ') : (d.fotoUrl || '')
    ]);
    
    const ws = xlsx.utils.aoa_to_sheet([exportHeaders, ...rows]);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "BPM Export");
    xlsx.writeFile(wb, "BPM_Export.xlsx");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploading(true);
    try {
      const dataStr = await file.arrayBuffer();
      const wb = xlsx.read(dataStr, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = xlsx.utils.sheet_to_json<any[]>(ws, { header: 1 });
      
      if (json.length < 2) throw new Error("El archivo está vacío o no tiene encabezados.");
      
      const recordsToUpload: Omit<BPMRecord, 'folio_seguimiento' | 'secuencia_lote'>[] = [];
      const userName = user?.name || user?.username || user?.email || 'Sistema';
      
      // Starting from row 1 (skipping header)
      for (let i = 1; i < json.length; i++) {
        const row = json[i];
        if (!row || row.length === 0 || !row[1]) continue; // row[1] is part_no

        recordsToUpload.push({
          ref_no: row[0],
          part_no: row[1]?.toString() || '',
          description_cn: row[2]?.toString(),
          description_en: row[3]?.toString(),
          material_cn: row[4]?.toString(),
          material_en: row[5]?.toString(),
          function_cn: row[6]?.toString(),
          function_en: row[7]?.toString(),
          net_weight: parseFloat(row[8]) || undefined,
          imported_or_not: row[9]?.toString(),
          rrynas: row[10]?.toString(),
          remarks: row[11]?.toString(),
          certification: row[12]?.toString(),
          spanish_description: row[13]?.toString(),
          um: row[14]?.toString(),
          hts: row[15]?.toString(),
          prosec: row[16]?.toString(),
          r8: row[17]?.toString(),
          regimen: row[18]?.toString(),
          sensible: row[19]?.toString(),
          igi: row[20],
          clavesat: row[21],
          type_material: row[22]?.toString(),
          hts_base: row[23]?.toString(),
          hts_nico: row[24]?.toString(),
          descripcion_r8: row[25]?.toString(),
          company: row[26]?.toString()
        });
      }

      if (recordsToUpload.length === 0) throw new Error("No se encontraron registros válidos (Part No requerido).");

      const { folio, count } = await bpmService.batchUploadBPMs(recordsToUpload, userName);
      
      // Recargar datos
      await fetchData();
      
      setTimeout(() => {
        alert(`ÉXITO: Se crearon ${count} registros.\nBPM Asignado: ${folio}`);
      }, 500);

    } catch (err: any) {
      alert("Error procesando Excel: " + err.message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
      setUploading(false);
    }
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files: File[] = Array.from(e.target.files || []);
      if (files.length === 0 || !selectedPhotoBpmId) return;

      setUploadingPhotoRow(selectedPhotoBpmId);
      
      const record = filteredData.find(d => d.id === selectedPhotoBpmId);
      const currentUrls = record?.fotoUrls || (record?.fotoUrl ? [record.fotoUrl] : []);
      
      try {
          const newUrls: string[] = [];
          for (const file of files) {
              const base64 = await new Promise<string>((resolve) => {
                 const reader = new FileReader();
                 reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
                 reader.readAsDataURL(file);
              });
              
              const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
              const finalFileName = `BPM_${selectedPhotoBpmId}_${safeName}`;
              
              const driveUrl = await bpmService.uploadPhotoToDrive(base64, finalFileName, file.type);
              if (driveUrl) newUrls.push(driveUrl);
          }
          
          if (newUrls.length > 0) {
              const combinedUrls = [...currentUrls, ...newUrls];
              await bpmService.updateBPM(selectedPhotoBpmId, { fotoUrls: combinedUrls });
              alert(`Se subieron ${newUrls.length} fotografía(s) a Drive y se vincularon exitosamente.`);
              await fetchData();
          } else {
              alert("Hubo un error desconocido subiendo la foto a Drive. Intenta de nuevo.");
          }
      } catch (err: any) {
          alert("Error: " + err.message);
      } finally {
          setUploadingPhotoRow(null);
          if (photoInputRef.current) photoInputRef.current.value = '';
      }
  };

  const handleBatchApprove = async () => {
      if (selectedIds.size === 0) return;
      
      const recordsToApprove = filteredData.filter(d => selectedIds.has(d.id!) && !d.aprobadoPor);
      if (recordsToApprove.length === 0) {
          alert("Todos los registros seleccionados ya están terminados.");
          return;
      }

      if (!confirm(`¿Estás seguro de terminar y empujar a MasterData ${recordsToApprove.length} registros y publicarlos en Master Data?`)) return;

      try {
          const approverName = user?.name || user?.username || user?.email || 'Sistema';
          const success = await bpmService.approveAndPushToMasterDataBatch(recordsToApprove, approverName);
          if (success) {
              await fetchData();
              setSelectedIds(new Set()); // Deselect after success
          } else {
              alert("Error actualizando o empujando datos. Intenta de nuevo.");
          }
      } catch (err: any) {
          alert("Error: " + err.message);
      }
  };

  const handleSaveRow = async () => {
      if (!editingRow || !editingRow.id) return;
      try {
          const success = await bpmService.updateBPM(editingRow.id, editingRow);
          if (success) {
              await fetchData();
              setEditingRow(null);
          } else {
              alert("Hubo un problema guardando el registro.");
          }
      } catch (err: any) {
          alert("Error: " + err.message);
      }
  };

  const handleDeleteRow = async (id: string, refNo: string) => {
      if (!confirm(`¿Estás seguro de que quieres eliminar permanentemente el registro ${refNo}?`)) return;
      try {
          const success = await bpmService.deleteBPM(id);
          if (success) {
              await fetchData();
              setSelectedIds(prev => {
                 const newSet = new Set(prev);
                 newSet.delete(id);
                 return newSet;
              });
          } else {
              alert("Error eliminando el registro.");
          }
      } catch (err: any) {
          alert("Error: " + err.message);
      }
  };

  const handleBatchDelete = async () => {
      if (selectedIds.size === 0) return;
      if (!confirm(`🚨 ¿Estás seguro de eliminar masivamente ${selectedIds.size} registros? Esta acción es irreversible.`)) return;
      
      try {
          const success = await bpmService.batchDeleteBPMs(Array.from(selectedIds));
          if (success) {
              setSelectedIds(new Set());
              await fetchData();
          } else {
              alert("Hubo un error borrando masivamente.");
          }
      } catch (err: any) {
          alert("Error: " + err.message);
      }
  };

  return (
    <div className="p-4 sm:p-6 md:p-8 bg-slate-900 min-h-screen">
      <div className="w-full mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">BPM Clasificación</h1>
            <p className="text-slate-400 mt-1">Gestión de Catálogo Arancelario y Reportes Fotográficos</p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={handleDownloadTemplate}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <DownloadCloud size={18} />
              Plantilla CSV
            </button>
            <input 
              type="file" 
              accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" 
              className="hidden" 
              ref={fileInputRef}
              onChange={handleFileUpload}
            />
            {user?.role !== UserRole.AGENT && (
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:opacity-70 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-blue-900/20"
              >
                {uploading ? <Loader2 size={18} className="animate-spin" /> : <UploadCloud size={18} />}
                Subir Masivo
              </button>
            )}
          </div>
        </div>

        {/* Search Bar - Mass Query */}
        <div className="bg-slate-800 rounded-xl p-2 flex items-center gap-3 border border-slate-700 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500/50 transition-all">
           <Search className="text-slate-400 ml-2" size={20} />
           <input 
             type="text"
             value={searchQuery}
             onChange={(e) => setSearchQuery(e.target.value)}
             placeholder="Búsqueda Masiva: Pega números de parte o folios separados por comas (ej. A-123, B-456)..."
             className="w-full bg-transparent border-none focus:outline-none text-white placeholder:text-slate-500 py-2"
           />
           {searchQuery && (
              <div className="px-3 py-1 bg-slate-900 text-slate-300 text-xs rounded-md font-mono border border-slate-700">
                {processSearchStr(searchQuery).length} refs
              </div>
           )}
        </div>

        {/* Toolbar */}
        <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-white">
                Resultados <span className="text-slate-400 font-normal ml-2 text-sm">({filteredData.length} registros)</span>
            </h2>
            <div className="flex items-center gap-3">
                {selectedIds.size > 0 && user?.role !== UserRole.AGENT && (
                   <div className="flex items-center gap-2 animate-in slide-in-from-right-2">
                     <button 
                       onClick={handleBatchApprove}
                       className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors shadow-md shadow-blue-900/20 flex items-center gap-2"
                     >
                       <CheckCircle size={16} /> Terminar ({selectedIds.size})
                     </button>
                     <button 
                       onClick={() => setIsBulkEditModalOpen(true)}
                       className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-medium transition-colors shadow-md shadow-amber-900/20 flex items-center gap-2"
                     >
                       <Edit3 size={16} /> Bulk Amendment ({selectedIds.size})
                     </button>
                     <button 
                       onClick={handleBatchDelete}
                       className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-colors shadow-md shadow-red-900/20 flex items-center gap-2"
                     >
                       <Trash2 size={16} /> Eliminar Seleccionados
                     </button>
                   </div>
                )}
                <button 
                  onClick={() => setIsMassQueryOpen(true)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${activeMassQuery ? 'bg-blue-900/50 border-blue-500/50 text-blue-400' : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700'}`}
                >
                  Mass Query {activeMassQuery && `(${activeMassQuery.length})`}
                </button>
                <button 
                  onClick={fetchData} 
                  className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700" 
                  title="Recargar"
                >
                    <RefreshCcw size={16} />
                </button>
                <button 
                  onClick={handleDownloadExport}
                  className="text-sm px-4 py-2 bg-slate-800 hover:bg-slate-700 text-emerald-400 rounded-lg font-medium transition-colors border border-slate-700"
                >
                    Exportar Consulta
                </button>
            </div>
        </div>

        {/* Data Table */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden backdrop-blur-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap text-slate-300">
              <thead className="bg-slate-900/80 text-slate-400 text-xs uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3 sticky left-0 bg-slate-900 border-r border-slate-700/50 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.5)]">
                    <div className="flex items-center gap-3">
                        {user?.role !== UserRole.AGENT && (
                          <input 
                            type="checkbox" 
                            checked={filteredData.length > 0 && selectedIds.size === filteredData.length}
                            onChange={handleSelectAll}
                            className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-900"
                          />
                        )}
                        <span className="sr-only">Seleccionar todo</span>
                    </div>
                  </th>
                  <th className="px-4 py-3 sticky left-[52px] bg-slate-900 border-r border-slate-700/50 z-10 text-white shadow-[2px_0_5px_-2px_rgba(0,0,0,0.5)]">Ref No</th>
                  <th className="px-4 py-3">Lote</th>
                  <th className="px-4 py-3 text-white">part no</th>
                  <th className="px-4 py-3">Description(CN)</th>
                  <th className="px-4 py-3">Description(EN)</th>
                  <th className="px-4 py-3">material（CN）</th>
                  <th className="px-4 py-3">material（EN）</th>
                  <th className="px-4 py-3">function（CN）</th>
                  <th className="px-4 py-3">function（EN）</th>
                  <th className="px-4 py-3">Net Weight(KGs)</th>
                  <th className="px-4 py-3">Can be imported or not</th>
                  <th className="px-4 py-3">RRYNAS</th>
                  <th className="px-4 py-3">Remarks</th>
                  <th className="px-4 py-3">Certification</th>
                  <th className="px-4 py-3">SPANISH DESCRIPTION</th>
                  <th className="px-4 py-3">U.M</th>
                  <th className="px-4 py-3 text-white">HTS</th>
                  <th className="px-4 py-3">PROSEC</th>
                  <th className="px-4 py-3">R8</th>
                  <th className="px-4 py-3 text-white">REGIMEN</th>
                  <th className="px-4 py-3">SENSIBLE</th>
                  <th className="px-4 py-3">IGI</th>
                  <th className="px-4 py-3">CLAVESAT</th>
                  <th className="px-4 py-3">TypeMaterial</th>
                  <th className="px-4 py-3 text-white">HTS_BASE</th>
                  <th className="px-4 py-3 text-white">HTS_NICO</th>
                  <th className="px-4 py-3">Desc R8</th>
                  <th className="px-4 py-3 text-white">COMPANY</th>
                  <th className="px-4 py-3 text-center">Fecha de Creación (Submit)</th>
                  <th className="px-4 py-3 text-center border-l border-slate-700/50">Aprobación (Terminado)</th>
                  <th className="px-4 py-3 text-center sticky right-0 bg-slate-900 border-l border-slate-700/50 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.5)] z-10">FOTO</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                      <div className="flex flex-col items-center gap-3">
                         <Loader2 className="animate-spin text-blue-500" size={32} />
                         Consultando catálogo BPM...
                      </div>
                    </td>
                  </tr>
                ) : filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-slate-500">No se encontraron registros. Sube un archivo CSV o ajusta tus filtros.</td>
                  </tr>
                ) : (
                  filteredData.map(row => (
                    <tr key={row.id} className={`hover:bg-slate-800/80 group ${selectedIds.has(row.id!) ? 'bg-blue-900/20' : ''}`}>
                      <td className={`px-4 py-3 sticky left-0 group-hover:bg-slate-800/80 border-r border-slate-700/50 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.5)] ${selectedIds.has(row.id!) ? 'bg-slate-800' : 'bg-slate-900'}`}>
                       <div className="flex items-center gap-3">
                           {user?.role !== UserRole.AGENT && (
                             <>
                               <input 
                                 type="checkbox" 
                                 checked={selectedIds.has(row.id!)}
                                 onChange={() => handleSelectRow(row.id!)}
                                 className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-900"
                               />
                               <div className="flex gap-1">
                                 <button onClick={() => setEditingRow(row)} className="text-slate-500 hover:text-blue-400 transition-colors p-1" title="Editar Fila">
                                    <Edit3 size={16} />
                                 </button>
                                 <button onClick={() => handleDeleteRow(row.id!, row.ref_no?.toString() || row.folio_seguimiento || 'desconocido')} className="text-slate-500 hover:text-red-400 transition-colors p-1" title="Eliminar Fila">
                                    <Trash2 size={16} />
                                 </button>
                               </div>
                             </>
                           )}
                         </div>
                      </td>
                      <td className={`px-4 py-3 font-mono text-blue-400 sticky left-[52px] group-hover:bg-slate-800/80 border-r border-slate-700/50 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.5)] ${selectedIds.has(row.id!) ? 'bg-slate-800' : 'bg-slate-900'}`}>{row.ref_no || row.folio_seguimiento}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{row.secuencia_lote}</td>
                      <td className="px-4 py-3 font-semibold text-white whitespace-nowrap">{row.part_no}</td>
                      <td className="px-4 py-3 max-w-[200px] truncate" title={row.description_cn}>{row.description_cn || '-'}</td>
                      <td className="px-4 py-3 max-w-[200px] truncate" title={row.description_en}>{row.description_en || '-'}</td>
                      <td className="px-4 py-3 max-w-[150px] truncate" title={row.material_cn}>{row.material_cn || '-'}</td>
                      <td className="px-4 py-3 max-w-[150px] truncate" title={row.material_en}>{row.material_en || '-'}</td>
                      <td className="px-4 py-3 max-w-[150px] truncate" title={row.function_cn}>{row.function_cn || '-'}</td>
                      <td className="px-4 py-3 max-w-[150px] truncate" title={row.function_en}>{row.function_en || '-'}</td>
                      <td className="px-4 py-3 text-right">{row.net_weight !== undefined ? row.net_weight : '-'}</td>
                      <td className="px-4 py-3 text-center">{row.imported_or_not || '-'}</td>
                      <td className="px-4 py-3">{row.rrynas || '-'}</td>
                      <td className="px-4 py-3 max-w-[150px] truncate" title={row.remarks}>{row.remarks || '-'}</td>
                      <td className="px-4 py-3">{row.certification || '-'}</td>
                      <td className="px-4 py-3 max-w-[250px] truncate" title={row.spanish_description}>{row.spanish_description || '-'}</td>
                      <td className="px-4 py-3 text-center font-mono">{row.um || '-'}</td>
                      <td className="px-4 py-3 font-mono text-amber-500 font-medium">{row.hts || '-'}</td>
                      <td className="px-4 py-3">{row.prosec || '-'}</td>
                      <td className="px-4 py-3">{row.r8 || '-'}</td>
                      <td className="px-4 py-3 font-medium text-emerald-400">{row.regimen || '-'}</td>
                      <td className="px-4 py-3">{row.sensible || '-'}</td>
                      <td className="px-4 py-3">{row.igi || '-'}</td>
                      <td className="px-4 py-3">{row.clavesat || '-'}</td>
                      <td className="px-4 py-3 font-semibold text-white">{row.type_material || '-'}</td>
                      <td className="px-4 py-3 font-mono text-blue-400">{row.hts_base || '-'}</td>
                      <td className="px-4 py-3 font-mono text-purple-400">{row.hts_nico || '-'}</td>
                      <td className="px-4 py-3 max-w-[200px] truncate" title={row.descripcion_r8}>{row.descripcion_r8 || '-'}</td>
                      <td className="px-4 py-3 font-bold text-slate-300">{row.company || '-'}</td>
                      <td className="px-4 py-3">
                         <div className="flex flex-col text-[10px] bg-slate-900/50 p-1.5 rounded border border-slate-700/50 min-w-[80px]">
                            <span className="text-slate-400">P/ {row.subidoPor || 'Sistema'}</span>
                            <span className="text-slate-500">{row.fechaSubida ? new Date(row.fechaSubida).toLocaleDateString() : ''}</span>
                         </div>
                      </td>
                      <td className="px-4 py-3 text-center border-l border-slate-700/50">
                        {row.aprobadoPor ? (
                          <div className="flex flex-col items-center justify-center text-[10px] bg-emerald-900/20 p-1.5 rounded border border-emerald-500/30 min-w-[90px]">
                             <span className="text-emerald-400 font-semibold">Terminado</span>
                             <span className="text-emerald-500/80">{new Date(row.fechaAprobacion!).toLocaleDateString()}</span>
                             <span className="text-emerald-600/70 truncate w-full pt-0.5 mt-0.5 border-t border-emerald-500/20" title={row.aprobadoPor}>{row.aprobadoPor}</span>
                          </div>
                        ) : (
                          <div className="flex justify-center text-center">
                            <span className="px-3 py-1 bg-amber-500/10 text-amber-500 rounded border border-amber-500/20 text-[10px] font-bold tracking-wide">
                              PENDIENTE
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center sticky right-0 bg-slate-900 group-hover:bg-slate-800/80 border-l border-slate-700/50 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.5)] z-10">
                        <div className="flex items-center justify-center gap-1">
                        {row.fotoUrls?.map((url, idx) => (
                           <a 
                             key={idx}
                             href={url} 
                             target="_blank" 
                             rel="noopener noreferrer"
                             className="inline-flex items-center justify-center p-2 rounded-full bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 ring-1 ring-emerald-500/30 transition-colors"
                             title={`Ver Foto ${idx+1} en Drive`}
                           >
                             <CheckCircle size={16} />
                           </a>
                        ))}
                        {row.fotoUrl && !row.fotoUrls && (
                           <a 
                             href={row.fotoUrl} 
                             target="_blank" 
                             rel="noopener noreferrer"
                             className="inline-flex items-center justify-center p-2 rounded-full bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 ring-1 ring-emerald-500/30 transition-colors"
                             title="Ver Foto en Google Drive"
                           >
                             <CheckCircle size={16} />
                           </a>
                        )}
                         {user?.role !== UserRole.AGENT && (
                            <button 
                              disabled={uploadingPhotoRow === row.id}
                              onClick={() => {
                                  setSelectedPhotoBpmId(row.id!);
                                  photoInputRef.current?.click();
                              }}
                              className={`inline-flex items-center justify-center p-2 rounded-full ring-1 transition-colors ${
                                  uploadingPhotoRow === row.id 
                                  ? 'bg-slate-700 text-slate-500 ring-slate-600'
                                  : 'bg-slate-800 text-blue-400 hover:text-white hover:bg-blue-600 ring-slate-700 hover:ring-blue-500'
                              }`}
                              title="Agregar FOTO(s)"
                            >
                              {uploadingPhotoRow === row.id ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
                            </button>
                         )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Hidden Input for photos */}
        <input 
            type="file" 
            accept="image/*" 
            multiple
            className="hidden" 
            ref={photoInputRef}
            onChange={handlePhotoSelect}
        />

        <CatalogQueryBuilder 
            isOpen={isMassQueryOpen}
            onClose={() => setIsMassQueryOpen(false)}
            columns={bpmColumns}
            conditions={queryConditions}
            setConditions={setQueryConditions}
            onApply={handleApplyMassQuery}
            onClear={handleClearMassQuery}
        />

        {/* BULK EDIT MODAL */}
        {isBulkEditModalOpen && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                    <div className="bg-amber-50 p-6 flex flex-col items-center text-center border-b border-amber-100">
                        <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-3">
                            <Edit3 size={24} />
                        </div>
                        <h3 className="text-lg font-bold text-amber-900">Bulk Amendment</h3>
                        <p className="text-sm text-amber-800 mt-2">
                            Applying change to <span className="font-bold">{selectedIds.size}</span> selected records.
                        </p>
                    </div>
                    <div className="p-6 space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Select Field</label>
                            <select
                                value={bulkEditField}
                                onChange={(e) => setBulkEditField(e.target.value)}
                                className="w-full rounded-md border-slate-300 shadow-sm focus:ring-amber-500 focus:border-amber-500 border p-2 text-sm text-slate-900"
                            >
                                <option value="">-- Choose Field --</option>
                                {bpmColumns.map(key => (
                                    <option key={key} value={key}>{key.replace(/_/g, ' ')}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">New Value</label>
                            <input
                                type="text"
                                value={bulkEditValue}
                                onChange={(e) => setBulkEditValue(e.target.value)}
                                placeholder="Enter new value..."
                                className="w-full rounded-md border-slate-300 shadow-sm focus:ring-amber-500 focus:border-amber-500 border p-2 text-sm text-slate-900"
                            />
                        </div>
                    </div>
                    <div className="p-6 bg-slate-50 flex gap-3 border-t border-slate-100">
                        <button
                            onClick={() => setIsBulkEditModalOpen(false)}
                            className="flex-1 px-4 py-2 text-slate-600 hover:text-slate-800 font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleApplyBulkEdit}
                            disabled={!bulkEditField}
                            className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Apply Change
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Row Edit Modal */}
        {editingRow && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
              <div className="p-5 border-b border-slate-700/50 flex justify-between items-center bg-slate-800/50 rounded-t-xl">
                <div>
                  <h3 className="text-xl font-bold text-white">Editar Registro</h3>
                  <p className="text-sm text-slate-400 mt-1">Ref No: {editingRow.ref_no} | Part No: {editingRow.part_no}</p>
                </div>
                <button 
                  onClick={() => setEditingRow(null)}
                  className="text-slate-400 hover:text-white transition-colors p-2 hover:bg-slate-700 rounded-lg"
                >
                  ✕
                </button>
              </div>
              <div className="p-6 overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 ml:grid-cols-3 lg:grid-cols-4 gap-4">
                  {bpmColumns.map(col => {
                    // Do not allow editing operational keys directly in this dynamic list to prevent confusion
                    if (['folio_seguimiento', 'secuencia_lote', 'ref_no'].includes(col)) return null;

                    return (
                      <div key={col} className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                          {col.replace(/_/g, ' ')}
                        </label>
                        <input
                          type={col.includes('weight') || col.includes('igi') ? 'number' : 'text'}
                          value={(editingRow as any)[col] || ''}
                          onChange={(e) => setEditingRow({ ...editingRow, [col]: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="p-5 border-t border-slate-700/50 flex justify-end gap-3 bg-slate-800/50 rounded-b-xl mt-auto">
                <button
                  onClick={() => setEditingRow(null)}
                  className="px-5 py-2.5 rounded-lg font-medium text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveRow}
                  className="px-5 py-2.5 rounded-lg font-medium bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20 transition-all hover:-translate-y-0.5"
                >
                  Guardar Cambios
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default BPMClasificacion;
