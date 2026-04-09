import React, { useState, useEffect, useMemo, useRef } from 'react';
import { cajaService } from '../services/cajaService';
import { carrierService } from '../services/carrierService';
import { transportLineService } from '../services/transportLineService';
import { apendice10Service } from '../services/apendice10Service';
import { CajaModel } from '../types/caja';
import { CarrierModel } from '../types/carrier';
import { TransportLineModel } from '../types/transportLine';
import { Apendice10Model } from '../types/apendice10';
import { Plus, Edit2, Trash2, Search, Filter, Container, Download, UploadCloud, FileSpreadsheet } from 'lucide-react';
import { CatalogQueryBuilder, QueryCondition, evaluateCondition } from '../components/CatalogQueryBuilder';
import { SearchableComboBox, ComboOption } from '../components/SearchableComboBox';
import { parseCSV } from '../utils/csvHelpers';

export const Cajas: React.FC = () => {
  const [cajas, setCajas] = useState<CajaModel[]>([]);
  const [carriers, setCarriers] = useState<CarrierModel[]>([]);
  const [transportLines, setTransportLines] = useState<TransportLineModel[]>([]);
  const [apendice10List, setApendice10List] = useState<Apendice10Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<Partial<CajaModel>>({});
  const [isEditing, setIsEditing] = useState(false);

  // Search & Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const [isMassQueryOpen, setIsMassQueryOpen] = useState(false);
  const [queryConditions, setQueryConditions] = useState<QueryCondition[]>([
      { id: '1', column: 'NumeroCaja', operator: 'in', type: 'string', input: '' }
  ]);
  const [activeMassQuery, setActiveMassQuery] = useState<QueryCondition[] | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const cajaColumns = ['NumeroCaja', 'carrierCodigo', 'TransportLine', 'nombreSubLinea', 'TipoCaja', 'placas'];

  useEffect(() => {
    loadCajas();
  }, []);

  const loadCajas = async () => {
    const [data, carriersData, linesData, apData] = await Promise.all([
        cajaService.getAllCajas(),
        carrierService.getAllCarriers(),
        transportLineService.getAllTransportLines(),
        apendice10Service.getAllRegistros()
    ]);
    setCajas(data);
    setCarriers(carriersData);
    setTransportLines(linesData);
    setApendice10List(apData.sort((a,b) => parseInt(a.clave) - parseInt(b.clave)));
    setLoading(false);
  };

  const filteredCajas = useMemo(() => {
    let result = cajas;
    if (searchTerm) {
        const lowerTerm = searchTerm.toLowerCase();
        result = result.filter(c => 
            c.NumeroCaja.toLowerCase().includes(lowerTerm) || 
            c.carrierCodigo.toLowerCase().includes(lowerTerm) ||
            c.TransportLine.toLowerCase().includes(lowerTerm) ||
            (c.nombreSubLinea && c.nombreSubLinea.toLowerCase().includes(lowerTerm)) ||
            c.TipoCaja.toLowerCase().includes(lowerTerm)
        );
    }
    if (activeMassQuery && activeMassQuery.length > 0) {
        result = result.filter(c => {
           return activeMassQuery.every(cond => {
               const targetVal = c[cond.column as keyof CajaModel];
               return evaluateCondition(targetVal, cond);
           });
        });
    }
    return result;
  }, [cajas, searchTerm, activeMassQuery]);

  const handleApplyMassQuery = () => {
      const valid = queryConditions.filter(c => c.operator === 'empty' || c.operator === 'not_empty' || c.input.trim());
      setActiveMassQuery(valid.length > 0 ? valid : null);
      setIsMassQueryOpen(false);
  };

  const handleClearMassQuery = () => {
      setActiveMassQuery(null);
      setQueryConditions([{ id: Math.random().toString(), column: 'NumeroCaja', operator: 'in', type: 'string', input: '' }]);
      setIsMassQueryOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.NumeroCaja || !formData.carrierCodigo) return;

    if (isEditing) {
      await cajaService.updateCaja(formData.NumeroCaja, formData);
    } else {
      await cajaService.addCaja(formData as CajaModel);
    }
    setShowModal(false);
    loadCajas();
  };

  const handleDelete = async (numero: string) => {
    if (confirm("¿Seguro que deseas eliminar esta Caja/Contenedor?")) {
      await cajaService.deleteCaja(numero);
      loadCajas();
    }
  };

  // HARDENED Relational DB Extraction to safely navigate residual data mismatches (spaces, arrays, case differences)
  const getSafeSubline = (record: any): string => {
      let sub = String(record.nombreSubLinea || '').trim();
      if (!sub && Array.isArray(record.subLineas)) {
          sub = String(record.subLineas[0] || '').trim();
      }
      return sub.toUpperCase();
  };

  const getValidSublines = (targetTL: string) => {
      const matchTL = String(targetTL || '').trim().toUpperCase();
      const docs = transportLines.filter(l => String(l.TransportLine || '').trim().toUpperCase() === matchTL);
      const extracted = docs.map(getSafeSubline).filter(v => v !== '');
      return Array.from(new Set(extracted));
  };

  const openEdit = (caja: CajaModel) => {
    const validSubs = getValidSublines(caja.TransportLine);
    let defaultSub = String(caja.nombreSubLinea || '').trim().toUpperCase();
    if (!defaultSub || !validSubs.includes(defaultSub)) {
        defaultSub = validSubs[0] || '';
    }
    setFormData({...caja, nombreSubLinea: defaultSub});
    setIsEditing(true);
    setShowModal(true);
  };

  const openNew = () => {
    setFormData({});
    setIsEditing(false);
    setShowModal(true);
  };

  // --- CSV LOGIC ---
  const exportToCSV = () => {
      const headers = ["NÚMERO CAJA", "CARRIER (SCAC)", "LÍNEA TRANSPORTE", "NOMBRE SUB-LÍNEA", "APÉNDICE 10", "TIPO CAJA", "PLACAS"];
      const rows = filteredCajas.map(c => [
          c.NumeroCaja,
          c.carrierCodigo,
          c.TransportLine,
          c.nombreSubLinea || '',
          c.claveApendice10 || '',
          c.TipoCaja,
          c.placas || ''
      ]);
      const csvContent = [headers, ...rows].map(e => e.map(item => `"${(item || '').replace(/"/g, '""')}"`).join(",")).join("\n");
      const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `Cajas_Export_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const downloadTemplate = () => {
      const headers = ["NÚMERO CAJA", "CARRIER (SCAC)", "LÍNEA TRANSPORTE", "NOMBRE SUB-LÍNEA", "APÉNDICE 10 (CLAVE)", "TIPO CAJA", "PLACAS"];
      const example = ["EMCU-123456", "EGLV", "APL Logistics", "DIVISION REEFER", "8", "40HC", "123-AB-4C"];
      const csvContent = [headers, example].map(e => e.join(",")).join("\n");
      const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", "plantilla_cajas.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (evt) => {
          const text = evt.target?.result as string;
          const rows = parseCSV(text);
          if (rows.length < 2) return alert("El archivo está vacío o no tiene datos válidos.");

          const headers = rows[0].map(h => h.trim().toUpperCase());
          const nIdx = headers.findIndex(h => h.includes('NÚMERO CAJA') || h.includes('NUMERO CAJA') || h.includes('NUMEROCAJA'));
          const cIdx = headers.findIndex(h => h.includes('CARRIER') || h.includes('SCAC'));
          const lIdx = headers.findIndex(h => h.includes('LÍNEA TRANSPORTE') || h.includes('LINEA') || h.includes('LÍNEA'));
          const sIdx = headers.findIndex(h => h.includes('NOMBRE SUB-LÍNEA') || h.includes('SUB') || h.includes('SUB-LINEA'));
          const aIdx = headers.findIndex(h => h.includes('APÉNDICE') || h.includes('APENDICE') || h.includes('10'));
          const tIdx = headers.findIndex(h => h.includes('TIPO CAJA') || h.includes('TIPO'));
          const pIdx = headers.findIndex(h => h.includes('PLACAS'));

          if (nIdx === -1 || cIdx === -1) {
              return alert("Estructura inválida. Asegúrate de usar la plantilla descargable con NÚMERO CAJA y CARRIER (SCAC).");
          }

          setLoading(true);
          const records: CajaModel[] = [];

          for (let i = 1; i < rows.length; i++) {
              const r = rows[i];
              if (!r[nIdx] || !r[cIdx]) continue;
              
              records.push({
                  NumeroCaja: r[nIdx].trim().toUpperCase(),
                  carrierCodigo: r[cIdx].trim().toUpperCase(),
                  TransportLine: lIdx !== -1 ? r[lIdx]?.trim() : '',
                  nombreSubLinea: sIdx !== -1 ? r[sIdx]?.trim().toUpperCase() : '',
                  claveApendice10: aIdx !== -1 ? r[aIdx]?.trim() : '',
                  TipoCaja: tIdx !== -1 ? r[tIdx]?.trim().toUpperCase() : '',
                  placas: pIdx !== -1 ? r[pIdx]?.trim().toUpperCase() : ''
              });
          }

          if (records.length === 0) {
              alert("No se encontraron registros válidos. Obligatorios: NÚMERO CAJA, CARRIER (SCAC).");
              setLoading(false);
              if (fileInputRef.current) fileInputRef.current.value = '';
              return;
          }

          if(confirm(`Se procesarán ${records.length} cajas. ¿Proceder?`)){
              let successCount = 0;
              for(const rec of records) {
                  try {
                     await cajaService.updateCaja(rec.NumeroCaja, rec).catch(() => cajaService.addCaja(rec));
                     successCount++;
                  } catch(e) { console.error("Error importing", rec.NumeroCaja, e); }
              }
              alert(`¡Carga exitosa! Se procesaron ${successCount} registros.`);
              loadCajas();
          } else {
              setLoading(false);
          }
          if (fileInputRef.current) fileInputRef.current.value = '';
      };
      reader.readAsText(file);
  };

  return (
    <div className="p-6 w-full mx-auto animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <div>
           <h1 className="text-2xl font-bold text-slate-800">Catálogo de Cajas y Contenedores</h1>
           <p className="text-slate-500 text-sm mt-1">Gestión de remolques relacionales con Transportistas</p>
        </div>
        
        <div className="flex items-center gap-3">
             <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                    type="text" 
                    placeholder="Buscar Caja..." 
                    value={searchTerm} 
                    onChange={e => setSearchTerm(e.target.value)}
                    className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 outline-none w-64 shadow-sm"
                />
             </div>
             
             {/* CSV Controls */}
             <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg p-1 shadow-sm">
                 <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={handleFileUpload} />
                 <button onClick={downloadTemplate} className="p-1.5 text-slate-500 hover:text-violet-600 hover:bg-violet-50 rounded transition-colors" title="Descargar Plantilla CSV">
                    <FileSpreadsheet size={18} />
                 </button>
                 <button onClick={() => fileInputRef.current?.click()} className="p-1.5 text-slate-500 hover:text-green-600 hover:bg-green-50 rounded transition-colors" title="Importar Cajas Csv">
                    <UploadCloud size={18} />
                 </button>
                 <div className="w-px h-5 bg-slate-200 mx-1"></div>
                 <button onClick={exportToCSV} className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors flex items-center gap-1 text-xs font-bold pr-3" title="Descargar vista actual">
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
             <button onClick={openNew} className="bg-violet-600 text-white px-4 py-2 flex items-center rounded-lg hover:bg-violet-700 shadow-md shadow-violet-500/30 transition-all font-medium text-sm">
                <Plus size={18} className="mr-2" /> Nueva Caja
             </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs uppercase tracking-wider">
            <tr>
              <th className="p-4 font-medium">Número Caja</th>
              <th className="p-4 font-medium">Carrier Enlace</th>
              <th className="p-4 font-medium">Línea Transporte</th>
              <th className="p-4 font-medium">Sub-Línea</th>
              <th className="p-4 font-medium">Clave Ap. 10</th>
              <th className="p-4 font-medium">Tipo Caja</th>
              <th className="p-4 font-medium">Placas</th>
              <th className="p-4 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {filteredCajas.map(c => (
              <tr key={c.NumeroCaja} className="hover:bg-slate-50 transition-colors">
                <td className="p-4 font-semibold text-slate-800 flex items-center gap-2">
                    <Container size={14} className="text-violet-500" />
                    {c.NumeroCaja}
                </td>
                <td className="p-4 text-indigo-600 font-medium">{c.carrierCodigo}</td>
                <td className="p-4 text-slate-600">{c.TransportLine}</td>
                <td className="p-4 text-slate-600 font-medium">{c.nombreSubLinea || '-'}</td>
                <td className="p-4 text-slate-500 font-mono font-semibold text-center">{c.claveApendice10 || '-'}</td>
                <td className="p-4 text-slate-600">
                   <span className="bg-slate-100 text-slate-600 px-2 py-1 flex items-center w-max rounded text-xs font-mono border border-slate-200">
                    {c.TipoCaja}
                   </span>
                </td>
                <td className="p-4 font-mono text-slate-500 text-xs uppercase font-medium">{c.placas || '-'}</td>
                <td className="p-4 flex gap-2 justify-end items-center">
                  <button onClick={() => openEdit(c)} className="p-1.5 text-violet-600 hover:bg-violet-100 rounded transition-colors" title="Editar">
                    <Edit2 size={16} />
                  </button>
                  <button onClick={() => handleDelete(c.NumeroCaja)} className="p-1.5 text-red-600 hover:bg-red-100 rounded transition-colors" title="Eliminar">
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {filteredCajas.length === 0 && !loading && (
              <tr><td colSpan={7} className="p-12 text-center text-slate-400">No hay cajas o contenedores registrados.</td></tr>
            )}
            {loading && <tr><td colSpan={7} className="p-12 text-center text-slate-400">Cargando flota...</td></tr>}
          </tbody>
        </table>
      </div>

      <CatalogQueryBuilder 
          isOpen={isMassQueryOpen}
          onClose={() => setIsMassQueryOpen(false)}
          columns={cajaColumns}
          conditions={queryConditions}
          setConditions={setQueryConditions}
          onApply={handleApplyMassQuery}
          onClear={handleClearMassQuery}
      />

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <Container className="text-violet-600" />
                    {isEditing ? `Editar Caja: ${formData.NumeroCaja}` : 'Registrar Nueva Caja'}
                </h2>
                <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600"><Trash2 className="opacity-0" size={1} />Cerrar</button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Número de Caja / Placa</label>
                <input required disabled={isEditing} value={formData.NumeroCaja || ''} onChange={e => setFormData({...formData, NumeroCaja: e.target.value.toUpperCase()})} className="w-full border border-slate-300 rounded-lg p-2.5 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-violet-500 outline-none uppercase disabled:opacity-60 font-mono" placeholder="Ej. YM-4512" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Código SCAC (Carrier Link)</label>
                <SearchableComboBox
                  required
                  disabled={isEditing}
                  value={formData.carrierCodigo || ''}
                  onChange={val => setFormData({...formData, carrierCodigo: val, TransportLine: '', nombreSubLinea: ''})}
                  options={carriers.map(c => ({ value: c.codigo, label: c.nombre, sublabel: c.codigo }))}
                  placeholder="Selecciona el SCAC (Carrier)..."
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Línea Transportista</label>
                <SearchableComboBox
                  required
                  disabled={!formData.carrierCodigo}
                  value={formData.TransportLine || ''}
                  onChange={val => {
                    const validSubs = getValidSublines(val);
                    setFormData({...formData, TransportLine: val, nombreSubLinea: validSubs[0] || ''});
                  }}
                  options={Array.from(new Set(transportLines
                    .filter(l => String(l.carrierCodigo || '').trim().toUpperCase() === String(formData.carrierCodigo || '').trim().toUpperCase())
                    .map(l => l.TransportLine)))
                    .map(tl => ({ value: tl, label: tl }))}
                  placeholder="Selecciona la Transport Line..."
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Nombre Sub-Línea</label>
                <SearchableComboBox
                    required 
                    disabled={!formData.TransportLine}
                    value={formData.nombreSubLinea || ''} 
                    onChange={val => setFormData({...formData, nombreSubLinea: val})} 
                    options={getValidSublines(formData.TransportLine || '').map(sl => ({ value: sl, label: sl }))}
                    placeholder="Selecciona la Sub-Línea..."
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Clave Apéndice 10 (Anexo 22)</label>
                <SearchableComboBox
                    value={formData.claveApendice10 || ''} 
                    onChange={val => {
                        const match = apendice10List.find(a => a.clave === val);
                        const tipoCajaVal = match ? match.descripcion : (formData.TipoCaja || '');
                        setFormData({...formData, claveApendice10: val, TipoCaja: tipoCajaVal});
                    }}
                    options={apendice10List.map(a => ({ value: a.clave, label: a.descripcion, sublabel: a.clave }))}
                    placeholder="Selecciona código y llena el tipo..."
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Tipo de Caja (Seca, Plana Refr.)</label>
                <input required value={formData.TipoCaja || ''} onChange={e => setFormData({...formData, TipoCaja: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-violet-500 outline-none uppercase" placeholder="Ej. CONTENEDOR ESTÁNDAR 40'" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Placas (Opcional)</label>
                <input value={formData.placas || ''} onChange={e => setFormData({...formData, placas: e.target.value.toUpperCase()})} className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-violet-500 outline-none uppercase font-mono" placeholder="Ej. 12-AB-3C" />
              </div>
              
              <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
                <button type="submit" className="bg-violet-600 text-white px-6 py-2 rounded-lg hover:bg-violet-700 shadow-md shadow-violet-500/30 transition-all font-bold">
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
