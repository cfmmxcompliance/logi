import React, { useState, useEffect, useMemo, useRef } from 'react';
import { expoService } from '../services/expoService';
import { ExpoModel } from '../types/expo';
import { Plus, Edit2, Trash2, Search, Filter, Box, Download, UploadCloud, FileSpreadsheet, X } from 'lucide-react';
import { CatalogQueryBuilder, QueryCondition, evaluateCondition } from '../components/CatalogQueryBuilder';
import { parseCSV } from '../utils/csvHelpers';

export const Models: React.FC = () => {
  const [models, setModels] = useState<ExpoModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<Partial<ExpoModel>>({});
  const [isEditing, setIsEditing] = useState(false);

  // Search & Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const [isMassQueryOpen, setIsMassQueryOpen] = useState(false);
  const [queryConditions, setQueryConditions] = useState<QueryCondition[]>([
      { id: '1', column: 'expo', operator: 'in', type: 'string', input: '' }
  ]);
  const [activeMassQuery, setActiveMassQuery] = useState<QueryCondition[] | null>(null);

  const [summaryModal, setSummaryModal] = useState<{isOpen: boolean, column: string, data: {val: string, count: number}[], totalCount: number}>({isOpen: false, column: '', data: [], totalCount: 0});

  const handleOpenSummary = (key: string) => {
      const frequencyMap: Record<string, number> = {};
      filteredModels.forEach(m => {
          let val = (m as any)[key];
          if (typeof val === 'boolean') val = val ? 'Sí' : 'No';
          val = (val === null || val === undefined || String(val).trim() === '') ? '(Vacío)' : String(val).trim();
          frequencyMap[val] = (frequencyMap[val] || 0) + 1;
      });
      const data = Object.entries(frequencyMap)
          .map(([val, count]) => ({ val, count }))
          .sort((a, b) => b.count - a.count);
      
      setSummaryModal({
          isOpen: true,
          column: key,
          data,
          totalCount: filteredModels.length
      });
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const modelColumns = [
      'expo', 'modelo', 'pesoNetoUnitarioKg', 'pesoBrutoUnitarioKg', 'pesoBrutoUnitarioLb',
      'volumenUnitario', 'valorUsdUnitario', 'ValAcero', 'objetoImpuestoSat', 'unidadMedidaSat', 
      'usoCfdiSat', 'claveProductoSat', 'fraccionArancelaria', 'HTSUS', 'unidadAduana', 
      'cantidadAduana', 'puAduana', 'clavePedimento', 'incoterm', 'materialPeligroso', 
      'claveMaterialPeligroso', 'tipoDeMateria', 'mid', 'testGroupNameNo'
  ];

  useEffect(() => {
    loadModels();
  }, []);

  const loadModels = async () => {
    const data = await expoService.getAllExpos();
    setModels(data);
    setLoading(false);
  };

  const filteredModels = useMemo(() => {
      let result = models;
      if (searchTerm) {
          const terms = searchTerm.toLowerCase().split(/[\s,]+/).filter(t => t);
          result = result.filter(c => 
             terms.some(term =>
                c.expo.toLowerCase().includes(term) || 
                c.modelo.toLowerCase().includes(term) ||
                (c.fraccionArancelaria && c.fraccionArancelaria.toLowerCase().includes(term))
             )
          );
      }
      if (activeMassQuery && activeMassQuery.length > 0) {
          result = result.filter(c => {
             return activeMassQuery.every(cond => {
                 const targetVal = c[cond.column as keyof ExpoModel];
                 return evaluateCondition(targetVal, cond);
             });
          });
      }
      return result;
  }, [models, searchTerm, activeMassQuery]);

  const handleApplyMassQuery = () => {
      const valid = queryConditions.filter(c => c.operator === 'empty' || c.operator === 'not_empty' || c.input.trim());
      setActiveMassQuery(valid.length > 0 ? valid : null);
      setIsMassQueryOpen(false);
  };

  const handleClearMassQuery = () => {
      setActiveMassQuery(null);
      setQueryConditions([{ id: Math.random().toString(), column: 'expo', operator: 'in', type: 'string', input: '' }]);
      setIsMassQueryOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.expo || !formData.modelo) return;

    if (isEditing) {
      await expoService.updateExpo(formData.expo, formData);
    } else {
      await expoService.addExpo(formData as ExpoModel);
    }
    setShowModal(false);
    loadModels();
  };

  const handleDelete = async (expoId: string) => {
    if (confirm("¿Seguro que deseas eliminar este modelo?")) {
      await expoService.deleteExpo(expoId);
      loadModels();
    }
  };

  const openEdit = (mod: ExpoModel) => {
    setFormData(mod);
    setIsEditing(true);
    setShowModal(true);
  };

  const openNew = () => {
    setFormData({
        pesoNetoUnitarioKg: 0,
        pesoBrutoUnitarioKg: 0,
        pesoBrutoUnitarioLb: 0,
        volumenUnitario: 0,
        valorUsdUnitario: 0,
        ValAcero: 0,
        cantidadAduana: 0,
        puAduana: 0,
        materialPeligroso: false
    });
    setIsEditing(false);
    setShowModal(true);
  };

  // --- CSV LOGIC ---
  const exportToCSV = () => {
    const headers = modelColumns.join(',');
    const rows = filteredModels.map(m => {
        return modelColumns.map(col => {
            let val = (m as any)[col] ?? '';
            val = String(val).replace(/"/g, '""');
            if (val.includes(',') || val.includes('\n') || val.includes('"')) {
                val = `"${val}"`;
            }
            return val;
        }).join(',');
    });
    const csvContent = "\uFEFF" + [headers, ...rows].join('\n'); // Add BOM for Excel compatibility
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Modelos_Export_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadTemplate = () => {
    const headers = modelColumns.join(',');
    const csvContent = "\uFEFF" + headers; // Blank row just headers
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Plantilla_Modelos_Importacion.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (evt) => {
          const text = evt.target?.result as string;
          if (!text) return;
          const rows = parseCSV(text);
          if (rows.length < 2) {
              alert("El archivo CSV está vacío o sin datos válidos.");
              return;
          }

          const headers = rows[0].map(h => h.trim());
          const records: ExpoModel[] = [];

          for (let i = 1; i < rows.length; i++) {
              const row = rows[i];
              if (row.length < 2) continue; // Skip strictly empty rows
              
              const model: any = {};
              headers.forEach((h, idx) => {
                  let val: any = row[idx]?.trim() || '';
                  if (['pesoNetoUnitarioKg', 'pesoBrutoUnitarioKg', 'pesoBrutoUnitarioLb', 'volumenUnitario', 'valorUsdUnitario', 'ValAcero', 'cantidadAduana', 'puAduana'].includes(h)) {
                      val = val ? Number(val) : 0;
                  }
                  if (h === 'materialPeligroso') {
                      const lower = String(val).toLowerCase();
                      val = lower === 'true' || lower === '1' || lower === 'si' || lower === 'yes' || lower === 'y';
                  }
                  model[h] = val;
              });

              if (model.expo && model.modelo) {
                  records.push(model as ExpoModel);
              }
          }

          if (records.length === 0) {
              alert("No se encontraron registros válidos. Verifica que existan las columnas obligatorias: 'expo' y 'modelo'.");
              if (fileInputRef.current) fileInputRef.current.value = '';
              return;
          }

          if(confirm(`Se han detectado ${records.length} modelos en el archivo. ¿Deseas proceder con la importación y actualizar la base de datos?`)){
              // Optional: You could show a loading modal here.
              let successCount = 0;
              for(const rec of records) {
                  try {
                     await expoService.updateExpo(rec.expo, rec).catch(() => expoService.addExpo(rec));
                     successCount++;
                  } catch(e) { console.error("Error importing", rec.expo, e); }
              }
              alert(`Carga completada. Se procesaron ${successCount} registros exitosamente.`);
              loadModels();
          }
          if (fileInputRef.current) fileInputRef.current.value = '';
      };
      reader.readAsText(file);
  };


  return (
    <div className="p-6 max-w-[95%] mx-auto animate-fade-in relative flex flex-col h-full">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
           <h1 className="text-2xl font-bold text-slate-800">Catálogo de Modelos (BOM/Expo)</h1>
           <p className="text-slate-500 text-sm mt-1">Diccionario centralizado de logística, dimensiones y aduana.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
             <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                    type="text" 
                    placeholder="Multibúsqueda Modelos..." 
                    value={searchTerm} 
                    onChange={e => setSearchTerm(e.target.value)}
                    className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none w-64 shadow-sm"
                />
             </div>
             
             {/* CSV Controls */}
             <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg p-1 shadow-sm">
                 <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={handleFileUpload} />
                 <button onClick={downloadTemplate} className="p-1.5 text-slate-500 hover:text-orange-600 hover:bg-orange-50 rounded transition-colors" title="Descargar Plantilla CSV">
                    <FileSpreadsheet size={18} />
                 </button>
                 <button onClick={() => fileInputRef.current?.click()} className="p-1.5 text-slate-500 hover:text-green-600 hover:bg-green-50 rounded transition-colors" title="Importar Modelos desde CSV">
                    <UploadCloud size={18} />
                 </button>
                 <div className="w-px h-5 bg-slate-200 mx-1"></div>
                 <button onClick={exportToCSV} className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors flex items-center gap-1 text-xs font-bold pr-3" title="Descargar vista actual a CSV">
                    <Download size={18} /> CSV
                 </button>
             </div>

             <button 
                 onClick={() => setIsMassQueryOpen(true)} 
                 className={`px-4 py-2 flex items-center rounded-lg border text-sm font-medium transition-colors shadow-sm ${activeMassQuery ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}
             >
                 <Filter size={16} className="mr-2" />
                 {activeMassQuery ? `Filtros (${activeMassQuery.length})` : 'Mass Query'}
             </button>
             <button onClick={openNew} className="bg-orange-600 text-white px-4 py-2 flex items-center rounded-lg hover:bg-orange-700 shadow-md shadow-orange-500/30 transition-all font-medium text-sm">
                <Plus size={18} className="mr-2" /> Nuevo
             </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex-1 flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left whitespace-nowrap min-w-max">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-[10px] uppercase tracking-wider sticky top-0 z-20">
              <tr>
                <th className="p-3 font-bold text-center sticky left-0 bg-slate-100 shadow-[5px_0_10px_-5px_rgba(0,0,0,0.1)] z-10 border-r border-slate-200">Acciones</th>
                {modelColumns.map(col => (
                    <th key={col} className="p-3 font-bold border-r border-slate-100 last:border-0">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredModels.map(m => (
                <tr key={m.expo} className="hover:bg-slate-50 transition-colors group">
                  <td className="p-3 flex gap-2 justify-center items-center sticky left-0 bg-white group-hover:bg-slate-50 shadow-[5px_0_10px_-5px_rgba(0,0,0,0.05)] transition-colors z-10 border-r border-slate-100">
                    <button onClick={() => openEdit(m)} className="p-1.5 text-orange-600 hover:bg-orange-100 rounded transition-colors" title="Editar">
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => handleDelete(m.expo)} className="p-1.5 text-red-600 hover:bg-red-100 rounded transition-colors" title="Eliminar">
                      <Trash2 size={14} />
                    </button>
                  </td>
                  {modelColumns.map(col => {
                     const val = (m as any)[col];
                     const isBoolean = typeof val === 'boolean';
                     return (
                         <td key={col} className="p-3 border-r border-slate-50 text-slate-700">
                             {isBoolean ? (val ? 'Sí' : 'No') : (val !== undefined && val !== null && val !== '' ? String(val) : '-')}
                         </td>
                     );
                  })}
                </tr>
              ))}
              {filteredModels.length === 0 && !loading && (
                <tr><td colSpan={modelColumns.length + 1} className="p-12 text-center text-slate-400">No hay modelos registrados que coincidan con la búsqueda.</td></tr>
              )}
              {loading && <tr><td colSpan={modelColumns.length + 1} className="p-12 text-center text-slate-400">Cargando diccionario logístico...</td></tr>}
            </tbody>
            <tfoot className="bg-slate-800 text-white text-[11px] uppercase tracking-wider sticky bottom-0 z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
              <tr>
                <td className="p-3 font-bold text-center sticky left-0 bg-slate-900 border-r border-slate-700 z-30 text-blue-300">
                    TOTALES ({filteredModels.length})
                </td>
                {modelColumns.map(col => {
                    let content: string | number = '';
                    const isNumeric = ['pesoNetoUnitarioKg', 'pesoBrutoUnitarioKg', 'pesoBrutoUnitarioLb', 'volumenUnitario', 'valorUsdUnitario', 'ValAcero', 'cantidadAduana', 'puAduana'].includes(col);
                    
                    if (isNumeric) {
                        const sum = filteredModels.reduce((acc, m) => acc + (Number((m as any)[col]) || 0), 0);
                        content = sum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                        if (['valorUsdUnitario', 'ValAcero', 'puAduana'].includes(col)) content = `$${content}`;
                    } else if (col === 'materialPeligroso') {
                        const count = filteredModels.filter(m => m.materialPeligroso).length;
                        content = `${count} Sí`;
                    } else {
                        const unique = new Set(filteredModels.map(m => (m as any)[col]).filter(v => v !== null && v !== undefined && v !== ''));
                        content = `${unique.size} Dist.`;
                    }

                    return (
                        <td 
                            key={col} 
                            className="p-3 border-r border-slate-700 font-bold whitespace-nowrap text-center text-blue-100 cursor-pointer hover:bg-slate-700 transition-colors"
                            onClick={() => handleOpenSummary(col)}
                            title="Click para ver desglose de frecuencias"
                        >
                            {content}
                        </td>
                    );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <CatalogQueryBuilder 
          isOpen={isMassQueryOpen}
          onClose={() => setIsMassQueryOpen(false)}
          columns={modelColumns}
          conditions={queryConditions}
          setConditions={setQueryConditions}
          onApply={handleApplyMassQuery}
          onClear={handleClearMassQuery}
      />

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[110] p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[90vh] overflow-hidden">
            
            <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <Box className="text-orange-600" />
                    {isEditing ? `Edición Especializada: ${formData.expo}` : 'Registrar Nuevo Modelo'}
                </h2>
                <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600"><Trash2 className="opacity-0" size={1} />Cerrar</button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* 1. Datos Base */}
              <fieldset className="border border-slate-200 p-5 rounded-xl bg-white shadow-sm">
                 <legend className="px-3 font-bold text-slate-700 text-sm tracking-wide">1. Identidad del Producto</legend>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-2">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Clave Expo / BOM (Unique ID)</label>
                        <input required disabled={isEditing} value={formData.expo || ''} onChange={e => setFormData({...formData, expo: e.target.value.toUpperCase()})} className="w-full border border-slate-300 rounded-lg p-2.5 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-orange-500 outline-none disabled:opacity-60" placeholder="Ej. CFMOTO-850" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Modelo Comercial Público</label>
                        <input required value={formData.modelo || ''} onChange={e => setFormData({...formData, modelo: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2.5 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-orange-500 outline-none" placeholder="Ej. ZFORCE 950 SPORT" />
                    </div>
                 </div>
              </fieldset>

              {/* 2. Logística y Valores */}
              <fieldset className="border border-slate-200 p-5 rounded-xl bg-white shadow-sm">
                 <legend className="px-3 font-bold text-slate-700 text-sm tracking-wide">2. Dimensiones y Finanzas Unitarias</legend>
                 <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mt-2">
                    <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-1">Peso Neto (kg)</label>
                        <input type="number" step="0.001" value={formData.pesoNetoUnitarioKg || ''} onChange={e => setFormData({...formData, pesoNetoUnitarioKg: Number(e.target.value)})} className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none" />
                    </div>
                    <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-1">Peso Bruto (kg)</label>
                        <input type="number" step="0.001" value={formData.pesoBrutoUnitarioKg || ''} onChange={e => setFormData({...formData, pesoBrutoUnitarioKg: Number(e.target.value)})} className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none" />
                    </div>
                    <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-1">Peso Bruto (lb)</label>
                        <input type="number" step="0.001" value={formData.pesoBrutoUnitarioLb || ''} onChange={e => setFormData({...formData, pesoBrutoUnitarioLb: Number(e.target.value)})} className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none" />
                    </div>
                    <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-1">Volumen (m3)</label>
                        <input type="number" step="0.001" value={formData.volumenUnitario || ''} onChange={e => setFormData({...formData, volumenUnitario: Number(e.target.value)})} className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none" />
                    </div>
                    <div>
                        <label className="block text-[11px] font-bold text-green-600 mb-1">Valor Comercial (USD)</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                            <input type="number" step="0.01" value={formData.valorUsdUnitario || ''} onChange={e => setFormData({...formData, valorUsdUnitario: Number(e.target.value)})} className="w-full pl-7 pr-2 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none font-bold text-green-700 bg-green-50" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-[11px] font-bold text-blue-600 mb-1">Valor Acero (USD)</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                            <input type="number" step="0.01" value={formData.ValAcero || ''} onChange={e => setFormData({...formData, ValAcero: Number(e.target.value)})} className="w-full pl-7 pr-2 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none font-bold text-blue-700 bg-blue-50" />
                        </div>
                    </div>
                 </div>
              </fieldset>

              {/* 3. Aduanas */}
              <fieldset className="border border-slate-200 p-5 rounded-xl bg-white shadow-sm">
                 <legend className="px-3 font-bold text-indigo-700 text-sm tracking-wide">3. Cumplimiento Aduanal</legend>
                 <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mt-2">
                    <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-1">Fracción Aranc. (HTSMX)</label>
                        <input value={formData.fraccionArancelaria || ''} onChange={e => setFormData({...formData, fraccionArancelaria: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2 text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Ej. 8703.21.99" />
                    </div>
                    <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-1">HTS US</label>
                        <input value={formData.HTSUS || ''} onChange={e => setFormData({...formData, HTSUS: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2 text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Ej. 8703.21.0000" />
                    </div>
                    <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-1">U.M. Aduana</label>
                        <input value={formData.unidadAduana || ''} onChange={e => setFormData({...formData, unidadAduana: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="PZA" />
                    </div>
                    <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-1">CANT. Aduana</label>
                        <input type="number" step="0.01" value={formData.cantidadAduana || ''} onChange={e => setFormData({...formData, cantidadAduana: Number(e.target.value)})} className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                    </div>
                    <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-1">P.U. Aduana</label>
                        <input type="number" step="0.01" value={formData.puAduana || ''} onChange={e => setFormData({...formData, puAduana: Number(e.target.value)})} className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                    </div>
                    <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-1">Incortem</label>
                        <input value={formData.incoterm || ''} onChange={e => setFormData({...formData, incoterm: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none uppercase" placeholder="FOB" />
                    </div>
                 </div>
              </fieldset>

              {/* 4. SAT */}
              <fieldset className="border border-slate-200 p-5 rounded-xl bg-white shadow-sm">
                 <legend className="px-3 font-bold text-sky-700 text-sm tracking-wide">4. Atributos SAT (Carta Porte / Facturación)</legend>
                 <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
                    <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-1">Clave Producto/Servicio</label>
                        <input value={formData.claveProductoSat || ''} onChange={e => setFormData({...formData, claveProductoSat: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2 text-sm font-mono focus:ring-2 focus:ring-sky-500 outline-none" placeholder="Ej. 25101503" />
                    </div>
                    <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-1">Unidad Medida SAT</label>
                        <input value={formData.unidadMedidaSat || ''} onChange={e => setFormData({...formData, unidadMedidaSat: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-sky-500 outline-none" placeholder="H87 (Pieza)" />
                    </div>
                    <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-1">Uso CFDI</label>
                        <input value={formData.usoCfdiSat || ''} onChange={e => setFormData({...formData, usoCfdiSat: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-sky-500 outline-none" placeholder="G01" />
                    </div>
                    <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-1">Objeto Impuesto</label>
                        <input value={formData.objetoImpuestoSat || ''} onChange={e => setFormData({...formData, objetoImpuestoSat: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-sky-500 outline-none" placeholder="02" />
                    </div>
                 </div>
              </fieldset>

              {/* 5. EPA & HAZMAT */}
              <fieldset className="border border-slate-200 p-5 rounded-xl bg-orange-50 shadow-sm">
                 <legend className="px-3 font-bold text-orange-800 text-sm tracking-wide bg-orange-100 rounded">5. EPA & Hazmat / Peligroso</legend>
                 <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-2">
                    <div className="flex items-center gap-2 md:mt-6 bg-white p-2 rounded-lg border border-slate-200">
                        <input type="checkbox" id="matPeligroso" checked={formData.materialPeligroso || false} onChange={e => setFormData({...formData, materialPeligroso: e.target.checked})} className="w-4 h-4 text-orange-600 rounded focus:ring-orange-500" />
                        <label htmlFor="matPeligroso" className="text-xs font-bold text-slate-700 cursor-pointer">Es Material Peligroso</label>
                    </div>
                    <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-1">Cve. Peligroso</label>
                        <input disabled={!formData.materialPeligroso} value={formData.claveMaterialPeligroso || ''} onChange={e => setFormData({...formData, claveMaterialPeligroso: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none disabled:bg-slate-100" />
                    </div>
                    <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-1">Tipo de Envase</label>
                        <input disabled={!formData.materialPeligroso} value={formData.tipoDeMateria || ''} onChange={e => setFormData({...formData, tipoDeMateria: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none disabled:bg-slate-100" />
                    </div>
                    <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-1">MID (Fabricante)</label>
                        <input value={formData.mid || ''} onChange={e => setFormData({...formData, mid: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2 text-sm font-mono focus:ring-2 focus:ring-orange-500 outline-none uppercase bg-white" placeholder="Ej. MXCFMMEX10..." />
                    </div>
                    <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-1">Test Group No. (EPA)</label>
                        <input value={formData.testGroupNameNo || ''} onChange={e => setFormData({...formData, testGroupNameNo: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2 text-sm font-mono focus:ring-2 focus:ring-orange-500 outline-none uppercase bg-white" placeholder="Ej. RMAX... " />
                    </div>
                 </div>
              </fieldset>

            </form>

            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2.5 text-slate-600 font-bold bg-white border border-slate-300 hover:bg-slate-100 rounded-xl transition-colors">Cancelar Misión</button>
              <button onClick={handleSubmit} className="px-8 py-2.5 bg-orange-600 text-white font-bold rounded-xl hover:bg-orange-700 shadow-lg shadow-orange-500/30 transition-all text-sm tracking-wide">
                GUARDAR MODELO
              </button>
            </div>
            
          </div>
        </div>
      )}

      {/* SUMMARY AGGREGATION MODAL */}
      {summaryModal.isOpen && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in zoom-in duration-200">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[85vh]">
                  <div className="bg-slate-50 p-5 border-b border-slate-100 flex justify-between items-center">
                      <div>
                          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                              <Filter size={18} className="text-orange-600" />
                              Desglose: {summaryModal.column}
                          </h3>
                          <p className="text-xs text-slate-500 mt-1">Análisis de frecuencias en la vista filtrada</p>
                      </div>
                      <button onClick={() => setSummaryModal({ ...summaryModal, isOpen: false })} className="text-slate-400 hover:text-slate-600">
                          <X size={20} />
                      </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-0">
                      <div className="p-3 bg-white border-b border-slate-100 flex items-center text-sm font-medium text-slate-600 sticky top-0 z-10 shadow-sm">
                          <span className="flex-1">Valor Encontrado</span>
                          <span className="w-20 text-right">Frecuencia</span>
                      </div>
                      <ul className="divide-y divide-slate-100">
                          <li className="p-3 flex items-center gap-3 hover:bg-slate-50 transition-colors text-sm font-bold bg-slate-50/50">
                              <div className="flex-1 text-slate-700 truncate">Σ Total Registros Evaluados</div>
                              <div className="w-20 text-right font-mono text-orange-600">{summaryModal.totalCount}</div>
                          </li>
                          {summaryModal.data.map((item, idx) => (
                              <li key={idx} className="p-3 flex items-center gap-3 hover:bg-slate-50 transition-colors text-sm">
                                  <div className="flex-1 text-slate-700 truncate" title={item.val}>{item.val}</div>
                                  <div className="w-20 text-right font-mono text-slate-500 bg-slate-100 rounded px-2 py-0.5">{item.count}</div>
                              </li>
                          ))}
                      </ul>
                  </div>
                  <div className="p-4 bg-slate-50 border-t border-slate-100 text-center">
                      <button onClick={() => setSummaryModal({ ...summaryModal, isOpen: false })} className="px-6 py-2.5 bg-orange-600 text-white rounded-xl shadow-sm shadow-orange-500/30 font-bold hover:bg-orange-700 w-full transition-colors">
                          Cerrar Desglose
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
