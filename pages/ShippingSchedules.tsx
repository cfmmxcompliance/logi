import React, { useState, useEffect, useMemo, useRef } from 'react';
import { shippingService } from '../services/shippingService';
import { ShippingModel } from '../types/shipping';
import { Plus, Edit2, Trash2, Search, Filter, Ship, Download, UploadCloud, FileSpreadsheet } from 'lucide-react';
import { CatalogQueryBuilder, QueryCondition, evaluateCondition } from '../components/CatalogQueryBuilder';
import * as XLSX from 'xlsx';

export const ShippingSchedules: React.FC = () => {
  const [schedules, setSchedules] = useState<ShippingModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<Partial<ShippingModel>>({});
  const [isEditing, setIsEditing] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [isMassQueryOpen, setIsMassQueryOpen] = useState(false);
  const [queryConditions, setQueryConditions] = useState<QueryCondition[]>([
      { id: '1', column: 'invoiceNo', operator: 'in', type: 'string', input: '' }
  ]);
  const [activeMassQuery, setActiveMassQuery] = useState<QueryCondition[] | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const shipColumns = ['id', 'cfpOrder', 'cfcOrder', 'issue', 'cfpContractNo', 'cfcContractNo', 'invoiceNo', 'modelo', 'color', 'qty', 'truck', 'productNo', 'destination', 'epa', 'productionDate', 'loadingDate', 'etd', 'etaToDoor', 'trailerNo', 'carrier', 'remarks'];

  useEffect(() => { loadSchedules(); }, []);

  const loadSchedules = async () => {
    const data = await shippingService.getAllSchedules();
    setSchedules(data);
    setLoading(false);
  };

  const filteredSchedules = useMemo(() => {
    let result = schedules;
    if (searchTerm) {
        const terms = searchTerm.toLowerCase().split(/[\s,]+/).filter(t => t);
        result = result.filter(c => 
            terms.some(term =>
                c.invoiceNo?.toLowerCase().includes(term) || 
                c.cfpContractNo?.toLowerCase().includes(term) ||
                c.modelo?.toLowerCase().includes(term)
            )
        );
    }
    if (activeMassQuery && activeMassQuery.length > 0) {
        result = result.filter(c => {
           return activeMassQuery.every(cond => evaluateCondition(c[cond.column as keyof ShippingModel], cond));
        });
    }
    return result;
  }, [schedules, searchTerm, activeMassQuery]);

  const handleApplyMassQuery = () => {
      const valid = queryConditions.filter(c => c.operator === 'empty' || c.operator === 'not_empty' || c.input.trim());
      setActiveMassQuery(valid.length > 0 ? valid : null);
      setIsMassQueryOpen(false);
  };

  const handleClearMassQuery = () => {
      setActiveMassQuery(null);
      setQueryConditions([{ id: Math.random().toString(), column: 'invoiceNo', operator: 'in', type: 'string', input: '' }]);
      setIsMassQueryOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.invoiceNo) return;
    if (isEditing && formData.id) {
      await shippingService.updateSchedule(formData.id, formData);
    } else {
      await shippingService.addSchedule(formData as ShippingModel);
    }
    setShowModal(false);
    loadSchedules();
  };

  const handleDelete = async (id: string) => {
    if (confirm("¿Seguro de borrar este registro de Shipping Schedule?")) {
      await shippingService.deleteSchedule(id);
      loadSchedules();
    }
  };

  // --- CSV LOGIC ---
  const exportToCSV = () => {
    const headers = shipColumns.join(',');
    const rows = filteredSchedules.map(m => {
        return shipColumns.map(col => {
            let val = (m as any)[col] ?? '';
            val = String(val).replace(/"/g, '""');
            if (val.includes(',') || val.includes('\n') || val.includes('"')) {
                val = `"${val}"`;
            }
            return val;
        }).join(',');
    });
    const csvContent = "\uFEFF" + [headers, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ShippingSchedule_Export_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadTemplate = () => {
    const csvContent = "\uFEFF" + shipColumns.join(',');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Plantilla_ShippingSchedule_Import.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const buffer = evt.target?.result as ArrayBuffer;
          if (!buffer) return;
          const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
          const records: ShippingModel[] = [];

          for (const sheetName of workbook.SheetNames) {
              const sheet = workbook.Sheets[sheetName];
              const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false, hidden: true } as any) as any[][];
              
              if (rows.length < 2) continue;

              // Robust Case-Insensitive Header Finder
              let headerIdx = rows.findIndex(r => Array.isArray(r) && r.some(c => {
                  const val = String(c).toUpperCase().replace(/[\s\.\-\_]/g, '');
                  return val === 'INVOICENO' || val === 'INVOICE' || val === 'MODELO' || val === 'MODEL' || val === 'CFPORDER';
              }));
              
              if (headerIdx === -1) headerIdx = 0;

              const headers = rows[headerIdx].map((h: any) => h?.toString().trim() || '');

              for (let i = headerIdx + 1; i < rows.length; i++) {
                  const row = rows[i];
                  if (!row || row.length === 0) continue;
                  
                  // Normalize keys to lowercase no-spaces for robust matching
                  const model: any = {};
                  headers.forEach((h: string, idx: number) => { 
                    if (!h) return;
                    const key = String(h).toLowerCase().replace(/[\s\.\-\_]/g, '');
                    model[key] = row[idx]?.toString().trim() || ''; 
                  });
                  
                  const invoiceKey = model.invoiceno || model.invoice || '';
                  if (invoiceKey) {
                      const sanitizedModel: ShippingModel = {
                          invoiceNo: invoiceKey,
                          modelo: model.modelo || model.model || '',
                          cfpContractNo: model.cfpcontractno || model.cfpcontract || '',
                          color: model.color || '',
                          truck: model.truck || model.truckcontainer || '',
                          etd: model.etd || '',
                          etaToDoor: model.etatodoor || model.eta || ''
                      };
                      if(model.id) sanitizedModel.id = model.id;
                      if(model.cfccontractno || model.cfccontract) sanitizedModel.cfcContractNo = model.cfccontractno || model.cfccontract;
                      
                      const rawQty = model.qty || model.quantity || '';
                      if(rawQty) sanitizedModel.qty = Number(rawQty) || 0;
                      
                      if(model.destination) sanitizedModel.destination = model.destination;
                      if(model.cfporder) sanitizedModel.cfpOrder = model.cfporder;
                      if(model.cfcorder) sanitizedModel.cfcOrder = model.cfcorder;
                      if(model.issue) sanitizedModel.issue = model.issue;
                      if(model.productno) sanitizedModel.productNo = model.productno;
                      if(model.epa) sanitizedModel.epa = model.epa;
                      if(model.productiondate) sanitizedModel.productionDate = model.productiondate;
                      if(model.loadingdate) sanitizedModel.loadingDate = model.loadingdate;
                      if(model.trailerno || model.trailer) sanitizedModel.trailerNo = model.trailerno || model.trailer;
                      if(model.carrier) sanitizedModel.carrier = model.carrier;
                      if(model.remarks || model.remark) sanitizedModel.remarks = model.remarks || model.remark;

                      records.push(sanitizedModel);
                  }
              }
          }

          if (records.length === 0) return alert("No se encontraron registros con 'Invoice No.'. Revisa el formato del archivo.");

          // Validación de Duplicados (Match determinista por Factura)
          let conflicts = 0;
          const norm = (str: any) => String(str || '').trim().toLowerCase();
          const getMatchKey = (s: ShippingModel) => norm(s.invoiceNo);
          
          records.forEach(r => {
             const keyR = getMatchKey(r);
             const existing = schedules.find(s => getMatchKey(s) === keyR);
             if (existing && existing.id) {
                 conflicts++;
                 r.id = existing.id; // Heredar ID para que actualice la línea exacta
             }
          });

          if (conflicts > 0) {
              const proceed = window.confirm(`⚠️ ¡Atención! Se han detectado ${conflicts} despachos que ya existen (mismo Invoice No).\n\n¿Deseas sobrescribir su información con los datos actualizados de este archivo?`);
              if (!proceed) {
                  if (fileInputRef.current) fileInputRef.current.value = '';
                  return; // Cancelar
              }
          }

          if(confirm(`Se procesarán ${records.length} despachos. ¿Proceder a inyectar en Firebase?`)){
              setLoading(true);
              let successCount = 0;
              
              try {
                  successCount = await shippingService.bulkUpsert(records);
              } catch(e) {
                  console.error("Critical error in bulk upsert:", e);
                  alert("⚠️ Error crítico al transferir a Firebase. Verifica tu conexión de red.");
              }
              
              if (successCount === 0 && records.length > 0) {
                 alert("⚠️ Error: Firebase rechazó los registros. Verifica que no haya datos anómalos.");
              } else {
                 alert(`Carga veloz exitosa: ${successCount} registros consolidados.`);
              }
              
              loadSchedules();
              setLoading(false);
          }
        } catch (err: any) {
             alert("Error crítico procesando Excel: " + err.message);
             console.error(err);
        }
      };
      reader.readAsArrayBuffer(file);
      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="p-6 max-w-[95%] mx-auto animate-fade-in flex flex-col h-full">
      <div className="flex justify-between items-center mb-6">
        <div>
           <h1 className="text-2xl font-bold text-slate-800">Catálogo: Shipping Schedule</h1>
           <p className="text-slate-500 text-sm mt-1">Diccionario de asignación marítima y de camiones (CFM/CFP)</p>
        </div>
        
        <div className="flex items-center gap-3">
             <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                    type="text" 
                    placeholder="Buscar Invoice, Contract..." 
                    value={searchTerm} 
                    onChange={e => setSearchTerm(e.target.value)}
                    className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm w-64 shadow-sm"
                />
             </div>
             
             <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg p-1 shadow-sm">
                 <input type="file" ref={fileInputRef} className="hidden" accept=".csv, .xlsx, .xls" onChange={handleFileUpload} />
                 <button onClick={downloadTemplate} className="p-1.5 text-slate-500 hover:text-cyan-600 hover:bg-cyan-50 rounded" title="Plantilla Excel/CSV"><FileSpreadsheet size={18} /></button>
                 <button onClick={() => fileInputRef.current?.click()} className="p-1.5 text-slate-500 hover:text-green-600 hover:bg-green-50 rounded" title="Importar Excel"><UploadCloud size={18} /></button>
                 <div className="w-px h-5 bg-slate-200 mx-1"></div>
                 <button onClick={exportToCSV} className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded flex items-center gap-1 text-xs font-bold pr-3"><Download size={18} /> CSV</button>
             </div>

             <button onClick={() => setIsMassQueryOpen(true)} className={`px-4 py-2 flex items-center rounded-lg border text-sm font-medium shadow-sm ${activeMassQuery ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-300'}`}>
                 <Filter size={16} className="mr-2" /> Mass Query
             </button>
             <button onClick={() => { setFormData({}); setIsEditing(false); setShowModal(true); }} className="bg-cyan-600 text-white px-4 py-2 flex items-center rounded-lg hover:bg-cyan-700 shadow-md shadow-cyan-500/30 text-sm font-bold">
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
                {shipColumns.map(col => <th key={col} className="p-3 font-bold border-r border-slate-100">{col}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredSchedules.map(m => (
                <tr key={m.id || m.invoiceNo} className="hover:bg-slate-50 transition-colors group">
                  <td className="p-3 flex gap-2 justify-center items-center sticky left-0 bg-white group-hover:bg-slate-50 shadow-[5px_0_10px_-5px_rgba(0,0,0,0.05)] transition-colors z-10 border-r border-slate-100">
                    <button onClick={() => { setFormData(m); setIsEditing(true); setShowModal(true); }} className="p-1.5 text-cyan-600 hover:bg-cyan-100 rounded" title="Editar"><Edit2 size={14} /></button>
                    <button onClick={() => handleDelete(m.id!)} className="p-1.5 text-red-600 hover:bg-red-100 rounded" title="Eliminar"><Trash2 size={14} /></button>
                  </td>
                  {shipColumns.map(col => <td key={col} className="p-3 border-r border-slate-50 text-slate-700">{String((m as any)[col] || '-')}</td>)}
                </tr>
              ))}
              {filteredSchedules.length === 0 && !loading && <tr><td colSpan={20} className="p-12 text-center text-slate-400">Sin registros.</td></tr>}
              {loading && <tr><td colSpan={20} className="p-12 text-center text-slate-400">Cargando Shipping Schedules...</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <CatalogQueryBuilder isOpen={isMassQueryOpen} onClose={() => setIsMassQueryOpen(false)} columns={shipColumns} conditions={queryConditions} setConditions={setQueryConditions} onApply={handleApplyMassQuery} onClear={handleClearMassQuery} />

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[110] p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between bg-slate-50">
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Ship className="text-cyan-600" /> {isEditing ? `Editar Invoice: ${formData.invoiceNo}` : 'Nuevo Dispatch'}</h2>
                <button onClick={() => setShowModal(false)} className="text-slate-400">Cerrar</button>
            </div>
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div><label className="block text-xs font-bold text-slate-500 mb-1">Invoice No *</label><input required disabled={isEditing} value={formData.invoiceNo || ''} onChange={e=>setFormData({...formData, invoiceNo: e.target.value.toUpperCase()})} className="w-full border p-2 rounded-lg font-mono focus:ring-cyan-500" /></div>
                <div><label className="block text-xs font-bold text-slate-500 mb-1">CFP Contract No</label><input value={formData.cfpContractNo || ''} onChange={e=>setFormData({...formData, cfpContractNo: e.target.value.toUpperCase()})} className="w-full border p-2 rounded-lg" /></div>
                <div><label className="block text-xs font-bold text-slate-500 mb-1">Modelo</label><input required value={formData.modelo || ''} onChange={e=>setFormData({...formData, modelo: e.target.value})} className="w-full border p-2 rounded-lg" /></div>
                <div><label className="block text-xs font-bold text-slate-500 mb-1">Truck Container</label><input value={formData.truck || ''} onChange={e=>setFormData({...formData, truck: e.target.value})} className="w-full border p-2 rounded-lg" /></div>
                <div><label className="block text-xs font-bold text-slate-500 mb-1">Color</label><input value={formData.color || ''} onChange={e=>setFormData({...formData, color: e.target.value})} className="w-full border p-2 rounded-lg" /></div>
                <div><label className="block text-xs font-bold text-slate-500 mb-1">ETD</label><input value={formData.etd || ''} onChange={e=>setFormData({...formData, etd: e.target.value})} className="w-full border p-2 rounded-lg" /></div>
              </div>
            </form>
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2.5 bg-white border border-slate-300 font-bold text-slate-600 rounded-xl">Cancelar</button>
              <button onClick={handleSubmit} className="px-8 py-2.5 bg-cyan-600 text-white font-bold rounded-xl shadow-lg shadow-cyan-500/30">GUARDAR</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
