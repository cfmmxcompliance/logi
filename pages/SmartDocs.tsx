import React, { useState, useRef } from 'react';
import { Upload, FileText, Check, AlertCircle, RefreshCw, Download, DollarSign } from 'lucide-react';
import { geminiService, ExtractedInvoiceItem, ExtractedCost } from '../services/geminiService.ts';
import { storageService } from '../services/storageService.ts';
import { RawMaterialPart } from '../types.ts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const SmartDocs = () => {
  const [activeTab, setActiveTab] = useState<'correction' | 'costs'>('correction');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Correction State
  const [extractedItems, setExtractedItems] = useState<(ExtractedInvoiceItem & { matchedPart?: RawMaterialPart })[]>([]);

  // Cost State
  const [extractedCosts, setExtractedCosts] = useState<ExtractedCost[]>([]);
  const [selectedShipmentId, setSelectedShipmentId] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileType = file.type || 'image/jpeg';

    setLoading(true);
    setError('');

    // Convert to Base64
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = (reader.result as string).split(',')[1];

      try {
        if (activeTab === 'correction') {
          const items = await geminiService.parseInvoiceMaterials(base64, fileType);
          // Match with DB
          const enrichedItems = items.map(item => {
            const match = storageService.searchPart(item.partNumber);
            return { ...item, matchedPart: match };
          });
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
          <h1 className="text-2xl font-bold text-slate-800">Smart Document Processing</h1>
          <p className="text-slate-500">Use AI to analyze invoices, packing lists, and correct data anomalies.</p>
        </div>
        <div className="flex bg-white rounded-lg p-1 shadow-sm border border-slate-200 mt-4 md:mt-0">
          <button
            onClick={() => setActiveTab('correction')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'correction' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            Invoice Correction
          </button>
          <button
            onClick={() => setActiveTab('costs')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'costs' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            Cost Extraction
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Upload Area */}
        <div className="p-8 border-b border-slate-100 text-center bg-slate-50">
          <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4 text-blue-600">
            {loading ? <RefreshCw className="animate-spin" /> : <Upload />}
          </div>
          <h3 className="text-lg font-semibold text-slate-700">Upload {activeTab === 'correction' ? 'Packing List / Invoice' : 'Logistics Invoice'}</h3>
          <p className="text-slate-500 text-sm mb-6 max-w-md mx-auto">
            Upload a PDF (screenshot) or Image. The AI will extract data, match it with the Master Data, and {activeTab === 'correction' ? 'generate a corrected PDF' : 'allocate costs'}.
          </p>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/*,.pdf"
            onChange={handleFileUpload}
          />
          <button
            disabled={loading}
            onClick={() => fileInputRef.current?.click()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg shadow-sm font-medium disabled:opacity-50"
          >
            {loading ? 'Processing with Gemini...' : 'Select File'}
          </button>
          {error && <p className="text-red-500 mt-4 text-sm flex items-center justify-center gap-2"><AlertCircle size={14} /> {error}</p>}
        </div>

        {/* Results Area - Correction */}
        {activeTab === 'correction' && extractedItems.length > 0 && (
          <div className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg text-slate-700">Extracted & Matched Data</h3>
              <button onClick={generateCorrectedPDF} className="flex items-center gap-2 text-emerald-600 hover:text-emerald-700 font-bold border border-emerald-200 bg-emerald-50 px-4 py-2 rounded-lg">
                <Download size={18} /> Download Corrected PDF
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-3">Part #</th>
                    <th className="px-4 py-3">Extracted Desc</th>
                    <th className="px-4 py-3">DB Match Status</th>
                    <th className="px-4 py-3">Master Desc (ES)</th>
                    <th className="px-4 py-3">HTS MX</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {extractedItems.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono">{item.partNumber}</td>
                      <td className="px-4 py-3">{item.description}</td>
                      <td className="px-4 py-3">
                        {item.matchedPart ? (
                          <span className="flex items-center text-emerald-600 gap-1"><Check size={14} /> Found</span>
                        ) : (
                          <span className="flex items-center text-red-500 gap-1"><AlertCircle size={14} /> Missing</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{item.matchedPart?.DESCRIPCION_ES || '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{item.matchedPart?.HTSMX || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Results Area - Costs */}
        {activeTab === 'costs' && extractedCosts.length > 0 && (
          <div className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg text-slate-700">Extracted Logistics Costs</h3>
              <div className="flex gap-2">
                <select
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  onChange={(e) => setSelectedShipmentId(e.target.value)}
                >
                  <option value="">Select Shipment to Assign...</option>
                  {storageService.getShipments().map(s => (
                    <option key={s.id} value={s.id}>{s.reference} ({s.origin})</option>
                  ))}
                </select>
                <button onClick={saveCosts} className="flex items-center gap-2 bg-blue-600 text-white hover:bg-blue-700 font-medium px-4 py-2 rounded-lg">
                  <DollarSign size={18} /> Confirm & Save
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {extractedCosts.map((cost, idx) => (
                <div key={idx} className="border border-slate-200 p-4 rounded-lg flex justify-between items-center bg-slate-50">
                  <div>
                    <div className="font-medium text-slate-800">{cost.description}</div>
                    <div className="text-xs uppercase font-bold text-slate-400 mt-1">{cost.type}</div>
                  </div>
                  <div className="text-xl font-bold text-slate-700">
                    {cost.amount} <span className="text-sm font-normal text-slate-500">{cost.currency}</span>
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