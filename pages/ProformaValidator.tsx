import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileText, CheckCircle, Search, AlertTriangle, ArrowRight, Save, Trash2, History, List, X, UmbrellaIcon, Minus } from 'lucide-react';
import { storageService } from '../services/storageService';
import { geminiService } from '../services/geminiService';
import { Phase3 } from '../components/proforma/Phase3';
import { PedimentoSummary } from '../components/proforma/PedimentoSummary';
import { PedimentoPartidas } from '../components/proforma/PedimentoPartidas';
import { Layout } from '../components/Layout';
import { CustomsClearanceRecord } from '../types';
import { PedimentoData } from '../services/pedimentoParser';
import { AnnotationEditorUIManager } from 'pdfjs-dist';
import { permission } from 'process';

export const ProformaValidator = () => {
    // --- STATE MANAGEMENT ---
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // Phase 1 Data (Raw)
    const [rawInvoiceItems, setRawInvoiceItems] = useState<any>(null); // Raw JSON from Gemini
    const [showRawModal, setShowRawModal] = useState(false);

    // Phase 2 Data (Structured)
    const [pedimentoData, setPedimentoData] = useState<PedimentoData | null>(null);
    const [structuredData, setStructuredData] = useState<any>(null); // Full Analysis Record
    const [isStructuring, setIsStructuring] = useState(false);
    const [phase2Error, setPhase2Error] = useState<string | null>(null);
    const [showPhase2Modal, setShowPhase2Modal] = useState(false);

    // Customs Update Modal
    const [showCustomsModal, setShowCustomsModal] = useState(false);
    const [customsRecords, setCustomsRecords] = useState<CustomsClearanceRecord[]>([]);
    const [customsSearch, setCustomsSearch] = useState('');
    const [selectedCustomsId, setSelectedCustomsId] = useState<string | null>(null);

    // Invoice Management Modal
    const [showInvoicesModal, setShowInvoicesModal] = useState(false);
    const [viewMode, setViewMode] = useState<'anexo' | 'flat'>('flat'); // Default to Flat as requested
    const [storedInvoices, setStoredInvoices] = useState<any[]>([]);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // --- EFFECT: Load Invoices on Mount ---
    useEffect(() => {
        loadInvoices();
    }, []);

    const loadInvoices = () => {
        const items = storageService.getInvoiceItems();
        // Group by Invoice No
        const grouped = items.reduce((acc: any, item) => {
            acc[item.invoiceNo] = (acc[item.invoiceNo] || 0) + 1;
            return acc;
        }, {});
        setStoredInvoices(Object.entries(grouped).map(([inv, count]) => ({ invoiceNo: inv, count })));
    };



    const openInvoicesModal = () => {
        loadInvoices();
        setShowInvoicesModal(true);
    };

    const handleDeleteInvoice = (invoiceNo: string) => {
        if (confirm(`Delete all items for Invoice ${invoiceNo}?`)) {
            storageService.deleteInvoiceByNumber(invoiceNo);
            loadInvoices();
        }
    };

    // --- FILE HANDLING ---
    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const uploadedFile = event.target.files?.[0];
        if (!uploadedFile) return;

        setFile(uploadedFile);
        setLoading(true);
        setErrorMessage(null);
        setPedimentoData(null);
        setRawInvoiceItems(null);

        try {
            // PHASE 1: Forensic Extraction (Raw Text Analysis)
            setLoadingMessage('Performing Deep Forensic Scan (Gemini 2.0 Flash)...');

            // Convert to Base64
            const base64Data = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    const result = reader.result as string;
                    // Remove data URL prefix (e.g. "data:application/pdf;base64,")
                    const base64 = result.split(',')[1];
                    resolve(base64);
                };
                reader.onerror = reject;
                reader.readAsDataURL(uploadedFile);
            });

            // Call correct service method (Raw Extraction)
            const rawResult = await geminiService.parseInvoiceMaterials(base64Data);

            if (!rawResult) throw new Error("Forensic extraction failed to return data.");

            setRawInvoiceItems(rawResult); // Store Phase 1 result
            setLoading(false);
            setShowRawModal(true); // Show Inspector immediately
        } catch (error: any) {
            console.error("Analysis Error:", error);
            setErrorMessage(error.message || "Failed to analyze document.");
            setLoading(false);
        }
    };

    // --- PHASE 2: STRUCTURED ANALYSIS ---
    const handlePhase2Analysis = async () => {
        setIsStructuring(true);
        setShowRawModal(false);
        setShowPhase2Modal(true);

        try {
            setPhase2Error(null);
            const result = await geminiService.parseForensicStructure(rawInvoiceItems);

            if (!result) {
                throw new Error("Empty response from AI Analysis");
            }

            // --- DATA MAPPING BRIDGE ---
            // Convert Gemini JSON -> PedimentoData Interface
            // Now using 'page1' structure for comprehensive Page 1 coverage
            const p1 = result.page1 || {};
            const itemArr = result.items || [];

            // User requested flat mapping logic
            const impuestos = p1.tasasGlobales || [];

            const mappedData: PedimentoData = {
                header: {
                    // REF:
                    pedimentoNo: p1.pedimento?.replace(/\D/g, '') || '', // Clean numeric
                    tipoOperacion: p1.tipoOperacion,

                    claveDocumento: p1.clavePedimento,
                    regimen: p1.regimen, // Mapped
                    destino: p1.destino, // Mapped
                    tipoCambio: p1.tipoCambio,
                    pesoBruto: p1.pesoBruto,
                    aduana: p1.aduana, // This is location (e.g. 430)
                    entradaSalida: p1.entradaSalida,
                    arribo: p1.arribo,
                    salida: p1.salida,

                    // Added as optional fields in interface to support user map
                    bultos: typeof p1.bultos === 'number' ? p1.bultos : 0,

                    dolares: p1.valores?.valorDolares || 0,
                    // aduana (money) mapped to valorAduana to avoid conflict with aduana (string)
                    valorAduana: p1.valores?.valorAduana || 0,
                    comercial: p1.valores?.valorComercial || 0,

                    rfc: p1.rfcImportador || p1.rfc || '', // Try both keys
                    curp: p1.curpImportador || p1.curp || '', // Try both keys
                    nombre: p1.nombreImportador || p1.nombre || '', // Try both keys
                    domicilio: p1.domicilioImportador || p1.domicilio || '', // Try both keys

                    fletes: p1.valores?.fletes,
                    seguros: p1.valores?.seguros,
                    embalajes: p1.valores?.embalajes,
                    otros: p1.valores?.otros,

                    fechas: [
                        { tipo: 'Entrada' as const, fecha: p1.fechas?.entrada || '' },
                        { tipo: 'Pago' as const, fecha: p1.fechas?.pago || '' }
                    ].filter(f => f.fecha),

                    // Keep structure for compatibility but data enters via flattened fields too
                    valores: {
                        dolares: p1.valores?.valorDolares || 0,
                        aduana: p1.valores?.valorAduana || 0,
                        comercial: p1.valores?.valorComercial || 0,
                        fletes: p1.valores?.fletes,
                        seguros: p1.valores?.seguros,
                        embalajes: p1.valores?.embalajes,
                        otros: p1.valores?.otros
                    },

                    tasasGlobales: [],
                    dta: impuestos,
                    prv: impuestos,
                    iva: impuestos,

                    importes: {
                        dta: p1.liquidacion?.dta,
                        iva: p1.liquidacion?.iva,
                        igi: p1.liquidacion?.igi,
                        prv: p1.liquidacion?.prv,
                        totalEfectivo: p1.liquidacion?.totalEfectivo
                    },




                    transporte: {
                        medios: p1.transporte?.medios ? [p1.transporte.medios] : [],
                        candados: p1.transporte?.candados || [],
                        identificacion: p1.identificadoresGlobales ?
                            p1.identificadoresGlobales.map((id: any) => `${id.clave}${id.complemento ? ':' + id.complemento : ''}`).join(', ')
                            : '',
                        pais: '',
                        transportista: p1.transporte?.transportista
                    },

                    observaciones: p1.observaciones,
                    acuseValidacion: p1.acuseValidacion,

                    guias: (p1.transporte?.guias || []).map((g: any) => ({
                        numero: g.numero || '',
                        tipo: g.tipo || 'MASTER'
                    })),

                    contenedores: p1.transporte?.contenedores ? p1.transporte.contenedores.map((c: string) => ({
                        numero: c,
                        tipo: 'Unknown'
                    })) : (p1.transporte?.container ? [{ numero: p1.transporte.container, tipo: 'Unknown' }] : []),

                    facturas: (result.invoices || []).map((inv: any) => ({
                        numero: inv.number,
                        fecha: inv.date,
                        incoterm: inv.incoterm,
                        moneda: inv.currency,
                        valorDolares: inv.amount,
                        proveedor: p1.supplier?.name
                    })),

                    proveedores: p1.supplier ? [{
                        id: p1.supplier.taxId || '',
                        nombre: p1.supplier.name || '',
                        domicilio: p1.supplier.address || ''
                    }] : [],

                    isSimplified: false,

                    // User requested identifier mapping
                    identif: p1.identif || p1.identificadoresGlobales?.[0]?.clave || '',
                    compl1: p1.compl1 || p1.identificadoresGlobales?.[0]?.complemento || '',
                    compl2: p1.compl2 || '',
                    compl3: p1.compl3 || ''
                },
                partidas: itemArr.map((item: any, idx: number) => ({
                    secuencia: item.secuencia || idx + 1,
                    fraccion: item.fraccion,
                    nico: item.nico,
                    vinculacion: item.vinculacion,
                    metodoValoracion: item.metodoValoracion,
                    umc: item.umc,
                    cantidadUMC: item.cantidadUMC,
                    umt: item.umt,
                    cantidadUMT: item.cantidadUMT,

                    // Values
                    paisVendedor: item.paisvendedor,
                    paisComprador: item.paiscomprador,
                    valorAduana: item.valoraduana,
                    precioPagado: item.preciopagado,
                    moneda: item.moneda,
                    precioUnitario: item.preciounitario,
                    valorAgregado: item.valagregado,

                    // Identificadores (Flattened per user request)
                    clave: item.clave,
                    permiso: item.permiso,
                    firmaDescargo: item.firmadescargo,
                    valComDls: item.valcomdls,
                    // cantidadumt/c logic skipped
                    identificador: item.identificador,
                    complemento1: item.complemento1,
                    complemento2: item.complemento2,
                    complemento3: item.complemento3,

                    // Pass-through for Validation Logic
                    contribuciones: item.contribuciones || [],
                    regulaciones: item.regulaciones || [],
                    identifiers: item.identifiers || []
                }))
            } as PedimentoData;

            mappedData.rawText = result.rawText || '';
            mappedData.validationResults = [];



            setPedimentoData(mappedData);
            setStructuredData(result); // Keep raw JSON for debug view



        } catch (error: any) {
            console.error("Phase 2 Critical Error", error);
            setPhase2Error(error.message || "Critical failure during analysis.");
        } finally {
            setIsStructuring(false);
        }
    };

    // ... (rest of methods) ...

    const closeErrorModal = () => {
        setErrorMessage(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const normalizePart = (p: any) => {
        if (!p) return '';
        return String(p).toUpperCase().replace(/[^A-Z0-9]/g, '');
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
            pedimentoAuthorizedDate: originalRecord.pedimentoAuthorizedDate,
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

    const showNotification = (title: string, msg: string, type: 'info' | 'success' | 'error') => {
        // Placeholder for notification system
        console.log(`[${type.toUpperCase()}] ${title}: ${msg}`);
        // You would typically use a toast library here
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div className="flex flex-col">
                    <h1 className="text-2xl font-bold text-slate-800">Proforma Validator</h1>
                </div>
                <div className="flex gap-2">

                    <button
                        onClick={async () => {
                            try {
                                const { collection, getCountFromServer } = await import('firebase/firestore');
                                const { db } = await import('../services/firebaseConfig');
                                if (!db) { alert('No DB connection'); return; }
                                const coll = collection(db, 'commercial_invoices');
                                const snapshot = await getCountFromServer(coll);
                                alert(`Cloud Data Check:\nFound ${snapshot.data().count} items in Firestore 'commercial_invoices' collection.`);
                            } catch (e: any) {
                                console.error(e);
                                alert(`Error checking cloud: ${e.message || e}`);
                            }
                        }}
                        className="flex items-center gap-2 px-3 py-2 text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors text-xs font-bold uppercase tracking-wider"
                    >
                        <History size={14} />
                        Debug Cloud
                    </button>
                    <button
                        onClick={openInvoicesModal}
                        className="flex items-center gap-2 px-3 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors text-xs font-bold uppercase tracking-wider"
                    >
                        <List size={14} />
                        Manage Invoices
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
                            </>
                        )}
                    </div>
                </div>
            )}

            {!loading && pedimentoData && viewMode === 'anexo' && (
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

                    {/* NEW: Pedimento Summary Panel */}
                    <PedimentoSummary header={pedimentoData.header} />

                    {!pedimentoData.header.isSimplified && (
                        <div>
                            <h3 className="font-bold mb-4 text-slate-700 border-b pb-2">PARTIDAS ({pedimentoData.partidas.length})</h3>
                            <PedimentoPartidas items={pedimentoData.partidas} />
                        </div>
                    )}
                </div>
            )}

            {/* NEW: Phase 3 Render (Replamiento de Flat View) */}
            {!loading && pedimentoData && (
                <div className="mt-8">
                    <Phase3 data={pedimentoData} />
                </div>
            )}


            {
                !loading && !pedimentoData && (
                    <div className="border-2 border-dashed border-slate-300 rounded-xl p-12 text-center text-slate-400">
                        <Upload className="mx-auto mb-4 opacity-50" size={48} />
                        <p className="text-lg font-medium">Upload Document (Proforma / Paid)</p>
                        <p className="text-sm mt-2 max-w-md mx-auto">
                            Raw Forensic Text Extraction.
                            <br />
                            <span className="opacity-75 text-xs">Direct Gemini 2.0 Output • No Compliance Rules • No Filtering</span>
                        </p>
                    </div>
                )
            }

            {/* RAW AI INSPECTOR: Phase 1 (Data Dump - Compact View) */}
            {
                showRawModal && (
                    <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                        <div className="bg-white w-[900px] max-w-full h-[600px] max-h-[90vh] rounded-lg shadow-2xl flex flex-col relative overflow-hidden ring-1 ring-slate-200">
                            {/* Header */}
                            <div className="absolute top-0 left-0 right-0 h-10 bg-white border-b flex items-center justify-end px-3">
                                <button
                                    onClick={() => setShowRawModal(false)}
                                    className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-1 rounded-md text-xs font-bold transition-colors flex items-center gap-1"
                                >
                                    Cerrar <span className="text-slate-400">×</span>
                                </button>
                            </div>

                            {/* Body */}
                            <textarea
                                readOnly
                                className="flex-1 w-full h-full bg-white text-black font-mono text-xs p-8 pt-12 resize-none focus:outline-none"
                                value={typeof rawInvoiceItems === 'string' ? rawInvoiceItems : JSON.stringify(rawInvoiceItems, null, 2)}
                            />

                            {/* Footer (Bridge to Phase 2) */}
                            <div className="h-14 border-t bg-slate-50 flex items-center justify-between px-6 shrink-0">
                                <span className="text-xs text-slate-400 font-mono">Phase 1: Forensic Verification</span>
                                <button
                                    onClick={handlePhase2Analysis}
                                    className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 transition-colors flex items-center gap-2 shadow-sm"
                                >
                                    Analizar Estructura (Fase 2) <ArrowRight size={16} />
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* PHASE 2 INSPECTOR: Structured Analysis (Strict Mode) */}
            {
                showPhase2Modal && (
                    <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                        <div className="bg-white w-[1000px] max-w-full h-[700px] max-h-[90vh] rounded-lg shadow-2xl flex flex-col relative overflow-hidden">
                            {/* Phase 2 Header */}
                            <div className="h-14 border-b bg-indigo-50 flex items-center justify-between px-6">
                                <h3 className="font-bold text-indigo-900 flex items-center gap-2">
                                    <FileText size={18} />
                                    Phase 2: Structured Analysis (Strict Mode)
                                </h3>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => { setShowPhase2Modal(false); setShowRawModal(true); }}
                                        className="text-indigo-600 hover:bg-indigo-100 px-3 py-1 rounded text-sm font-medium transition-colors"
                                    >
                                        Back to Raw
                                    </button>
                                    <button
                                        onClick={() => setShowPhase2Modal(false)}
                                        className="text-slate-500 hover:text-slate-700 hover:bg-slate-100 p-1.5 rounded-md transition-colors"
                                        title="Minimize"
                                    >
                                        <Minus size={18} />
                                    </button>
                                    <button
                                        onClick={() => setShowPhase2Modal(false)}
                                        className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-3 py-1 rounded-md text-sm font-bold transition-colors"
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>

                            <div className="flex-1 overflow-hidden flex bg-slate-50">
                                {isStructuring ? (
                                    <div className="flex-1 flex flex-col items-center justify-center space-y-4">
                                        <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-100 border-t-indigo-600"></div>
                                        <p className="text-slate-500 font-medium animate-pulse">Running Strict Forensic Analysis...</p>
                                    </div>
                                ) : pedimentoData ? (
                                    <div className="flex-1 overflow-y-auto p-8 space-y-8">
                                        <div className="space-y-4">
                                            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md">
                                                <h4 className="font-bold text-yellow-800">Raw Data Inspector (Strict Mode)</h4>
                                                <p className="text-sm text-yellow-700">Displaying raw forensic data extraction.</p>
                                            </div>
                                            <textarea
                                                className="w-full h-96 p-4 font-mono text-xs bg-gray-900 text-green-400 rounded-lg"
                                                value={structuredData?.aiJson ? JSON.stringify(structuredData.aiJson, null, 2) : "No Raw Forensic Data Available"}
                                                readOnly
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                                        {phase2Error ? (
                                            <div className="max-w-md text-center p-6 bg-red-50 rounded-xl border border-red-100">
                                                <AlertTriangle className="mx-auto text-red-500 mb-4" size={32} />
                                                <h4 className="text-red-800 font-bold mb-2">Analysis Failed</h4>
                                                <p className="text-sm text-red-600 mb-6 font-mono break-words">{phase2Error}</p>
                                                <button
                                                    onClick={handlePhase2Analysis}
                                                    className="bg-red-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-red-700 transition-colors"
                                                >
                                                    Retry Phase 2 (Strict)
                                                </button>
                                            </div>
                                        ) : (
                                            "No Data"
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Customs Update Modal */}
            {
                showCustomsModal && (
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
                                    onClick={() => handleUpdateCustoms()}
                                    disabled={!selectedCustomsId}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Confirm Update
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Manage Invoices Modal */}
            {
                showInvoicesModal && (
                    <div className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                        <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                            <div className="flex justify-between items-center p-6 border-b border-slate-100">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-800">Manage Invoices</h3>
                                    <p className="text-xs text-slate-500">Stored Commercial Invoices</p>
                                </div>
                                <button onClick={() => setShowInvoicesModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="p-0 max-h-[400px] overflow-y-auto">
                                {storedInvoices.length === 0 ? (
                                    <div className="p-8 text-center">
                                        <div className="bg-slate-50 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                                            <FileText className="text-slate-300" size={24} />
                                        </div>
                                        <p className="text-slate-500 text-sm">No invoices extracted yet.</p>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-slate-100">
                                        {storedInvoices.map((inv, idx) => (
                                            <div key={idx} className="p-4 hover:bg-slate-50 transition-colors flex justify-between items-center group">
                                                <div>
                                                    <div className="font-bold text-slate-700 text-sm">{inv.invoiceNumber}</div>
                                                    <div className="text-xs text-slate-500">{inv.items?.length || 0} items • {inv.invoiceDate || 'No Date'}</div>
                                                </div>
                                                <button
                                                    onClick={() => handleDeleteInvoice(inv.invoiceNumber)}
                                                    className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-2"
                                                    title="Remove Invoice"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                                <button
                                    onClick={() => setShowInvoicesModal(false)}
                                    className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm font-bold hover:bg-slate-50 transition-colors"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};
