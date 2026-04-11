const fs = require('fs');
const path = require('path');

const step4Code = `
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
`;

const filePath = path.join(__dirname, '..', 'pages', 'CaptureModule.tsx');
let content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

// Find the line with "      </div>" followed by closing "    </div>" then "  );" then "};" - the final wrapper
// Insert before index 507 (the outer </div> wrapper)
let insertIdx = -1;
for (let i = lines.length - 1; i >= 0; i--) {
  if (lines[i].trim() === '</div>' && lines[i+1] && lines[i+1].trim() === '</div>' && lines[i+2] && lines[i+2].trim() === ');') {
    insertIdx = i;
    break;
  }
}

if (insertIdx === -1) {
  // fallback: find the comment right before </div></div>
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes('setCurrentStep') && lines[i].includes('LAYOUT_ADUANAL')) {
      insertIdx = i + 5; // after the button closing
      break;
    }
  }
}

console.log('Inserting step 4 at line index:', insertIdx);
lines.splice(insertIdx, 0, ...step4Code.split('\n'));
fs.writeFileSync(filePath, lines.join('\n'));
console.log('Done. Total lines:', lines.length);
