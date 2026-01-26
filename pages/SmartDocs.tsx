import React, { useState, useRef } from 'react';
import { Upload, FileText, Check, AlertCircle, RefreshCw, Download, DollarSign, FolderOpen } from 'lucide-react';
import { geminiService, ExtractedInvoiceItem, ExtractedCost } from '../services/geminiService.ts';
import { storageService } from '../services/storageService.ts';
import { vucemAutomation } from '../services/vucem/vucemAutomation';
import { RawMaterialPart } from '../types.ts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const SmartDocs = () => {
  const [activeTab, setActiveTab] = useState<'correction' | 'costs' | 'ingestion'>('correction');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [syncStats, setSyncStats] = useState({ current: 0, total: 0, status: '' });

  // Correction State
  const [extractedItems, setExtractedItems] = useState<(ExtractedInvoiceItem & { matchedPart?: RawMaterialPart })[]>([]);

  // Cost State
  const [extractedCosts, setExtractedCosts] = useState<ExtractedCost[]>([]);
  const [selectedShipmentId, setSelectedShipmentId] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleZipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError('');
    setSyncStats({ current: 0, total: 0, status: 'Iniciando descompresión...' });

    try {
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(file);
      const files = Object.keys(zip.files).filter(name => !zip.files[name].dir && !name.includes('__MACOSX'));

      setSyncStats({ current: 0, total: files.length, status: `Detectados ${files.length} archivos.` });

      let processed = 0;
      for (const filename of files) {
        try {
          const nameOnly = filename.split('/').pop() || filename;
          const lowerName = nameOnly.toLowerCase();

          // FILTER: Only process PDFs if they match specific keywords
          if (lowerName.endsWith('.pdf')) {
            const isNormal = lowerName.includes('normal') || lowerName.includes('norm') || lowerName.includes('completo') || lowerName.includes('extendido');
            const isSimplified = lowerName.includes('simplificado') || lowerName.includes('simp') || lowerName.endsWith('s.pdf') || lowerName.includes(' -s');

            if (isSimplified && !isNormal) {
              console.log(`⏩ Saltando PDF simplificado: ${nameOnly}`);
              continue; // Skip simplified as requested
            }

            if (!isNormal && !isSimplified) {
              // Safety: If it doesn't match normal but isn't explicitly simplified, 
              // we follow Alex's rule: only process if it says normal/norm/completo/extendido.
              console.log(`⏩ Saltando archivo no solicitado: ${nameOnly}`);
              continue;
            }
          }

          const content = await zip.files[filename].async('uint8array');

          setSyncStats(prev => ({ ...prev, current: processed + 1, status: `Procesando ${nameOnly}...` }));

          // Race with 60s timeout - FAIL FAST
          const fileProcessPromise = vucemAutomation.processLocalFile(nameOnly, content, (msg) => {
            setSyncStats(prev => ({ ...prev, status: msg }));
          });

          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Tiempo agotado (60s) en: ${nameOnly}`)), 60000)
          );

          await Promise.race([fileProcessPromise, timeoutPromise]);

          processed++;
        } catch (err: any) {
          console.error(`Error crítico en ingesta (${filename}):`, err);
          setError(`Proceso detenido en archivo ${filename}: ${err.message}`);
          setSyncStats(prev => ({ ...prev, status: `❌ Error: ${err.message}` }));
          return; // STOP THE ENTIRE PROCESS
        }
      }
      alert(`✅ Ingesta completada. Se procesaron los ${processed} archivos correctamente.`);
    } catch (err: any) {
      setError('Error al procesar el archivo ZIP: ' + err.message);
    } finally {
      setLoading(false);
      setSyncStats({ current: 0, total: 0, status: '' });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileType = file.type || 'image/jpeg';

    setLoading(true);
    setError('');

    if (activeTab === 'ingestion') {
      handleZipUpload(e);
      return;
    }

    // Convert to Base64
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = (reader.result as string).split(',')[1];

      try {
        if (activeTab === 'correction') {
          const items: any = await geminiService.parseInvoiceMaterials(base64, fileType);
          // Match with DB
          const enrichedItems = Array.isArray(items) ? items.map((item: any) => {
            const match = storageService.searchPart(item.partNumber);
            return { ...item, matchedPart: match };
          }) : [];
          setExtractedItems(enrichedItems);
        } else {
          const costs = await geminiService.analyzeLogisticsInvoice(base64, fileType);
          setExtractedCosts(costs);
        }
      } catch (err) {
        setError('Failed to process document with AI. Please ensure the API Key is valid and file format is supported.');
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const generateCorrectedPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Corrected Commercial Invoice / Pre-Alert", 14, 22);

    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 30);

    const tableData = extractedItems.map(item => [
      item.partNumber,
      item.matchedPart?.DESCRIPTION_EN || item.description,
      item.matchedPart?.DESCRIPCION_ES || "MISSING MASTER DATA",
      item.qty,
      item.unitPrice,
      (item.qty * item.unitPrice).toFixed(2),
      item.matchedPart?.HTSMX || "N/A",
      item.matchedPart?.UMC || "N/A"
    ]);

    autoTable(doc, {
      head: [['Part #', 'Desc (EN)', 'Desc (ES)', 'Qty', 'Unit Price', 'Total', 'HTS MX', 'UMC']],
      body: tableData,
      startY: 40,
    });

    doc.save("corrected_invoice.pdf");
  };

  const saveCosts = () => {
    if (!selectedShipmentId) {
      alert("Please select a shipment to attach costs to.");
      return;
    }
    extractedCosts.forEach(cost => {
      storageService.addCost({
        id: '',
        shipmentId: selectedShipmentId,
        type: cost.type,
        amount: cost.amount,
        currency: cost.currency,
        provider: 'Unknown Provider', // Would extract from doc in real app
        description: cost.description,
        date: new Date().toISOString(),
        status: 'Pending'
      });
    });
    alert("Costs saved to database successfully!");
    setExtractedCosts([]);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-3">
            <FileText className="text-blue-600" />
            Smart Document Processing
          </h1>
          <p className="text-slate-500">Use AI and automation to analyze invoices, packing lists, and customs ZIPs.</p>
        </div>
        <div className="flex bg-white rounded-xl p-1 shadow-sm border border-slate-200 mt-4 md:mt-0">
          <button
            onClick={() => setActiveTab('correction')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'correction' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            Invoice Correction
          </button>
          <button
            onClick={() => setActiveTab('costs')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'costs' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            Cost Extraction
          </button>
          <button
            onClick={() => setActiveTab('ingestion')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'ingestion' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            Ingesta Aduanas (ZIP)
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Upload Area */}
        <div className="p-12 border-b border-slate-100 text-center bg-slate-50/50">
          <div className="mx-auto w-20 h-20 bg-blue-100 rounded-3xl flex items-center justify-center mb-6 text-blue-600 shadow-inner">
            {loading ? <RefreshCw className="animate-spin" size={32} /> : activeTab === 'ingestion' ? <FolderOpen size={32} /> : <Upload size={32} />}
          </div>

          {activeTab === 'ingestion' ? (
            <>
              <h3 className="text-xl font-black text-slate-800">Carga Masiva de Expedientes (ZIP)</h3>
              <p className="text-slate-500 text-sm mb-8 max-w-md mx-auto">
                Sube el archivo ZIP de tu Agente Aduanal. Extraeremos pedimentos, COVEs y pagos para poblar tu base de datos automáticamente.
              </p>
            </>
          ) : (
            <>
              <h3 className="text-xl font-black text-slate-800">Upload {activeTab === 'correction' ? 'Packing List / Invoice' : 'Logistics Invoice'}</h3>
              <p className="text-slate-500 text-sm mb-8 max-w-md mx-auto">
                Upload a PDF or Image. The AI will extract data, match it with the Master Data, and {activeTab === 'correction' ? 'generate a corrected PDF' : 'allocate costs'}.
              </p>
            </>
          )}

          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept={activeTab === 'ingestion' ? '.zip' : 'image/*,.pdf'}
            onChange={handleFileUpload}
          />

          <button
            disabled={loading}
            onClick={() => fileInputRef.current?.click()}
            className="bg-slate-900 hover:bg-black text-white px-10 py-3 rounded-xl shadow-lg font-black tracking-tight transition-all disabled:opacity-50 active:scale-95"
          >
            {loading ? 'PROCESANDO...' : 'SELECCIONAR ARCHIVO'}
          </button>

          {loading && syncStats.total > 0 && (
            <div className="mt-6 max-w-xs mx-auto">
              <div className="flex justify-between text-[10px] font-black uppercase text-slate-400 mb-1">
                <span>{syncStats.status}</span>
                <span>{syncStats.current}/{syncStats.total}</span>
              </div>
              <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-blue-600 h-full transition-all duration-300"
                  style={{ width: `${(syncStats.current / syncStats.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {error && <p className="text-red-500 mt-6 text-sm font-bold flex items-center justify-center gap-2 bg-red-50 py-2 rounded-lg"><AlertCircle size={14} /> {error}</p>}
        </div>

        {/* Results Area - Correction */}
        {activeTab === 'correction' && extractedItems.length > 0 && (
          <div className="p-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-black text-xl text-slate-800">Extracted & Matched Data</h3>
              <button onClick={generateCorrectedPDF} className="flex items-center gap-2 text-emerald-700 hover:bg-emerald-100 font-black border-2 border-emerald-200 bg-emerald-50 px-5 py-2.5 rounded-xl transition-all">
                <Download size={20} /> Download Corrected PDF
              </button>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-400 font-bold uppercase text-[10px] tracking-widest">
                  <tr>
                    <th className="px-6 py-4">Part #</th>
                    <th className="px-6 py-4">Extracted Desc</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Master Desc (ES)</th>
                    <th className="px-6 py-4">HTS MX</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {extractedItems.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 font-black text-blue-600">{item.partNumber}</td>
                      <td className="px-6 py-4 text-slate-600">{item.description}</td>
                      <td className="px-6 py-4">
                        {item.matchedPart ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 gap-1"><Check size={12} /> Found</span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-600 gap-1"><AlertCircle size={12} /> Missing</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-500 italic">{item.matchedPart?.DESCRIPCION_ES || 'No disponible'}</td>
                      <td className="px-6 py-4 font-bold text-slate-700">{item.matchedPart?.HTSMX || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Results Area - Costs */}
        {activeTab === 'costs' && extractedCosts.length > 0 && (
          <div className="p-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-black text-xl text-slate-800">Extracted Logistics Costs</h3>
              <div className="flex gap-3">
                <select
                  className="border-2 border-slate-100 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600 focus:border-blue-300 outline-none transition-all bg-slate-50"
                  onChange={(e) => setSelectedShipmentId(e.target.value)}
                >
                  <option value="">Select Shipment...</option>
                  {storageService.getShipments().map(s => (
                    <option key={s.id} value={s.id}>{s.reference} ({s.origin})</option>
                  ))}
                </select>
                <button onClick={saveCosts} className="flex items-center gap-2 bg-blue-600 text-white hover:bg-blue-700 font-black px-6 py-2.5 rounded-xl transition-all shadow-md shadow-blue-200">
                  <DollarSign size={20} /> Confirm & Save
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {extractedCosts.map((cost, idx) => (
                <div key={idx} className="border-2 border-slate-50 p-6 rounded-2xl flex justify-between items-center bg-white shadow-sm hover:border-blue-100 transition-all group">
                  <div>
                    <div className="font-black text-slate-800 group-hover:text-blue-600 transition-colors uppercase tracking-tight">{cost.description}</div>
                    <div className="text-[10px] uppercase font-black text-slate-400 mt-1.5 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                      {cost.type}
                    </div>
                  </div>
                  <div className="text-2xl font-black text-slate-900 bg-slate-50 px-4 py-2 rounded-xl border border-slate-100">
                    {cost.amount} <span className="text-[10px] font-black text-slate-400 ml-1">{cost.currency}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};