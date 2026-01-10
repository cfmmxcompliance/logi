import React, { useState, useRef } from 'react';
import { parsePedimentoPdf, PedimentoData, PedimentoItem } from '../services/pedimentoParser';
import { storageService } from '../services/storageService';
import { geminiService } from '../services/geminiService';
import { PedimentoSummary } from '../components/proforma/PedimentoSummary';
import { ComparisonTable, ComparisonRow } from '../components/proforma/ComparisonTable';
import { Layout } from '../components/Layout';
import { CustomsClearanceRecord } from '../types';
import { Upload, FileText, AlertTriangle, CheckCircle, Search, Save, ArrowRight, Trash2 } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';

export const ProformaValidator: React.FC = () => {
    const { showNotification } = useNotification();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [pedimentoData, setPedimentoData] = useState<PedimentoData | null>(null);
    const [comparisonRows, setComparisonRows] = useState<ComparisonRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('Processing...');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // Customs Update State
    const [showCustomsModal, setShowCustomsModal] = useState(false);
    const [customsSearch, setCustomsSearch] = useState('');
    const [selectedCustomsId, setSelectedCustomsId] = useState<string | null>(null);
    const [customsRecords, setCustomsRecords] = useState<CustomsClearanceRecord[]>([]);

    const handleResetDatabase = async () => {
        if (confirm('Are you sure you want to delete ONLY the "Auto-Learned" items? This will clear the validation cache but keep your manual records safe.')) {
            await storageService.deleteAutoLearnedInvoices();
            setPedimentoData(null);
            setComparisonRows([]);
            showNotification('Validation Cache Cleared', 'Only auto-learned items were deleted.', 'success');
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        console.log("File Upload Triggered");
        const file = e.target.files?.[0];
        if (!file) return;

        console.log("File selected:", file.name, file.size);
        e.target.value = ''; // Reset input

        setLoading(true);
        setErrorMessage(null);
        setLoadingMessage('Reading file...');

        try {
            // Read File to Base64 ONCE
            const base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    const res = reader.result as string;
                    resolve(res.split(',')[1]);
                };
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });

            // STEP 1: AI Auto-Learning (Extract & Save Invoice Data)
            setLoadingMessage('AI Learning (Gemini Analysis)...');
            try {
                const learnedItems = await geminiService.parseInvoiceMaterials(base64, file.type);
                if (learnedItems && learnedItems.length > 0) {
                    // Transform to CommercialInvoiceItem format (Fail-Safe)
                    const dbItems = learnedItems.map(item => ({
                        id: crypto.randomUUID(),
                        invoiceNo: 'AUTO-LEARNED',
                        partNo: item.partNumber || 'UNIDENTIFIED',
                        description: item.description || '(No Description)',
                        qty: (typeof item.qty === 'number' && !isNaN(item.qty)) ? item.qty : -1,
                        unitPrice: (typeof item.unitPrice === 'number' && !isNaN(item.unitPrice)) ? item.unitPrice : 0,

                        currency: 'USD',
                        status: 'Pending',
                        updatedAt: new Date().toISOString(),
                        date: new Date().toISOString().split('T')[0],
                        item: '',
                        model: '',
                        englishName: '',
                        spanishDescription: '',
                        hts: '',
                        prosec: '',
                        rb: '',
                        um: 'PCS',
                        netWeight: 0,
                        totalAmount: 0,
                        regimen: '',
                    }));

                    if (dbItems.length > 0) {
                        await storageService.addInvoiceItems(dbItems as any);
                        showNotification('AI Learning Complete', `Learned ${dbItems.length} items.`, 'success');
                    }
                }
            } catch (err: any) {
                console.error("AI Learning Warning:", err);
                // Non-fatal, continue to Step 2
            }

            // STEP 2: Pedimento Parsing (NOW USING GEMINI AI)
            setLoadingMessage('Gemini AI: Extracting Pedimento Data...');
            const aiRecord = await geminiService.extractPedimento(base64, 'application/pdf');

            // MAP AI Record -> PedimentoData (UI Format)
            const mappedHeader: any = {
                pedimentoNo: aiRecord.pedimento || '',
                isSimplified: false, // AI usually extracts standard
                fechas: aiRecord.fechaPago ? [{ tipo: 'Pago' as const, fecha: aiRecord.fechaPago }] : [],
                valores: {
                    dolares: aiRecord.totalValueUsd || 0,
                    aduana: aiRecord.valorAduanaTotal || 0,
                    comercial: 0 // calculated from items if needed
                },
                importes: {
                    dta: aiRecord.dtaTotal || 0,
                    prv: aiRecord.prevalidacionTotal || 0,
                    cnt: aiRecord.cntTotal || 0,
                    iva: 0, // Sum from items
                    igi: 0, // Sum from items
                    totalEfectivo: aiRecord.totalTaxes || 0
                },
                tasasGlobales: [],
                transporte: { medios: [], candados: [] },
                guias: [],
                contenedores: [],
                facturas: [],
                proveedores: []
            };

            const mappedItems: PedimentoItem[] = (aiRecord.items || []).map((aiItem: any, idx) => ({
                partNo: aiItem.partNumber || `UNIDENTIFIED-${idx + 1}`,
                secuencia: Number(aiItem.secuencia) || idx + 1,
                fraccion: aiItem.fraccion || '',
                nico: aiItem.nico,
                description: aiItem.descripcion || '',
                qty: Number(aiItem.cantidadComercial) || 0,
                umc: aiItem.unidadMedidaComercial || '',
                qtyUmt: Number(aiItem.cantidadTarifa) || 0,
                umt: aiItem.unidadMedidaTarifa || '',
                unitPrice: Number(aiItem.precioUnitario) || 0,
                totalAmount: Number(aiItem.valorComercial) || 0,
                valorAduana: Number(aiItem.valorAduana) || 0,
                valorComercial: Number(aiItem.valorComercial) || 0,
                identifiers: (aiItem.identifiers || []).map((id: any) => ({
                    level: 'Item',
                    code: id.code,
                    complement1: id.complement1
                })),
                contribuciones: (aiItem.contribuciones || []).map((c: any) => ({
                    clave: c.clave,
                    importe: Number(c.importe),
                    tasa: Number(c.tasa),
                    tipoTasa: c.tipoTasa,
                    formaPago: c.formaPago
                })),
                regulaciones: (aiItem.regulaciones || []).map((r: any) => ({
                    clave: r.clave,
                    permiso: r.permiso
                })),
                observaciones: aiItem.observaciones,
                page: 1
            }));

            const data: PedimentoData = {
                header: mappedHeader,
                items: mappedItems,
                rawText: "Extracted by Gemini AI",
                validationResults: []
            };

            setPedimentoData(data);
            processMatching(data);
            setLoading(false);

        } catch (error: any) {
            console.error(error);
            setLoading(false);
            setErrorMessage(error.message || 'Failed to parse PDF');
        }
    };

    // Extract matching logic to keep handler clean (optional, but good for readability)
    const processMatching = (data: PedimentoData) => {
        const dbItems = storageService.getInvoiceItems();
        // ... (existing logic) ...
        const matchedDbKeys = new Set<string>();
        const partMap = new Map();

        // Aggregate DB Items by PartNo (Normalize)
        dbItems.forEach(item => {
            // Normalize: Remove dashes, spaces, uppercase
            const key = normalizePart(item.partNo);
            if (!partMap.has(key)) {
                partMap.set(key, { ...item, qty: 0 });
            }
            const existing = partMap.get(key);
            existing.qty += item.qty;
        });

        const rows: ComparisonRow[] = [];

        // 1. PDF Items -> DB Matches
        data.items.forEach(pItem => {
            const pKey = normalizePart(pItem.partNo);
            const dbItem = partMap.get(pKey);

            let status: ComparisonRow['status'] = 'MISSING_IN_DB';
            if (dbItem) {
                matchedDbKeys.add(pKey);
                if (dbItem.qty === pItem.qty && Math.abs(dbItem.unitPrice - pItem.unitPrice) < 0.01) {
                    status = 'MATCH';
                } else {
                    status = 'MISMATCH';
                }
            }

            rows.push({
                partNo: pItem.partNo, // specific display
                pdfItem: pItem,
                dbItem: dbItem,
                status
            });
        });

        // 2. DB Items that were NOT matched
        partMap.forEach((dbItem, key) => {
            if (!matchedDbKeys.has(key)) {
                rows.push({
                    partNo: dbItem.partNo,
                    dbItem,
                    status: 'MISSING_IN_PDF'
                });
            }
        });

        // Sort: Mismatches/Missing First
        rows.sort((a, b) => {
            const score = (s: string) => s === 'MATCH' ? 1 : 0;
            return score(a.status) - score(b.status);
        });

        setComparisonRows(rows);
    };

    // ... (rest of methods) ...

    const closeErrorModal = () => {
        setErrorMessage(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const normalizePart = (p: any) => {
        if (!p) return '';
        return String(p).replace(/[^A-Z0-9]/gi, '').toUpperCase();
    };

    const handleOpenCustomsModal = () => {
        const all = storageService.getCustomsClearance();
        setCustomsRecords(all);

        // Auto-Search if Pedimento Number exists
        if (pedimentoData?.header.pedimentoNo) {
            setCustomsSearch(pedimentoData.header.pedimentoNo);
        }

        setShowCustomsModal(true);
    };

    const handleUpdateCustoms = async () => {
        if (!selectedCustomsId || !pedimentoData) return;

        const originalRecord = customsRecords.find(r => r.id === selectedCustomsId);
        if (!originalRecord) return;

        const updated: CustomsClearanceRecord = {
            ...originalRecord,
            pedimentoNo: pedimentoData.header.pedimentoNo || originalRecord.pedimentoNo,
            pedimentoPaymentDate: pedimentoData.header.fechaPago || originalRecord.pedimentoPaymentDate,
            // Assume Authorization happens same day as payment if missing?
            pedimentoAuthorizedDate: pedimentoData.header.fechaPago || originalRecord.pedimentoAuthorizedDate,
        };

        await storageService.updateCustomsClearance(updated);
        showNotification('Success', 'Customs Record updated with Pedimento info.', 'success');
        setShowCustomsModal(false);
    };

    const filteredCustoms = customsRecords.filter(r =>
        r.blNo.toLowerCase().includes(customsSearch.toLowerCase()) ||
        r.containerNo.toLowerCase().includes(customsSearch.toLowerCase()) ||
        r.pedimentoNo.toLowerCase().includes(customsSearch.toLowerCase())
    );

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div className="flex flex-col">
                    <h1 className="text-2xl font-bold text-slate-800">Proforma Validator</h1>
                    <p className="text-sm text-slate-500">AI-Powered Compliance</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handleResetDatabase}
                        className="flex items-center gap-2 px-3 py-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors text-xs font-bold uppercase tracking-wider"
                    >
                        <Trash2 size={14} />
                        Reset Items DB
                    </button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        accept=".pdf"
                        className="hidden"
                    />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition-colors"
                    >
                        <Upload size={18} /> Upload Pedimento PDF
                    </button>
                    {pedimentoData && (
                        <button
                            onClick={handleOpenCustomsModal}
                            className="bg-emerald-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-emerald-700 transition-colors"
                        >
                            <Save size={18} /> Update Customs Data
                        </button>
                    )}
                </div>
            </div>

            {/* Progress / Error Popup */}
            {(loading || errorMessage) && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-2xl p-8 max-w-sm w-full text-center border border-slate-100 relative">
                        {errorMessage ? (
                            <>
                                <button onClick={closeErrorModal} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
                                    <span className="sr-only">Close</span>
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                                <div className="mb-6 flex justify-center">
                                    <div className="bg-red-100 p-4 rounded-full">
                                        <AlertTriangle className="text-red-500 w-10 h-10" />
                                    </div>
                                </div>
                                <h3 className="text-xl font-bold text-slate-800 mb-2">Analysis Failed</h3>
                                <p className="text-red-600 font-medium mb-6">{errorMessage}</p>
                                <button
                                    onClick={closeErrorModal}
                                    className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 rounded-lg font-medium transition-colors"
                                >
                                    Close & Retry
                                </button>
                            </>
                        ) : (
                            <>
                                <div className="mb-6 flex justify-center">
                                    <div className="animate-spin rounded-full h-14 w-14 border-4 border-slate-100 border-t-indigo-600"></div>
                                </div>
                                <h3 className="text-xl font-bold text-slate-800 mb-2">Analyzing Document</h3>
                                <div className="h-1 w-16 bg-indigo-600 mx-auto rounded mb-4"></div>
                                <p className="text-slate-600 font-medium animate-pulse">{loadingMessage}</p>
                                <p className="text-xs text-slate-400 mt-4">Please wait while we validate compliance rules...</p>
                            </>
                        )}
                    </div>
                </div>
            )}

            {!loading && pedimentoData && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <div className="flex items-start justify-between mb-6">
                        <div>
                            <h2 className="text-lg font-bold flex items-center gap-2">
                                <FileText className="text-blue-500" />
                                {pedimentoData.header.isSimplified ? 'Pedimento Simplificado' : 'Pedimento Detallado'}
                            </h2>
                            <div className="mt-2 text-sm text-slate-600 grid grid-cols-2 gap-x-8 gap-y-1">
                                <p><span className="font-semibold">Pedimento:</span> {pedimentoData.header.pedimentoNo || 'Not Found'}</p>
                                <p><span className="font-semibold">Fecha Pago:</span> {pedimentoData.header.fechaPago || 'Not Found'}</p>
                            </div>
                        </div>
                        {pedimentoData.header.isSimplified && (
                            <div className="bg-amber-50 text-amber-800 px-4 py-3 rounded-lg text-sm max-w-md flex items-start gap-3">
                                <AlertTriangle className="shrink-0 mt-0.5" size={18} />
                                <div>
                                    <p className="font-bold">Validation Skipped</p>
                                    <p>Simplified documents do not contain line-item details. Only header information can be used to update Customs records.</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Validation Findings Panel */}
                    {(pedimentoData.validationResults?.length ?? 0) > 0 && (
                        <div className="mb-6 border-b border-slate-200 pb-6">
                            <h3 className="font-bold mb-3 text-slate-700 flex items-center gap-2">
                                <AlertTriangle size={20} className="text-amber-500" />
                                Audit Findings ({pedimentoData.validationResults.length})
                            </h3>
                            <div className="bg-slate-50 rounded-lg p-4 max-h-[300px] overflow-y-auto space-y-3">
                                {pedimentoData.validationResults.map((res, idx) => (
                                    <div key={idx} className={`p-3 rounded border text-sm flex gap-3 ${res.severity === 'ERROR' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                                        <div className="shrink-0 mt-0.5">
                                            {res.severity === 'ERROR' ? <AlertTriangle size={16} /> : <AlertTriangle size={16} />}
                                        </div>
                                        <div>
                                            <p className="font-bold mb-0.5">{res.field} <span className="opacity-75 font-normal">- {res.severity}</span></p>
                                            <p>{res.message}</p>
                                            <div className="mt-1 text-xs opacity-80 flex gap-4">
                                                <span>Expected: {res.expected}</span>
                                                <span>Actual: {res.actual}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* NEW: Pedimento Summary Panel */}
                    <PedimentoSummary header={pedimentoData.header} />

                    {!pedimentoData.header.isSimplified && (
                        <div>
                            <h3 className="font-bold mb-4 text-slate-700 border-b pb-2">Item Validation ({comparisonRows.length} items)</h3>
                            <ComparisonTable
                                rows={comparisonRows}
                                onManualMap={(part) => showNotification('Coming Soon', 'Manual Mapping not implemented yet', 'info')}
                            />
                        </div>
                    )}
                </div>
            )}

            {!loading && !pedimentoData && (
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-12 text-center text-slate-400">
                    <Upload className="mx-auto mb-4 opacity-50" size={48} />
                    <p className="text-lg font-medium">Upload a Pedimento PDF (Proforma or Paid)</p>
                    <p className="text-sm">The system will analyze structure and validate against commercial invoices.</p>
                </div>
            )}

            {/* Customs Update Modal */}
            {showCustomsModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-6 border-b border-slate-100">
                            <h3 className="text-lg font-bold">Select Customs Record</h3>
                            <p className="text-sm text-slate-500">Choose the record to update with Pedimento info.</p>
                        </div>
                        <div className="p-4 bg-slate-50 border-b border-slate-200">
                            <div className="relative">
                                <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                                <input
                                    className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="Search by BL, Container or Pedimento..."
                                    value={customsSearch}
                                    onChange={(e) => setCustomsSearch(e.target.value)}
                                    autoFocus
                                />
                            </div>
                        </div>
                        <div className="max-h-[300px] overflow-y-auto">
                            {filteredCustoms.length === 0 ? (
                                <div className="p-8 text-center text-slate-400 text-sm">No records found.</div>
                            ) : (
                                <div className="divide-y divide-slate-100">
                                    {filteredCustoms.map(r => (
                                        <button
                                            key={r.id}
                                            onClick={() => setSelectedCustomsId(r.id)}
                                            className={`w-full text-left p-4 hover:bg-blue-50 transition-colors flex items-center justify-between ${selectedCustomsId === r.id ? 'bg-blue-50 ring-1 ring-blue-500 inner-border' : ''}`}
                                        >
                                            <div>
                                                <div className="font-bold text-slate-800 text-sm">{r.blNo || 'No BL'}</div>
                                                <div className="text-xs text-slate-500">{r.containerNo}</div>
                                            </div>
                                            {selectedCustomsId === r.id && <CheckCircle className="text-blue-600" size={18} />}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
                            <button onClick={() => setShowCustomsModal(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg text-sm font-medium">Cancel</button>
                            <button
                                onClick={handleUpdateCustoms}
                                disabled={!selectedCustomsId}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Confirm Update
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
