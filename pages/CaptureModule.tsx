import React, { useState, useEffect, useMemo } from 'react';
import { FileDown, UploadCloud, Truck, FileCheck, CheckCircle2, XCircle, ChevronRight, PackageOpen, Info, Anchor, Calendar, DatabaseZap, AlertTriangle, Download, RotateCcw, Container } from 'lucide-react';
import { shippingService } from '../services/shippingService';
import { expoService } from '../services/expoService';
import { asignacionCajaService } from '../services/asignacionCajaService';
import { selloService } from '../services/selloService';
import { ShippingModel } from '../types/shipping';
import { ExpoModel } from '../types/expo';
import { AsignacionCajaModel } from '../types/asignacionCaja';
import { SelloRecord } from '../types';

type CaptureStep = 'INFO_ENVIO' | 'VIN_LIST' | 'LOGISTICA' | 'LAYOUT_ADUANAL';

export const CaptureModule: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<CaptureStep>('INFO_ENVIO');
  const [schedules, setSchedules] = useState<ShippingModel[]>([]);
  const [boms, setBoms] = useState<ExpoModel[]>([]);
  const [asignaciones, setAsignaciones] = useState<AsignacionCajaModel[]>([]);
  const [sellos, setSellos] = useState<SelloRecord[]>([]);

  useEffect(() => {
     shippingService.getAllSchedules().then(setSchedules).catch(console.error);
     expoService.getAllExpos().then(setBoms).catch(console.error);
     asignacionCajaService.getAllAsignaciones().then(setAsignaciones).catch(console.error);
     selloService.getAllSellos().then(setSellos).catch(console.error);
  }, []);

  // INFO ENVÍO STATE
  const [infoEnvio, setInfoEnvio] = useState({
      invoiceNo: '',
      cfpContractNo: '',
  });

  // VIN LIST STATE
  const [vinPayload, setVinPayload] = useState<any[]>([]);
  const [enrichedPayload, setEnrichedPayload] = useState<any[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // END OF STATE

  const generateEnrichedPayload = () => {
      const enriched = vinPayload.map(v => {
          const matchedBom = boms.find(b => String(b.modelo).trim().toUpperCase() === String(v.modelo).trim().toUpperCase());
          return {
              ...v,
              taric:           matchedBom?.fraccionArancelaria || '',
              htsus:           matchedBom?.HTSUS || '',
              valorUsd:        matchedBom?.valorUsdUnitario || 0,
              pesoBruto:       matchedBom?.pesoBrutoUnitarioKg || 0,
              pesoNeto:        matchedBom?.pesoNetoUnitarioKg || 0,
              unidadAduana:    matchedBom?.unidadAduana || 'PZA',
              cantidadAduana:  matchedBom?.cantidadAduana ?? 1,
              clavePedimento:  matchedBom?.clavePedimento || '',
              incoterm:        matchedBom?.incoterm || '',
              claveProductoSat: matchedBom?.claveProductoSat || '',
              mid:             matchedBom?.mid || '',
              bomFound:        !!matchedBom,
          };
      });
      setEnrichedPayload(enriched);
      setCurrentStep('LOGISTICA');
  };

  const handleVinUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (evt) => {
          try {
              const buffer = evt.target?.result as ArrayBuffer;
              if (!buffer) return;
              import('xlsx').then(XLSX => {
                  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
                  const sheetName = workbook.SheetNames[0];
                  const sheet = workbook.Sheets[sheetName];
                  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false }) as any[][];
                  
                  if (rows.length < 2) return alert("Archivo vacío.");

                  // Auto-detect header row based on known rigid columns
                  let headerIdx = rows.findIndex(r => r.includes('VIN No.') || r.includes('VIN No') || r.includes('MODEL') || r.includes('Model'));
                  if (headerIdx === -1) headerIdx = 0;

                  const headers = rows[headerIdx].map((h: any) => h?.toString().trim() || '');
                  const parsedRecords: any[] = [];

                  for (let i = headerIdx + 1; i < rows.length; i++) {
                      const row = rows[i];
                      if (row.length < 2) continue;
                      
                      const model: any = {};
                      headers.forEach((h: string, idx: number) => { 
                          const key = h.toLowerCase().replace(/[\s\.\-\_]/g, '');
                          model[key] = row[idx]?.toString().trim() || ''; 
                      });

                      const vinStr = model.vinno || model.vin || '';
                      if (vinStr) {
                          let parsedOutdate = model.outdate || model.out || '';
                          if (parsedOutdate) {
                              const d = new Date(parsedOutdate);
                              if (!isNaN(d.getTime())) {
                                  let year = d.getFullYear();
                                  let month = String(d.getMonth() + 1).padStart(2, '0');
                                  let day = String(d.getDate()).padStart(2, '0');
                                  parsedOutdate = `${year}-${month}-${day}`;
                              }
                          }

                          parsedRecords.push({
                              containerNo:    model.containerno || model.container || '',
                              outDate:        parsedOutdate,
                              sealNo:         model.sealno || model.seal || '',
                              ref:            model.ref || '',
                              modelo:         model.modelo || model.model || '',
                              vin:            vinStr,
                              engine:         model.engineno || model.engine || '',
                              color:          model.color || '',
                              orderNo:        model.orderno || model.order || '',
                              productNo:      model.productno || model.product || '',
                              productionDate: model.productiondate || '',
                              remarks:        model.remarks || model.remark || '',
                              states:         model.states || model.state || '',
                          });
                      }
                  }

                  if (parsedRecords.length === 0) {
                      return alert("El archivo no contenía vehículos válidos (falta columna VIN No).");
                  }
                  
                  setVinPayload(parsedRecords);
              });
          } catch(err: any) {
              alert("Error parsing VIN List: " + err.message);
          }
      };
      reader.readAsArrayBuffer(file);
      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const stepOrder: CaptureStep[] = ['INFO_ENVIO', 'VIN_LIST', 'LOGISTICA', 'LAYOUT_ADUANAL'];
  const currentStepIdx = stepOrder.indexOf(currentStep);

  const exportLayoutCSV = () => {
    const headers = [
      'SEC','CONTENEDOR','SELLO','FECHA_SALIDA','VIN','MOTOR','MODELO','COLOR','PRODUCT_NO',
      'FECHA_PROD','FRACCION_ARANCELARIA','HTSUS','INCOTERM','CLAVE_PEDIMENTO',
      'UNIDAD_ADUANA','CANTIDAD_ADUANA','VALOR_USD','PESO_NETO_KG','PESO_BRUTO_KG',
      'INVOICE_NO','CFP_CONTRACT'
    ];
    const rows = enrichedPayload.map((v, i) => [
      i + 1, v.containerNo, v.sealNo || '', v.outDate,
      v.vin, v.engine, v.modelo, v.color, v.productNo || '',
      v.productionDate || '', v.taric, v.htsus, v.incoterm || '', v.clavePedimento || '',
      v.unidadAduana || 'PZA', v.cantidadAduana ?? 1,
      Number(v.valorUsd || 0).toFixed(2),
      Number(v.pesoNeto || 0).toFixed(2),
      Number(v.pesoBruto || 0).toFixed(2),
      infoEnvio.invoiceNo, infoEnvio.cfpContractNo
    ]);
    const csvContent = [headers, ...rows].map(r =>
      r.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `layout_aduanal_${infoEnvio.invoiceNo || 'export'}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderStepIcon = (step: CaptureStep, idx: number, active: boolean, _completed: boolean) => {
      const completed = stepOrder.indexOf(step) < currentStepIdx;
      const cls = active ? "bg-blue-600 text-white border-blue-600" :
                  completed ? "bg-emerald-50 text-emerald-600 border-emerald-500" :
                  "bg-white text-slate-400 border-slate-200";
                  
      return (
         <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 font-bold text-sm transition-colors ${cls}`}>
            {completed && !active ? <CheckCircle2 size={16} /> : idx}
         </div>
      );
  };

  return (
    <div className="p-6 w-full mx-auto animate-fade-in relative pb-20">
      <div className="mb-8">
         <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-indigo-700 flex items-center gap-3">
            <PackageOpen className="text-blue-600" size={32} />
            Motor de Captura (Macro Automática)
         </h1>
         <p className="text-slate-500 mt-2 text-sm font-medium">Asistente logístico paso a paso. Transformación de VIN List a Layout Aduanal.</p>
      </div>

      {/* STEPPER */}
      <div className="flex items-center justify-between mt-8 mb-10 bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
         <div className="flex items-center gap-3 flex-1">
             {renderStepIcon('INFO_ENVIO', 1, currentStep === 'INFO_ENVIO', true)}
             <span className={`font-semibold text-sm ${currentStep === 'INFO_ENVIO' ? 'text-blue-700' : 'text-slate-500'}`}>1. Info Envío</span>
             <ChevronRight className="text-slate-300 mx-2" />
         </div>
         <div className="flex items-center gap-3 flex-1">
             {renderStepIcon('VIN_LIST', 2, currentStep === 'VIN_LIST', false)}
             <span className={`font-semibold text-sm ${currentStep === 'VIN_LIST' ? 'text-blue-700' : 'text-slate-400'}`}>2. Ingesta VIN List</span>
             <ChevronRight className="text-slate-300 mx-2" />
         </div>
         <div className="flex items-center gap-3 flex-1">
             {renderStepIcon('LOGISTICA', 3, currentStep === 'LOGISTICA', false)}
             <span className={`font-semibold text-sm ${currentStep === 'LOGISTICA' ? 'text-blue-700' : 'text-slate-400'}`}>3. Asignación Logística</span>
             <ChevronRight className="text-slate-300 mx-2" />
         </div>
         <div className="flex items-center gap-3">
             {renderStepIcon('LAYOUT_ADUANAL', 4, currentStep === 'LAYOUT_ADUANAL', false)}
             <span className={`font-semibold text-sm ${currentStep === 'LAYOUT_ADUANAL' ? 'text-blue-700' : 'text-slate-400'}`}>4. Layout Aduanal</span>
         </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden min-h-[500px]">
          
          {currentStep === 'INFO_ENVIO' && (
             <div className="p-8 animate-fade-in fade-in-0 duration-300">
                 <div className="mb-8">
                     <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                         <Info className="text-blue-500" /> Datos Generales del Embarque
                     </h2>
                     <p className="text-slate-500 text-sm mt-1">Esta información fungirá como cabecera para todos los vehículos importados en este bloque.</p>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <div className="space-y-4">
                        <label className="block text-xs font-bold text-slate-500 uppercase">Factura Comercial</label>
                        <input 
                             type="text"
                             list="invoices-list"
                             placeholder="Empezar a escribir Factura..."
                             value={infoEnvio.invoiceNo} 
                             onChange={e => {
                                 const val = e.target.value.trim().toLowerCase();
                                 const sched = schedules.find(s => String(s.invoiceNo).trim().toLowerCase() === val);
                                 setInfoEnvio({
                                    ...infoEnvio, 
                                    invoiceNo: e.target.value,
                                    cfpContractNo: sched ? (sched.cfpContractNo || '') : infoEnvio.cfpContractNo
                                 });
                             }} 
                             className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-mono"
                        />
                        <datalist id="invoices-list">
                            {Array.from(new Set(schedules.map(s => s.invoiceNo))).filter(Boolean).map(inv => (
                                <option key={inv} value={inv} />
                            ))}
                        </datalist>
                     </div>
                     <div className="space-y-4">
                        <label className="block text-xs font-bold text-slate-500 uppercase">CFP Contract No.</label>
                        <input 
                             type="text"
                             list="contracts-list"
                             placeholder="Empezar a escribir Contrato..."
                             value={infoEnvio.cfpContractNo} 
                             onChange={e => {
                                 const val = e.target.value.trim().toLowerCase();
                                 const sched = schedules.find(s => String(s.cfpContractNo).trim().toLowerCase() === val);
                                 setInfoEnvio({
                                    ...infoEnvio, 
                                    cfpContractNo: e.target.value,
                                    invoiceNo: sched ? (sched.invoiceNo || '') : infoEnvio.invoiceNo
                                 });
                             }} 
                             className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-mono"
                        />
                        <datalist id="contracts-list">
                            {Array.from(new Set(schedules.map(s => s.cfpContractNo))).filter(Boolean).map(cfp => (
                                <option key={cfp as string} value={cfp as string} />
                            ))}
                        </datalist>
                     </div>
                 </div>

                 <div className="mt-10 flex justify-end pt-6 border-t border-slate-100">
                     <button onClick={() => setCurrentStep('VIN_LIST')} className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition-all flex items-center gap-2">
                        Continuar a VIN List <ChevronRight size={18} />
                     </button>
                 </div>
             </div>
          )}

          {currentStep === 'VIN_LIST' && (
             <div className="p-8 animate-fade-in flex flex-col items-center justify-center min-h-[500px]">
                 
                 {vinPayload.length === 0 ? (
                     <>
                         <UploadCloud size={64} className="text-slate-300 mb-4" />
                         <h2 className="text-xl font-bold text-slate-700">Extraer Archivo VIN LIST</h2>
                         <p className="text-slate-500 mt-2 mb-8 border-b pb-4 max-w-md text-center">
                            Sube el archivo Excel operativo. El motor procesará contenedores, chasis (VIN), motores y colores.
                         </p>
                         <button onClick={() => fileInputRef.current?.click()} className="bg-slate-800 text-white px-8 py-4 rounded-xl font-bold shadow-lg shadow-slate-500/30 hover:bg-slate-900 transition-all flex items-center gap-2">
                             <FileDown size={20} /> Seleccionar Excel VIN List
                         </button>
                         <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx, .xls, .csv" onChange={handleVinUpload} />
                         <button onClick={() => setCurrentStep('INFO_ENVIO')} className="mt-8 text-slate-400 hover:text-slate-600 font-medium text-sm">Volver a Info Envío</button>
                     </>
                 ) : (
                     <div className="w-full flex flex-col h-full items-start justify-start">
                         {(() => {
                              // Solo bloquear si el usuario ingresó un contrato Y hay discrepancia
                              const hasContractMismatch = !!infoEnvio.cfpContractNo &&
                                vinPayload.some(v => !v.orderNo || v.orderNo.trim().toUpperCase() !== infoEnvio.cfpContractNo.trim().toUpperCase());
                              
                              return (
                                  <>
                                      <div className="flex justify-between items-center w-full mb-6 py-4 border-b border-emerald-100">
                                          <div className="flex gap-4 items-center">
                                              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
                                                  <FileCheck size={24} />
                                              </div>
                                              <h2 className="text-2xl font-bold text-slate-800">
                                                  {vinPayload.length} Vehículos Extraídos
                                              </h2>
                                          </div>
                                          <div className="flex gap-3">
                                              <button onClick={() => setVinPayload([])} className="px-5 py-2 border border-slate-300 rounded-lg text-slate-600 font-bold hover:bg-slate-50">Descartar Archivo</button>
                                              
                                              {hasContractMismatch ? (
                                                  <>
                                                      <button onClick={() => setCurrentStep('INFO_ENVIO')} className="px-5 py-2 border border-orange-200 text-orange-600 rounded-lg font-bold hover:bg-orange-50">Corregir Cabecera</button>
                                                      <button onClick={generateEnrichedPayload} className="bg-amber-500 text-white px-6 py-2 rounded-lg font-bold shadow-lg shadow-amber-400/30 hover:bg-amber-600 flex items-center gap-2" title="Hay discrepancias en los contratos, pero puedes continuar">
                                                        Continuar con diferencias <ChevronRight size={18}/>
                                                      </button>
                                                  </>
                                              ) : (
                                                  <button onClick={generateEnrichedPayload} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-700 flex items-center gap-2">Motor de Cruce <ChevronRight size={18}/></button>
                                              )}
                                          </div>
                                      </div>

                         <div className="w-full bg-slate-50 border border-slate-200 rounded-xl overflow-hidden max-h-[350px] overflow-y-auto">
                             <table className="w-full text-left text-xs whitespace-nowrap">
                                <thead className="bg-slate-100 border-b border-slate-200 text-slate-500 font-bold uppercase sticky top-0">
                                   <tr>
                                      <th className="px-4 py-3">Contenedor</th>
                                      <th className="px-4 py-3">Sello</th>
                                      <th className="px-4 py-3 text-center">Sello (Match)</th>
                                      <th className="px-4 py-3 text-center">Asig. Caja (Match)</th>
                                      <th className="px-4 py-3">Outdate</th>
                                      <th className="px-4 py-3">VIN</th>
                                      <th className="px-4 py-3">Product No.</th>
                                      <th className="px-4 py-3">Modelo</th>
                                      <th className="px-4 py-3">Color</th>
                                      <th className="px-4 py-3">Motor</th>
                                      <th className="px-4 py-3">Fecha Prod.</th>
                                      <th className="px-4 py-3">Ref</th>
                                      <th className="px-4 py-3">Remarks</th>
                                      <th className="px-4 py-3">States</th>
                                      <th className="px-4 py-3">CFP Order (Match)</th>
                                   </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                   {vinPayload.slice(0, 100).map((v, i) => {
                                       const isAsigMatch = asignaciones.some(a => String(a.numeroCaja).trim().toUpperCase() === String(v.containerNo).trim().toUpperCase() && String(a.fecha).trim() === String(v.outDate).trim());
                                       const isSelloMatch = !!v.sealNo && sellos.some(s =>
                                         String(s.selloAsignado).trim().toUpperCase() === String(v.sealNo).trim().toUpperCase() &&
                                         String(s.numeroCaja).trim().toUpperCase() === String(v.containerNo).trim().toUpperCase()
                                       );
                                       return (
                                       <tr key={i} className="hover:bg-white text-slate-700">
                                          <td className="px-4 py-2 font-mono text-cyan-700">{v.containerNo}</td>
                                          <td className="px-4 py-2 font-mono text-slate-500">{v.sealNo || '—'}</td>
                                          <td className="px-4 py-2 text-center">
                                              {isSelloMatch ? (
                                                  <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 mx-auto" title={"Sello " + v.sealNo + " validado en Firebase"}>
                                                      <CheckCircle2 size={12} />
                                                  </div>
                                              ) : (
                                                  <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center text-red-600 mx-auto" title={v.sealNo ? "Sello " + v.sealNo + " no encontrado" : "Sin sello en Excel"}>
                                                      <XCircle size={12} />
                                                  </div>
                                              )}
                                          </td>
                                          <td className="px-4 py-2 text-center">
                                              {isAsigMatch ? (
                                                  <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 mx-auto" title="Caja asignada correctamente">
                                                      <CheckCircle2 size={12} />
                                                  </div>
                                              ) : (
                                                  <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center text-red-600 mx-auto" title="Falta o no coincide Asignación Diaria">
                                                      <XCircle size={12} />
                                                  </div>
                                              )}
                                          </td>
                                          <td className="px-4 py-2 font-mono text-slate-500">{v.outDate}</td>
                                          <td className="px-4 py-2 font-mono font-bold">{v.vin}</td>
                                          <td className="px-4 py-2 font-mono text-indigo-700 font-semibold">{v.productNo || '—'}</td>
                                          <td className="px-4 py-2">{v.modelo}</td>
                                          <td className="px-4 py-2">{v.color}</td>
                                          <td className="px-4 py-2">{v.engine}</td>
                                          <td className="px-4 py-2 font-mono text-xs text-slate-400">{v.productionDate || '—'}</td>
                                          <td className="px-4 py-2">{v.ref || '—'}</td>
                                          <td className="px-4 py-2">{v.remarks || '—'}</td>
                                          <td className="px-4 py-2">{v.states || '—'}</td>
                                          <td className="px-4 py-2 flex items-center justify-between">
                                              <span className="text-slate-500 mr-2">{v.orderNo}</span>
                                              {v.orderNo && infoEnvio.cfpContractNo && v.orderNo.trim().toUpperCase() === infoEnvio.cfpContractNo.trim().toUpperCase() ? (
                                                  <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600" title="Contrato Validado">
                                                      <CheckCircle2 size={12} />
                                                  </div>
                                              ) : (
                                                  <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center text-red-600" title={`Discrepancia. Cabecera indica: ${infoEnvio.cfpContractNo || 'N/A'}`}>
                                                      <XCircle size={12} />
                                                  </div>
                                              )}
                                          </td>
                                       </tr>
                                       );
                                   })}
                                   {vinPayload.length > 100 && (
                                       <tr>
                                           <td colSpan={15} className="text-center py-4 text-slate-400 font-medium">... y {vinPayload.length - 100} vehículos más</td>
                                       </tr>
                                   )}
                                </tbody>
                             </table>
                         </div>
                                 </>
                             );
                         })()}
                     </div>
                 )}
             </div>
          )}

          {currentStep === 'LOGISTICA' && (
             <div className="p-8 animate-fade-in flex flex-col h-full min-h-[500px]">
                 <div className="mb-6 pb-4 border-b border-slate-100 flex justify-between items-center">
                     <div>
                         <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                             <DatabaseZap className="text-purple-600" /> Auto-Enriquecimiento & Logística
                         </h2>
                         <p className="text-slate-500 text-sm mt-1">
                             El VIN List ha sido cruzado con la Matriz de Costos. Asigna los parámetros aduanales del pedimento.
                         </p>
                     </div>
                     <button onClick={() => setCurrentStep('VIN_LIST')} className="text-slate-400 hover:text-slate-600 font-medium text-sm">← Volver al Archivo</button>
                 </div>

                 <div className="w-full bg-slate-50 border border-slate-200 rounded-xl overflow-hidden max-h-[300px] overflow-y-auto mb-8 shadow-inner">
                     <table className="w-full text-left text-xs whitespace-nowrap">
                        <thead className="bg-slate-100 border-b border-slate-200 text-slate-500 font-bold uppercase sticky top-0">
                           <tr>
                              <th className="px-4 py-3">VIN / Chasis</th>
                              <th className="px-4 py-3">Modelo</th>
                              <th className="px-4 py-3 text-center">BOM Match</th>
                              <th className="px-4 py-3 text-right">Fracción (MX)</th>
                              <th className="px-4 py-3 text-right">HTSUS (US)</th>
                              <th className="px-4 py-3 text-right">V. Customs (USD)</th>
                              <th className="px-4 py-3 text-right">PCD (KG)</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                           {enrichedPayload.slice(0, 100).map((v, i) => (
                               <tr key={i} className={`hover:bg-white text-slate-700 ${!v.bomFound ? 'bg-red-50' : ''}`}>
                                  <td className="px-4 py-2 font-mono font-bold capitalize">{v.vin}</td>
                                  <td className="px-4 py-2">{v.modelo}</td>
                                  <td className="px-4 py-2 text-center">
                                      {v.bomFound ? (
                                          <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-[10px] font-bold">HIT</span>
                                      ) : (
                                          <span className="flex items-center justify-center gap-1 text-red-600 font-bold text-[10px]"><AlertTriangle size={12}/> MISS</span>
                                      )}
                                  </td>
                                  <td className="px-4 py-2 text-right font-mono text-slate-500">{v.taric || 'N/A'}</td>
                                  <td className="px-4 py-2 text-right font-mono text-slate-500">{v.htsus || 'N/A'}</td>
                                  <td className="px-4 py-2 text-right text-emerald-600 font-bold">${Number(v.valorUsd || 0).toLocaleString()}</td>
                                  <td className="px-4 py-2 text-right">{v.pesoBruto} kg</td>
                               </tr>
                           ))}
                           {enrichedPayload.length > 100 && (
                               <tr>
                                   <td colSpan={7} className="text-center py-4 text-slate-400 font-medium">... y {enrichedPayload.length - 100} vehículos más</td>
                               </tr>
                           )}
                        </tbody>
                     </table>
                 </div>


                 {enrichedPayload.some(v => !v.bomFound) && (
                     <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-lg flex items-start gap-3 text-orange-800">
                         <AlertTriangle className="text-orange-600 flex-shrink-0 mt-0.5" />
                         <div>
                             <h4 className="font-bold">Modelos sin Matriz (BOM)</h4>
                             <p className="text-sm mt-1 opacity-90">Algunos vehículos contienen modelos que no existen en el catálogo. Añádelos en Catálogos &gt; Modelos antes de proceder.</p>
                         </div>
                     </div>
                 )}

                 <div className="mt-auto flex justify-end items-center pt-6 border-t border-slate-100 gap-4">
                     <button
                       onClick={() => setCurrentStep('LAYOUT_ADUANAL')}
                       disabled={enrichedPayload.some(v => !v.bomFound)}
                       className="bg-green-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-green-500/30 hover:bg-green-700 transition-all flex items-center gap-2 disabled:bg-slate-300 disabled:shadow-none disabled:cursor-not-allowed">
                        Validar Entorno Aduanal <ChevronRight size={18} />
                     </button>
                 </div>
             </div>
          )}


           {/* PASO 4: LAYOUT ADUANAL */}
           {currentStep === 'LAYOUT_ADUANAL' && (() => {
             const containers = [...new Set(enrichedPayload.map((v) => v.containerNo))];
             const totalUnits  = enrichedPayload.length;
             const totalValUsd = enrichedPayload.reduce((s, v) => s + Number(v.valorUsd  || 0), 0);
             const totalBruto  = enrichedPayload.reduce((s, v) => s + Number(v.pesoBruto || 0), 0);
             const totalNeto   = enrichedPayload.reduce((s, v) => s + Number(v.pesoNeto  || 0), 0);
             const byContainer = {};
             enrichedPayload.forEach((v) => {
               if (!byContainer[v.containerNo]) byContainer[v.containerNo] = [];
               byContainer[v.containerNo].push(v);
             });
             return (
               <div className="animate-fade-in space-y-6">
                 {/* Cabecera */}
                 <div className="bg-gradient-to-br from-blue-700 to-indigo-800 rounded-2xl p-6 text-white shadow-xl">
                   <div className="flex items-start justify-between">
                     <div>
                       <p className="text-blue-200 text-xs font-bold uppercase tracking-widest mb-1">Layout Aduanal · Motor de Captura</p>
                       <h2 className="text-2xl font-black tracking-tight">{infoEnvio.invoiceNo}</h2>
                       <p className="text-blue-200 text-sm mt-1 font-mono">CFP Contract: {infoEnvio.cfpContractNo}</p>
                     </div>
                     <div className="flex gap-2">
                       <button onClick={exportLayoutCSV}
                         className="flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white font-bold px-4 py-2.5 rounded-xl transition-colors border border-white/20 text-sm">
                         <Download size={16} /> Exportar CSV
                       </button>
                       <button onClick={() => { setCurrentStep('INFO_ENVIO'); setVinPayload([]); setEnrichedPayload([]); }}
                         className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white/70 px-3 py-2.5 rounded-xl transition-colors border border-white/10 text-sm" title="Nueva Captura">
                         <RotateCcw size={16} />
                       </button>
                     </div>
                   </div>
                   <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
                     {[{ label: 'Total Unidades', value: totalUnits.toLocaleString(), icon: '🚗' },
                       { label: 'Contenedores',   value: containers.length.toLocaleString(), icon: '📦' },
                       { label: 'Valor Total USD', value: '$' + totalValUsd.toLocaleString('en-US', { minimumFractionDigits: 2 }), icon: '💵' },
                       { label: 'Peso Bruto Total', value: totalBruto.toLocaleString('es-MX') + ' kg', icon: '⚖️' }
                     ].map((card) => (
                       <div key={card.label} className="bg-white/10 rounded-xl p-3 border border-white/10">
                         <p className="text-blue-200 text-xs font-bold uppercase tracking-wider">{card.label}</p>
                         <p className="text-white text-lg font-black mt-1">{card.icon} {card.value}</p>
                       </div>
                     ))}
                   </div>
                 </div>

                 {/* Resumen por Contenedor */}
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                   {containers.map((cno) => {
                     const group = byContainer[cno] || [];
                     const sello = group[0]?.sealNo || '—';
                     const fecha = group[0]?.outDate || '—';
                     const cVal  = group.reduce((s, v) => s + Number(v.valorUsd  || 0), 0);
                     const cPeso = group.reduce((s, v) => s + Number(v.pesoBruto || 0), 0);
                     const modelos = [...new Set(group.map((v) => v.modelo))];
                     return (
                       <div key={cno} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 hover:shadow-md transition-shadow">
                         <div className="flex items-start justify-between mb-3">
                           <div>
                             <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Contenedor</p>
                             <p className="text-xl font-black text-slate-800 font-mono">{cno}</p>
                           </div>
                           <span className="bg-emerald-50 text-emerald-700 text-xs font-black px-3 py-1.5 rounded-full border border-emerald-200">
                             {group.length} VINs
                           </span>
                         </div>
                         <div className="space-y-1.5 text-sm">
                           <div className="flex justify-between"><span className="text-slate-500">Sello</span><span className="font-mono font-bold text-slate-700">{sello}</span></div>
                           <div className="flex justify-between"><span className="text-slate-500">Fecha Salida</span><span className="font-medium text-slate-700">{fecha}</span></div>
                           <div className="flex justify-between"><span className="text-slate-500">Valor USD</span><span className="font-bold text-emerald-700">{cVal.toLocaleString('en-US', { minimumFractionDigits: 2, style: 'currency', currency: 'USD' })}</span></div>
                           <div className="flex justify-between"><span className="text-slate-500">Peso Bruto</span><span className="font-medium text-slate-600">{cPeso.toLocaleString('es-MX')} kg</span></div>
                           <div className="flex justify-between items-start pt-1 border-t border-slate-100 mt-1">
                             <span className="text-slate-500">Modelos</span>
                             <span className="text-right text-xs text-slate-600 max-w-[60%]">{modelos.join(', ')}</span>
                           </div>
                         </div>
                       </div>
                     );
                   })}
                 </div>

                 {/* Tabla detalle completo */}
                 <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                   <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                     <div>
                       <h3 className="font-bold text-slate-800">Detalle Completo por VIN</h3>
                       <p className="text-xs text-slate-400 mt-0.5">{totalUnits} vehículos · {containers.length} contenedores</p>
                     </div>
                     <span className="text-xs bg-slate-100 text-slate-500 px-3 py-1 rounded-full font-medium border border-slate-200">
                       {totalNeto.toLocaleString('es-MX')} kg neto · {totalBruto.toLocaleString('es-MX')} kg bruto
                     </span>
                   </div>
                   <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                     <table className="w-full text-left text-xs whitespace-nowrap">
                       <thead className="bg-slate-800 text-white font-bold uppercase sticky top-0 z-10">
                         <tr>
                           <th className="px-3 py-3">#</th>
                           <th className="px-3 py-3">Contenedor</th>
                           <th className="px-3 py-3">Sello</th>
                           <th className="px-3 py-3">VIN</th>
                           <th className="px-3 py-3">Motor</th>
                           <th className="px-3 py-3">Modelo</th>
                           <th className="px-3 py-3">Color</th>
                           <th className="px-3 py-3">Product No.</th>
                           <th className="px-3 py-3">Fecha Prod.</th>
                           <th className="px-3 py-3">Fracción Aranc.</th>
                           <th className="px-3 py-3">HTSUS</th>
                           <th className="px-3 py-3">Incoterm</th>
                           <th className="px-3 py-3">Clave Ped.</th>
                           <th className="px-3 py-3 text-right">Valor USD</th>
                           <th className="px-3 py-3 text-right">Peso Neto</th>
                           <th className="px-3 py-3 text-right">Peso Bruto</th>
                         </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-100">
                         {enrichedPayload.map((v, i) => (
                           <tr key={i} className={"hover:bg-blue-50 transition-colors " + (i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50')}>
                             <td className="px-3 py-2 text-slate-400 font-bold">{i + 1}</td>
                             <td className="px-3 py-2 font-mono text-cyan-700 font-bold">{v.containerNo}</td>
                             <td className="px-3 py-2 font-mono text-slate-500">{v.sealNo || '—'}</td>
                             <td className="px-3 py-2 font-mono font-black text-slate-800">{v.vin}</td>
                             <td className="px-3 py-2 font-mono text-slate-600">{v.engine}</td>
                             <td className="px-3 py-2 font-semibold text-slate-700">{v.modelo}</td>
                             <td className="px-3 py-2 text-slate-600">{v.color}</td>
                             <td className="px-3 py-2 font-mono text-indigo-600 font-semibold">{v.productNo || '—'}</td>
                             <td className="px-3 py-2 text-slate-500">{v.productionDate || '—'}</td>
                             <td className="px-3 py-2 font-mono">
                               {v.taric ? <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-bold">{v.taric}</span> : <span className="text-red-400">N/A</span>}
                             </td>
                             <td className="px-3 py-2 font-mono text-slate-600">{v.htsus || '—'}</td>
                             <td className="px-3 py-2">{v.incoterm || '—'}</td>
                             <td className="px-3 py-2 font-mono text-slate-500">{v.clavePedimento || '—'}</td>
                             <td className="px-3 py-2 text-right font-bold text-emerald-700">{Number(v.valorUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2, style: 'currency', currency: 'USD' })}</td>
                             <td className="px-3 py-2 text-right text-slate-600">{Number(v.pesoNeto || 0).toFixed(2)}</td>
                             <td className="px-3 py-2 text-right text-slate-600">{Number(v.pesoBruto || 0).toFixed(2)}</td>
                           </tr>
                         ))}
                       </tbody>
                       <tfoot className="bg-slate-800 text-white font-black sticky bottom-0">
                         <tr>
                           <td colSpan={13} className="px-3 py-3 text-right uppercase tracking-wider text-slate-300 text-[10px]">TOTALES</td>
                           <td className="px-3 py-3 text-right text-emerald-400">{totalValUsd.toLocaleString('en-US', { minimumFractionDigits: 2, style: 'currency', currency: 'USD' })}</td>
                           <td className="px-3 py-3 text-right">{totalNeto.toFixed(2)}</td>
                           <td className="px-3 py-3 text-right">{totalBruto.toFixed(2)}</td>
                         </tr>
                       </tfoot>
                     </table>
                   </div>
                 </div>

                 {/* CTA de descarga */}
                 <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-center gap-4">
                   <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
                     <FileCheck size={24} className="text-emerald-600" />
                   </div>
                   <div className="flex-1">
                     <h4 className="font-bold text-emerald-800">Layout Aduanal Generado</h4>
                     <p className="text-emerald-700 text-sm mt-0.5">
                       {totalUnits} vehículos procesados en {containers.length} contenedor(es). Descarga el CSV para presentarlo a tu agente de customs.
                     </p>
                   </div>
                   <button onClick={exportLayoutCSV}
                     className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-3 rounded-xl transition-colors shadow-lg shadow-emerald-500/25 flex-shrink-0">
                     <Download size={18} /> Descargar CSV
                   </button>
                 </div>
               </div>
             );
           })()}

      </div>
    </div>
  );
};
