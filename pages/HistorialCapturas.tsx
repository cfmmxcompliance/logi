import React, { useState, useEffect } from 'react';
import { capturaService } from '../services/capturaService';
import { CapturaLayout } from '../types/capturaLayout';
import {
  History, Search, Download, Trash2, Eye, X,
  PackageOpen, CheckCircle2, XCircle, FileCheck,
  ChevronRight, Loader2
} from 'lucide-react';

export const HistorialCapturas: React.FC = () => {
  const [records, setRecords]           = useState<CapturaLayout[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [selected, setSelected]         = useState<CapturaLayout | null>(null);
  const [deleting, setDeleting]         = useState<string | null>(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try { setRecords(await capturaService.getAll()); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(`¿Eliminar la captura "${id}"? Esta acción es irreversible.`)) return;
    setDeleting(id);
    await capturaService.delete(id);
    setRecords(r => r.filter(x => x.id !== id));
    if (selected?.id === id) setSelected(null);
    setDeleting(null);
  };

  const exportCSV = (rec: CapturaLayout) => {
    const headers = [
      'SEC','CONTENEDOR','SELLO','FECHA_SALIDA','VIN','MOTOR','MODELO','COLOR',
      'PRODUCT_NO','FECHA_PROD','FRACCION_ARANCELARIA','HTSUS','INCOTERM',
      'CLAVE_PEDIMENTO','UNIDAD_ADUANA','CANTIDAD_ADUANA','VALOR_USD',
      'PESO_NETO_KG','PESO_BRUTO_KG','INVOICE_NO','CFP_CONTRACT'
    ];
    const rows = rec.vins.map((v, i) => [
      i+1, v.containerNo, v.sealNo||'', v.outDate,
      v.vin, v.engine, v.modelo, v.color, v.productNo||'',
      v.productionDate||'', v.taric, v.htsus, v.incoterm||'',
      v.clavePedimento||'', v.unidadAduana||'PZA', v.cantidadAduana??1,
      Number(v.valorUsd||0).toFixed(2), Number(v.pesoNeto||0).toFixed(2),
      Number(v.pesoBruto||0).toFixed(2), rec.invoiceNo, rec.cfpContractNo
    ]);
    const csv = [headers, ...rows]
      .map(r => r.map(c => `"${String(c??'').replace(/"/g,'""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `layout_aduanal_${rec.invoiceNo}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const filtered = records.filter(r =>
    r.invoiceNo?.toLowerCase().includes(search.toLowerCase()) ||
    r.cfpContractNo?.toLowerCase().includes(search.toLowerCase()) ||
    r.containers?.some(c => c.toLowerCase().includes(search.toLowerCase()))
  );

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      final:   'bg-emerald-100 text-emerald-700 border-emerald-200',
      draft:   'bg-amber-100 text-amber-700 border-amber-200',
      enviado: 'bg-blue-100 text-blue-700 border-blue-200',
    };
    return map[s] || 'bg-slate-100 text-slate-600 border-slate-200';
  };

  return (
    <div className="p-6 max-w-[98%] mx-auto animate-fade-in flex flex-col h-full gap-5">

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <History className="text-blue-600" /> Historial de Capturas Aduanales
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Layouts generados con el Motor de Captura (Macro Automática). {records.length} registros guardados.
          </p>
        </div>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar invoice, contrato, contenedor..."
            className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none w-72 shadow-sm"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex-1 flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-800 text-white text-xs uppercase font-bold">
              <tr>
                <th className="px-5 py-4">Invoice No.</th>
                <th className="px-5 py-4">CFP Contract</th>
                <th className="px-5 py-4 text-center">Unidades</th>
                <th className="px-5 py-4 text-center">Contenedores</th>
                <th className="px-5 py-4 text-right">Valor USD</th>
                <th className="px-5 py-4 text-right">Peso Bruto</th>
                <th className="px-5 py-4">Guardado</th>
                <th className="px-5 py-4 text-center">Estatus</th>
                <th className="px-5 py-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr><td colSpan={9} className="px-5 py-12 text-center text-slate-400">
                  <Loader2 size={20} className="animate-spin mx-auto mb-2 text-blue-400" />Cargando historial...
                </td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={9} className="px-5 py-16 text-center">
                  <PackageOpen size={40} className="mx-auto mb-3 text-slate-300" />
                  <p className="text-slate-400 font-medium">No hay capturas guardadas</p>
                  <p className="text-slate-300 text-xs mt-1">Genera un layout en el Motor de Captura y haz clic en "Guardar en Sistema"</p>
                </td></tr>
              )}
              {filtered.map(rec => (
                <tr key={rec.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-5 py-3.5 font-black font-mono text-blue-700">{rec.invoiceNo || '—'}</td>
                  <td className="px-5 py-3.5 font-mono text-slate-600">{rec.cfpContractNo || '—'}</td>
                  <td className="px-5 py-3.5 text-center font-bold text-slate-800">{rec.totalUnits}</td>
                  <td className="px-5 py-3.5 text-center">
                    <div className="flex flex-wrap gap-1 justify-center">
                      {(rec.containers || []).map(c => (
                        <span key={c} className="text-[10px] font-mono bg-cyan-50 text-cyan-700 px-1.5 py-0.5 rounded border border-cyan-200">{c}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-right font-bold text-emerald-700">
                    ${Number(rec.totalValUsd||0).toLocaleString('en-US', { minimumFractionDigits:2 })}
                  </td>
                  <td className="px-5 py-3.5 text-right text-slate-600">
                    {Number(rec.totalPesoBruto||0).toLocaleString('es-MX')} kg
                  </td>
                  <td className="px-5 py-3.5 text-slate-500 text-xs whitespace-nowrap">
                    {capturaService.formatDate(rec.savedAt)}
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full border ${statusBadge(rec.status)}`}>
                      {rec.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2 justify-center">
                      <button onClick={() => setSelected(rec)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Ver detalle">
                        <Eye size={16} />
                      </button>
                      <button onClick={() => exportCSV(rec)}
                        className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="Descargar CSV">
                        <Download size={16} />
                      </button>
                      <button onClick={() => handleDelete(rec.id)}
                        disabled={deleting === rec.id}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40" title="Eliminar">
                        {deleting === rec.id ? <Loader2 size={16} className="animate-spin"/> : <Trash2 size={16} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            {filtered.length > 0 && (
              <tfoot className="bg-slate-800 text-white text-xs font-bold sticky bottom-0">
                <tr>
                  <td colSpan={2} className="px-5 py-3 text-slate-300 uppercase">
                    {filtered.length} capturas
                  </td>
                  <td className="px-5 py-3 text-center">
                    {filtered.reduce((s,r) => s + (r.totalUnits||0), 0)}
                  </td>
                  <td className="px-5 py-3 text-center text-slate-300">—</td>
                  <td className="px-5 py-3 text-right text-emerald-400">
                    ${filtered.reduce((s,r) => s + Number(r.totalValUsd||0), 0).toLocaleString('en-US',{minimumFractionDigits:2})}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {filtered.reduce((s,r) => s + Number(r.totalPesoBruto||0), 0).toLocaleString('es-MX')} kg
                  </td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {selected && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">

            {/* Modal header */}
            <div className="bg-gradient-to-r from-blue-700 to-indigo-800 px-6 py-5 text-white flex justify-between items-start">
              <div>
                <p className="text-blue-200 text-xs font-bold uppercase tracking-widest mb-0.5">Layout Aduanal — Historial</p>
                <h2 className="text-2xl font-black">{selected.invoiceNo}</h2>
                <p className="text-blue-200 text-sm mt-1 font-mono">CFP: {selected.cfpContractNo} · {selected.totalUnits} vehículos · {capturaService.formatDate(selected.savedAt)}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => exportCSV(selected)}
                  className="flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white font-bold px-4 py-2 rounded-xl text-sm border border-white/20">
                  <Download size={15} /> CSV
                </button>
                <button onClick={() => setSelected(null)}
                  className="text-white/60 hover:text-white p-2 rounded-lg hover:bg-white/10">
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 bg-slate-50 border-b border-slate-100">
              {[
                { label:'Total Unidades', value: selected.totalUnits.toLocaleString(), icon:'🚗' },
                { label:'Contenedores', value: (selected.containers||[]).length.toLocaleString(), icon:'📦' },
                { label:'Valor USD', value:'$'+Number(selected.totalValUsd||0).toLocaleString('en-US',{minimumFractionDigits:2}), icon:'💵' },
                { label:'Peso Bruto', value:Number(selected.totalPesoBruto||0).toLocaleString('es-MX')+' kg', icon:'⚖️' },
              ].map(c => (
                <div key={c.label} className="bg-white rounded-xl border border-slate-200 p-4">
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">{c.label}</p>
                  <p className="text-xl font-black text-slate-800 mt-1">{c.icon} {c.value}</p>
                </div>
              ))}
            </div>

            {/* VIN table */}
            <div className="overflow-auto flex-1">
              <table className="w-full text-xs whitespace-nowrap">
                <thead className="bg-slate-800 text-white font-bold uppercase sticky top-0 z-10">
                  <tr>
                    {['#','Contenedor','Sello','VIN','Motor','Modelo','Color','Product No.','Fracción','HTSUS','Incoterm','Valor USD','Peso Neto','Peso Bruto','BOM'].map(h => (
                      <th key={h} className="px-3 py-3 text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(selected.vins||[]).map((v, i) => (
                    <tr key={i} className={`hover:bg-blue-50 transition-colors ${i%2===0?'bg-white':'bg-slate-50/50'}`}>
                      <td className="px-3 py-2 text-slate-400 font-bold">{i+1}</td>
                      <td className="px-3 py-2 font-mono text-cyan-700 font-bold">{v.containerNo}</td>
                      <td className="px-3 py-2 font-mono text-slate-500">{v.sealNo||'—'}</td>
                      <td className="px-3 py-2 font-mono font-black text-slate-800">{v.vin}</td>
                      <td className="px-3 py-2 font-mono text-slate-600">{v.engine}</td>
                      <td className="px-3 py-2 font-semibold text-slate-700">{v.modelo}</td>
                      <td className="px-3 py-2 text-slate-600">{v.color}</td>
                      <td className="px-3 py-2 font-mono text-indigo-600">{v.productNo||'—'}</td>
                      <td className="px-3 py-2 font-mono">
                        {v.taric ? <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-bold">{v.taric}</span> : <span className="text-red-400">N/A</span>}
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-600">{v.htsus||'—'}</td>
                      <td className="px-3 py-2">{v.incoterm||'—'}</td>
                      <td className="px-3 py-2 text-right font-bold text-emerald-700">${Number(v.valorUsd||0).toLocaleString('en-US',{minimumFractionDigits:2})}</td>
                      <td className="px-3 py-2 text-right">{Number(v.pesoNeto||0).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">{Number(v.pesoBruto||0).toFixed(2)}</td>
                      <td className="px-3 py-2 text-center">
                        {v.bomFound ? <CheckCircle2 size={14} className="text-emerald-500 mx-auto"/> : <XCircle size={14} className="text-red-400 mx-auto"/>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HistorialCapturas;
