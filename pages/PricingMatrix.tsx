import React, { useState, useEffect, useMemo, useRef } from 'react';
import { pricingService } from '../services/pricingService';
import { PricingModel } from '../types/pricing';
import { Plus, Edit2, Trash2, Search, Filter, DollarSign, Download, UploadCloud, FileSpreadsheet } from 'lucide-react';
import { CatalogQueryBuilder, QueryCondition, evaluateCondition } from '../components/CatalogQueryBuilder';
import * as XLSX from 'xlsx';

export const PricingMatrix: React.FC = () => {
  const [prices, setPrices] = useState<PricingModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<Partial<PricingModel>>({});
  const [isEditing, setIsEditing] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [isMassQueryOpen, setIsMassQueryOpen] = useState(false);
  const [queryConditions, setQueryConditions] = useState<QueryCondition[]>([
      { id: '1', column: 'modelo', operator: 'in', type: 'string', input: '' }
  ]);
  const [activeMassQuery, setActiveMassQuery] = useState<QueryCondition[] | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const priceColumns = ['id', 'modelo', 'contratos', 'colores', 'importPriceCkd', 'addValue', 'fobPriceMx', 'usaImportPrice'];

  useEffect(() => { loadPrices(); }, []);

  const loadPrices = async () => {
    const data = await pricingService.getAllPricing();
    setPrices(data);
    setLoading(false);
  };

  const filteredPrices = useMemo(() => {
    let result = prices;
    if (searchTerm) {
        const terms = searchTerm.toLowerCase().split(/[\s,]+/).filter(t => t);
        result = result.filter(c => 
            terms.some(term => 
                c.modelo.toLowerCase().includes(term) || 
                (c.contratos || '').toLowerCase().includes(term)
            )
        );
    }
    if (activeMassQuery && activeMassQuery.length > 0) {
        result = result.filter(c => activeMassQuery.every(cond => evaluateCondition(c[cond.column as keyof PricingModel], cond)));
    }
    return result;
  }, [prices, searchTerm, activeMassQuery]);

  const handleApplyMassQuery = () => {
      const valid = queryConditions.filter(c => c.operator === 'empty' || c.operator === 'not_empty' || c.input.trim());
      setActiveMassQuery(valid.length > 0 ? valid : null);
      setIsMassQueryOpen(false);
  };

  const handleClearMassQuery = () => {
      setActiveMassQuery(null);
      setQueryConditions([{ id: Math.random().toString(), column: 'modelo', operator: 'in', type: 'string', input: '' }]);
      setIsMassQueryOpen(false);
  };

  // --- CSV LOGIC --- // 
  const exportToCSV = () => {
    const headers = priceColumns.join(',');
    const rows = filteredPrices.map(m => priceColumns.map(col => {
            let val = (m as any)[col] ?? '';
            val = String(val).replace(/"/g, '""');
            if (val.includes(',') || val.includes('\n') || val.includes('"')) val = `"${val}"`;
            return val;
        }).join(','));
    const blob = new Blob(["\uFEFF" + [headers, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob);
    link.download = `PricingMatrix_Export_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const downloadTemplate = () => {
    const blob = new Blob(["\uFEFF" + priceColumns.join(',')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob);
    link.download = `Plantilla_Pricing_Import.csv`; link.click();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const buffer = evt.target?.result as ArrayBuffer; if (!buffer) return;
          
          const workbook = XLSX.read(buffer, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];
          
          if (rows.length < 2) return alert("Corto o vacío.");
          
          // Encuentra la fila ruda que tiene los headers reales (esquiva títulos de Excel)
          let headerIdx = rows.findIndex(r => r.includes('车型') || r.includes('Model') || r.includes('合同号Contract No.'));
          if(headerIdx === -1) headerIdx = 0;

          const headers = rows[headerIdx].map((h: any) => h?.toString().trim() || '');
          const records: PricingModel[] = [];

          for (let i = headerIdx + 1; i < rows.length; i++) {
              if (rows[i].length < 2) continue;
              const model: any = {};
              headers.forEach((h: string, idx: number) => { model[h] = rows[i][idx]?.toString().trim() || ''; });
              
              // Try Excel exact mappings
              if(!model.modelo && (model['车型'] || model['Model'])) model.modelo = model['车型'] || model['Model'];
              if(!model.contratos && model['合同号Contract No.']) model.contratos = model['合同号Contract No.'];
              if(!model.colores && model['颜色']) model.colores = model['颜色'];
              
              const cleanNum = (str: string) => { 
                  const n = Number(String(str).replace(/[^0-9.-]+/g, '')); 
                  return isNaN(n) ? 0 : n; 
              };
              
              if(model['墨西哥进口价格(CKD)']) model.importPriceCkd = cleanNum(model['墨西哥进口价格(CKD)']);
              if(model['附加值 add value']) model.addValue = cleanNum(model['附加值 add value']);
              if(model['墨西哥F0B价格(México)']) model.fobPriceMx = cleanNum(model['墨西哥F0B价格(México)']);
              if(model['美国海关整车进口价（USA)']) model.usaImportPrice = cleanNum(model['美国海关整车进口价（USA)']);

              if (model.modelo) {
                  // Firebase Payload Sanitization (Evita undefined y NaNs de columnas Excel basura)
                  const sanitizedModel: PricingModel = {
                      modelo: model.modelo,
                      contratos: model.contratos || '',
                      colores: model.colores || '',
                      importPriceCkd: model.importPriceCkd || 0,
                      addValue: model.addValue || 0,
                      fobPriceMx: model.fobPriceMx || 0,
                      usaImportPrice: model.usaImportPrice || 0
                  };
                  if(model.id) sanitizedModel.id = model.id;
                  records.push(sanitizedModel);
              }
          }

          if (records.length === 0) {
              return alert("No se encontraron registros financieros válidos. Revisa el formato.");
          }

          // Validación de Duplicados
          let conflicts = 0;
          const norm = (str: any) => String(str || '').trim().toLowerCase();
          records.forEach(r => {
             const existing = prices.find(p => norm(p.modelo) === norm(r.modelo));
             if (existing) {
                 conflicts++;
                 r.id = existing.id; // Heredar ID para que actualice en lugar de crear
             }
          });

          if (conflicts > 0) {
              const proceed = window.confirm(`⚠️ ¡Atención! Se han detectado ${conflicts} registros que ya existen en la base de datos (mismo Modelo).\n\n¿Deseas sobrescribir y actualizar su información con los datos de este archivo?`);
              if (!proceed) {
                  if (fileInputRef.current) fileInputRef.current.value = '';
                  return; // Cancelar operación
              }
          }

          if(confirm(`Se leyeron ${records.length} matrículas financieras. ¿Procedemos a inyectar en Firebase?`)) {
              setLoading(true);
              let saved = 0;
              
              // Batch en paralelo
              const promises = records.map(async (r) => { 
                 try {
                     if(r.id) {
                         await pricingService.updatePricing(r.id, r).catch(()=>pricingService.addPricing(r)); 
                     } else {
                         await pricingService.addPricing(r); 
                     }
                     saved++;
                 } catch(e) {
                     console.error("Firestore Error en PricingMatrix:", e);
                 }
              });
              
              await Promise.all(promises);
              
              if (saved === 0 && records.length > 0) {
                 alert("⚠️ Error: No se guardó ningún registro. Firebase bloqueó la transacción (revisa la consola para detalles de NaN o Indefinidos).");
              } else {
                 alert(`¡Éxito veloz! Se guardaron ${saved} registros en Pricing Matrix.`);
              }
              
              loadPrices();
              setLoading(false);
          }
        } catch(err: any) {
          alert("Error crítico leyendo Excel: " + err.message);
          console.error(err);
        }
      };
      reader.readAsArrayBuffer(file); if(fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="p-6 max-w-[95%] mx-auto animate-fade-in flex flex-col h-full">
      <div className="flex justify-between items-center mb-6">
        <div>
           <h1 className="text-2xl font-bold text-slate-800">Catálogo: Pricing Matrix (BOM)</h1>
           <p className="text-slate-500 text-sm mt-1">Matriz de Precios CFR, FOB y Valoración Aduanal</p>
        </div>
        <div className="flex items-center gap-2">
             <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                    type="text" 
                    placeholder="Multibúsqueda (ej: CM1000, 25MX)..." 
                    value={searchTerm} 
                    onChange={e => setSearchTerm(e.target.value)}
                    className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm w-64 shadow-sm"
                />
             </div>
             <div className="flex items-center gap-1 bg-white border p-1 rounded-lg">
                 <input type="file" ref={fileInputRef} className="hidden" accept=".csv, .xlsx, .xls" onChange={handleFileUpload} />
                 <button onClick={downloadTemplate} className="p-1.5 text-slate-500 hover:text-emerald-600 rounded" title="Plantilla Excel/CSV"><FileSpreadsheet size={18}/></button>
                 <button onClick={() => fileInputRef.current?.click()} className="p-1.5 text-slate-500 hover:text-green-600 rounded" title="Importar Pricing Matrix Excel"><UploadCloud size={18}/></button>
                 <div className="w-px h-5 bg-slate-200 mx-1"></div>
                 <button onClick={exportToCSV} className="p-1.5 text-slate-500 hover:text-blue-600 rounded flex items-center font-bold text-xs pr-2"><Download size={18}/> CSV</button>
             </div>
             <button onClick={() => setIsMassQueryOpen(true)} className={`px-4 py-2 flex items-center rounded-lg border text-sm font-medium shadow-sm ${activeMassQuery ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-300'}`}>
                 <Filter size={16} className="mr-2" /> Mass Query
             </button>
             <button onClick={() => { setFormData({}); setIsEditing(false); setShowModal(true); }} className="bg-emerald-600 text-white px-4 py-2 font-bold rounded-lg flex items-center shadow-md">
                <Plus size={18} className="mr-2"/> Nuevo Registro
             </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-x-auto flex-1">
          <table className="w-full text-left whitespace-nowrap min-w-max">
            <thead className="bg-slate-50 border-b text-[10px] uppercase text-slate-600 sticky top-0 z-10">
              <tr>
                <th className="p-3 sticky left-0 bg-slate-100 z-10 border-r">Acciones</th>
                {priceColumns.map(col => <th key={col} className="p-3 border-r font-bold">{col}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y text-xs">
              {filteredPrices.map(m => (
                <tr key={m.id} className="hover:bg-slate-50 group">
                  <td className="p-3 sticky left-0 bg-white group-hover:bg-slate-50 z-10 border-r flex gap-2">
                    <button onClick={() => {setFormData(m); setIsEditing(true); setShowModal(true)}} className="p-1 text-emerald-600"><Edit2 size={14}/></button>
                    <button onClick={async () =>{ if(confirm('Borrar?')) { await pricingService.deletePricing(m.id!); loadPrices(); } }} className="p-1 text-red-600"><Trash2 size={14}/></button>
                  </td>
                  {priceColumns.map(col => <td key={col} className="p-3 border-r">{String((m as any)[col]||'-')}</td>)}
                </tr>
              ))}
              {loading && <tr><td colSpan={10} className="p-4 text-center">Cargando Precios...</td></tr>}
            </tbody>
          </table>
      </div>

      <CatalogQueryBuilder isOpen={isMassQueryOpen} onClose={() => setIsMassQueryOpen(false)} columns={priceColumns} conditions={queryConditions} setConditions={setQueryConditions} onApply={handleApplyMassQuery} onClear={handleClearMassQuery} />

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-3xl">
            <h2 className="text-xl font-bold mb-4">{isEditing ? 'Editar Matriz' : 'Nueva Matriz'}</h2>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-xs font-bold text-slate-500">Modelo</label><input className="border w-full p-2 rounded" value={formData.modelo||''} onChange={e=>setFormData({...formData, modelo: e.target.value})} /></div>
              <div><label className="text-xs font-bold text-slate-500">Contract No.s</label><input className="border w-full p-2 rounded" value={formData.contratos||''} onChange={e=>setFormData({...formData, contratos: e.target.value})} /></div>
              <div><label className="text-xs font-bold text-slate-500">Colores</label><input className="border w-full p-2 rounded" value={formData.colores||''} onChange={e=>setFormData({...formData, colores: e.target.value})} /></div>
              <div><label className="text-xs font-bold text-slate-500">Import Price (CKD USD)</label><input type="number" className="border w-full p-2 rounded" value={formData.importPriceCkd||''} onChange={e=>setFormData({...formData, importPriceCkd: Number(e.target.value)})} /></div>
              <div><label className="text-xs font-bold text-slate-500">Add Value / Acero (USD)</label><input type="number" className="border w-full p-2 rounded" value={formData.addValue||''} onChange={e=>setFormData({...formData, addValue: Number(e.target.value)})} /></div>
              <div><label className="text-xs font-bold text-slate-500">USA Import Price</label><input type="number" className="border w-full p-2 rounded" value={formData.usaImportPrice||''} onChange={e=>setFormData({...formData, usaImportPrice: Number(e.target.value)})} /></div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 bg-slate-100 rounded">Cancelar</button>
              <button onClick={async () =>{ if(formData.id){ await pricingService.updatePricing(formData.id, formData); }else{ await pricingService.addPricing(formData as PricingModel); } setShowModal(false); loadPrices(); }} className="px-5 py-2 bg-emerald-600 text-white rounded">Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
