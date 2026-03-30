import React, { useState, useEffect } from 'react';
import { FileDown, UploadCloud, Truck, FileCheck, CheckCircle2, XCircle, ChevronRight, PackageOpen, Info, Anchor, Calendar, DatabaseZap, AlertTriangle } from 'lucide-react';
import { shippingService } from '../services/shippingService';
import { expoService } from '../services/expoService';
import { asignacionCajaService } from '../services/asignacionCajaService';
import { ShippingModel } from '../types/shipping';
import { ExpoModel } from '../types/expo';
import { AsignacionCajaModel } from '../types/asignacionCaja';

type CaptureStep = 'INFO_ENVIO' | 'VIN_LIST' | 'LOGISTICA' | 'LAYOUT_ADUANAL';

export const CaptureModule: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<CaptureStep>('INFO_ENVIO');
  const [schedules, setSchedules] = useState<ShippingModel[]>([]);
  const [boms, setBoms] = useState<ExpoModel[]>([]);
  const [asignaciones, setAsignaciones] = useState<AsignacionCajaModel[]>([]);

  useEffect(() => {
     shippingService.getAllSchedules().then(setSchedules).catch(console.error);
     expoService.getAllExpos().then(setBoms).catch(console.error);
     asignacionCajaService.getAllAsignaciones().then(setAsignaciones).catch(console.error);
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
              taric: matchedBom?.fraccionArancelaria || '',
              htsus: matchedBom?.HTSUS || '',
              valorUsd: matchedBom?.valorUsdUnitario || 0,
              pesoBruto: matchedBom?.pesoBrutoUnitarioKg || 0,
              bomFound: !!matchedBom,
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
                              containerNo: model.containerno || model.container || '',
                              outDate: parsedOutdate,
                              sealNo: model.sealno || model.seal || '',
                              modelo: model.modelo || model.model || '',
                              vin: vinStr,
                              engine: model.engineno || model.engine || '',
                              color: model.color || '',
                              orderNo: model.orderno || model.order || '',
                              productNo: model.productno || model.product || '',
                              productionDate: model.productiondate || '',
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

  const renderStepIcon = (step: CaptureStep, idx: number, active: boolean, completed: boolean) => {
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
    <div className="p-6 max-w-7xl mx-auto animate-fade-in relative pb-20">
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
                             const hasMismatch = vinPayload.some(v => !v.orderNo || !infoEnvio.cfpContractNo || v.orderNo.trim().toUpperCase() !== infoEnvio.cfpContractNo.trim().toUpperCase());
                             
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
                                             
                                             {hasMismatch ? (
                                                 <>
                                                     <button onClick={() => setCurrentStep('INFO_ENVIO')} className="px-5 py-2 border border-orange-200 text-orange-600 rounded-lg font-bold hover:bg-orange-50">Corregir Cabecera</button>
                                                     <button disabled className="bg-slate-200 text-slate-400 px-5 py-2 rounded-lg font-bold flex items-center gap-2 cursor-not-allowed" title="Hay discrepancias en los contratos">Bloqueado</button>
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
                                      <th className="px-4 py-3 text-center">Asig. Caja (Match)</th>
                                      <th className="px-4 py-3">Outdate</th>
                                      <th className="px-4 py-3">VIN</th>
                                      <th className="px-4 py-3">Modelo</th>
                                      <th className="px-4 py-3">Color</th>
                                      <th className="px-4 py-3">Motor</th>
                                      <th className="px-4 py-3">CFP Order (Match)</th>
                                   </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                   {vinPayload.slice(0, 100).map((v, i) => {
                                       const isAsigMatch = asignaciones.some(a => String(a.numeroCaja).trim().toUpperCase() === String(v.containerNo).trim().toUpperCase() && String(a.fecha).trim() === String(v.outDate).trim());
                                       return (
                                       <tr key={i} className="hover:bg-white text-slate-700">
                                          <td className="px-4 py-2 font-mono text-cyan-700">{v.containerNo}</td>
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
                                          <td className="px-4 py-2">{v.modelo}</td>
                                          <td className="px-4 py-2">{v.color}</td>
                                          <td className="px-4 py-2">{v.engine}</td>
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
                                           <td colSpan={8} className="text-center py-4 text-slate-400 font-medium">... y {vinPayload.length - 100} vehículos más</td>
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
                             <p className="text-sm mt-1 opacity-90">Algunos vehículos del Excel contienen modelos que no existen en el catálogo maestro. Las columnas de impuestos y pesos aparecerán en cero. Añádelos en la sección de "Catálogos &gt; Modelos" antes de proceder a la aduana.</p>
                         </div>
                     </div>
                 )}

                 <div className="mt-auto flex justify-end items-center pt-6 border-t border-slate-100 gap-4">
                     <button disabled={enrichedPayload.some(v => !v.bomFound)} className="bg-green-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-green-500/30 hover:bg-green-700 transition-all flex items-center gap-2 disabled:bg-slate-300 disabled:shadow-none disabled:cursor-not-allowed">
                        Validar Entorno Aduanal <ChevronRight size={18} />
                     </button>
                 </div>
             </div>
          )}

          {/* Placeholders for remaining steps... */}

      </div>
    </div>
  );
};
