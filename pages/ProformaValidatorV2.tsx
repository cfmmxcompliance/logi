import React, { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle, Search, AlertTriangle, ArrowRight, Save, Download, FileJson, LayoutDashboard, ListTree, XCircle } from 'lucide-react';
import { storageService } from '../services/storageService';
import { CommercialInvoiceItem, PreAlertRecord, VesselTrackingRecord } from '../types';
import * as XLSX from 'xlsx';

interface PythonPartida {
    secuencia: number | string;
    fraccion: string;
    numero_parte: string;
    factura: string;
    cantidad_umc: string;
    cantidad_umt: string;
    val_adu_usd: string;
    precio_unitario: string;
    precio_pagado: string;
    fa_original: string | null;
    permiso_r8: string | null;
    descripcion: string | null;
    nom_aplicable: string | null;
    importe: string | null;
}

interface PythonCabecera {
    pedimento: string | null;
    tipo_cambio: number | null;
    peso_bruto: number | null;
    valor_dolares: number | null;
    valor_aduana: number | null;
    dta: number | null;
    prv: number | null;
    iva_prv: number | null;
    iva: number | null;
    efectivo: number | null;
    factura: string | null;
    incoterm: string | null;
    moneda: string | null;
    guia: string | null;
    contenedores: string[] | null;
    id_fiscal: string | null;
    proveedor: string | null;
}

interface PythonConciliacion {
    partidas_declaradas: number;
    partidas_extraidas: number;
    secuencias_faltantes: number[];
    secuencias_duplicadas: number;
    sin_secuencia: number;
    suma_val_adu: number;
    valor_aduana_encabezado: number;
    diferencia: number;
    concilia: boolean;
}

interface PythonResponse {
    cabecera: PythonCabecera;
    partidas: PythonPartida[];
    conciliacion: PythonConciliacion;
}

type ValidationStatus = 'OK' | 'DIFERENCIA' | 'NO_EN_FACTURA' | 'NO_EN_PEDIMENTO';

interface ValidationRow {
    secuencia: string | number;
    partNoPedimento: string;
    fraccion: string;
    cantUmc: string;
    precioPedimento: number;
    precioFactura: number | null;
    diferencia: number | null;
    permisoR8: string | null;
    estado: ValidationStatus;
    facturaOrigen?: string;
    descripcion?: string | null;
    nomAplicable?: string | null;
    importe?: string | null;
}

export const ProformaValidatorV2 = () => {
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [loading, setLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [error, setError] = useState<string | null>(null);

    // Extraction Data
    const [extractedData, setExtractedData] = useState<PythonResponse | null>(null);
    const [detectedInvoiceNo, setDetectedInvoiceNo] = useState<string>('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Invoice Binding
    const [searchInvoice, setSearchInvoice] = useState('');
    const [invoiceItems, setInvoiceItems] = useState<CommercialInvoiceItem[]>([]);
    
    // Header binding
    const [relatedPreAlert, setRelatedPreAlert] = useState<PreAlertRecord | null>(null);
    const [relatedTracking, setRelatedTracking] = useState<VesselTrackingRecord | null>(null);
    
    // Target invoices for manual override (COVEs)
    const [targetInvoices, setTargetInvoices] = useState<{ id: string, label: string, isCove: boolean }[]>([]);

    // Validation Results
    const [validationRows, setValidationRows] = useState<ValidationRow[]>([]);
    const [showRawJson, setShowRawJson] = useState(false);
    
    // UI State
    const [activeTab, setActiveTab] = useState<'CABECERA' | 'PARTIDAS'>('CABECERA');

    const callPythonExtractor = async (base64Pdf: string): Promise<PythonResponse> => {
        try {
            // using dynamic import for firebase to avoid breaking SSR or initial load
            const { getFunctions, httpsCallable } = await import('firebase/functions');
            const { app } = await import('../services/firebaseConfig');
            
            const functions = getFunctions(app, 'us-central1');
            const extractFn = httpsCallable<any, any>(functions, 'extract_pedimento_partidas');
            
            const result = await extractFn({ pdf_base64: base64Pdf });
            return result.data as PythonResponse;
        } catch (e: any) {
            console.error("Python extractor error:", e);
            throw new Error(e.message || "Error al extraer partidas con el script Python.");
        }
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setLoading(true);
        setError(null);
        setStep(1);

        try {
            setLoadingMessage('Extrayendo partidas usando script Python determinista (Capa A)...');
            
            const base64Data = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    const result = reader.result as string;
                    resolve(result.split(',')[1]);
                };
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });

            const result = await callPythonExtractor(base64Data);
            
            if (!result || !result.partidas) {
                throw new Error("El extractor no devolvió partidas válidas.");
            }

            setExtractedData(result);
            
            // Attempt to auto-detect invoice from cabecera first, then fallback to partidas
            let autoInv = result.cabecera?.factura;
            if (!autoInv) {
                const facturas = new Set(result.partidas.map(p => p.factura).filter(Boolean));
                const arrFacturas = Array.from(facturas);
                if (arrFacturas.length > 0) {
                    autoInv = arrFacturas[0] as string;
                }
            }
            
            if (autoInv) {
                setDetectedInvoiceNo(autoInv);
                setSearchInvoice(autoInv);
            }

            if (result.cabecera?.facturas) {
                setTargetInvoices(result.cabecera.facturas.map((f: any, i: number) => ({
                    id: `inv-${i}`,
                    label: f.factura,
                    isCove: f.es_cove || f.factura.toUpperCase().startsWith('COVE')
                })));
            } else {
                setTargetInvoices([]);
            }

            setStep(2);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleLoadInvoice = async () => {
        if (!targetInvoices || targetInvoices.length === 0) {
             setError("No hay facturas seleccionadas para validar.");
             return;
        }

        setLoading(true);
        setLoadingMessage(`Buscando ítems para ${targetInvoices.length} factura(s)...`);
        try {
            const allItems = storageService.getInvoiceItems();
            const normalize = (s: string) => s.trim().toUpperCase();
            
            const facturasObjetivo = targetInvoices.map(t => normalize(t.label)).filter(Boolean);
            const filtered = allItems.filter(item => facturasObjetivo.includes(normalize(item.invoiceNo)));
            
            if (filtered.length === 0) {
                throw new Error(`No se encontraron ítems para las facturas especificadas: ${facturasObjetivo.join(', ')}`);
            }
            
            // Fetch related Pre-Alert / Tracking for header cross-validation
            const allPreAlerts = storageService.getPreAlerts();
            const matchingPreAlert = allPreAlerts.find(pa => 
                (pa.invoiceNo && facturasObjetivo.some(inv => normalize(pa.invoiceNo).includes(normalize(inv)))) ||
                (extractedData?.cabecera?.guia && pa.bookingAbw && normalize(pa.bookingAbw).includes(normalize(extractedData.cabecera.guia)))
            );
            
            setRelatedPreAlert(matchingPreAlert || null);
            
            const allTracking = storageService.getVesselTracking();
            const matchingTrackings = allTracking.filter(t => 
                (t.invoiceNo && facturasObjetivo.some(inv => normalize(t.invoiceNo).includes(normalize(inv)))) ||
                (extractedData?.cabecera?.guia && t.blNo && normalize(t.blNo).includes(normalize(extractedData.cabecera.guia))) ||
                (matchingPreAlert && matchingPreAlert.bookingAbw && t.blNo && normalize(t.blNo).includes(normalize(matchingPreAlert.bookingAbw)))
            );
            setRelatedTracking(matchingTrackings.length > 0 ? matchingTrackings : null);
            
            setInvoiceItems(filtered);
            runValidation(extractedData!.partidas, filtered);
            setStep(3);
            setActiveTab('CABECERA');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const normalizePart = (p: string | null | undefined) => {
        if (!p) return '';
        return String(p).toUpperCase().replace(/[^A-Z0-9]/g, '');
    };

    const runValidation = (pedimento: PythonPartida[], factura: CommercialInvoiceItem[]) => {
        const rows: ValidationRow[] = [];
        const usedFacturaIds = new Set<string>();

        pedimento.forEach(p => {
            const partNo = p.numero_parte || '';
            const normPart = normalizePart(partNo);
            const precioPedimento = parseFloat(p.precio_unitario || '0');
            
            // Find in factura
            const match = factura.find(f => normalizePart(f.partNo) === normPart);
            
            let estado: ValidationStatus = 'NO_EN_FACTURA';
            let diff: number | null = null;
            let precioFactura: number | null = null;
            let facturaOrigen: string = '';

            if (match) {
                usedFacturaIds.add(match.id);
                precioFactura = match.unitPrice;
                facturaOrigen = match.invoiceNo;
                diff = precioPedimento - precioFactura;
                estado = Math.abs(diff) <= 0.01 ? 'OK' : 'DIFERENCIA';
            }

            rows.push({
                secuencia: p.secuencia,
                partNoPedimento: partNo,
                fraccion: p.fraccion || '',
                cantUmc: p.cantidad_umc || '0',
                precioPedimento,
                precioFactura,
                diferencia: diff,
                permisoR8: p.permiso_r8 || null,
                estado,
                facturaOrigen, // añadimos la procedencia
                descripcion: p.descripcion,
                nomAplicable: p.nom_aplicable,
                importe: p.importe
            });
        });

        // Check for items in Factura NOT in Pedimento
        factura.forEach(f => {
            if (!usedFacturaIds.has(f.id)) {
                rows.push({
                    secuencia: '-',
                    partNoPedimento: f.partNo,
                    fraccion: f.hts || '',
                    cantUmc: f.qty.toString(),
                    precioPedimento: 0,
                    precioFactura: f.unitPrice,
                    diferencia: null,
                    permisoR8: null,
                    estado: 'NO_EN_PEDIMENTO'
                });
            }
        });

        // Sort rows: Errors first, then by sequence
        rows.sort((a, b) => {
            const getPriority = (s: ValidationStatus) => {
                if (s === 'NO_EN_FACTURA' || s === 'NO_EN_PEDIMENTO') return 0;
                if (s === 'DIFERENCIA') return 1;
                return 2;
            };
            const pA = getPriority(a.estado);
            const pB = getPriority(b.estado);
            if (pA !== pB) return pA - pB;
            
            const numA = parseInt(String(a.secuencia)) || 9999;
            const numB = parseInt(String(b.secuencia)) || 9999;
            return numA - numB;
        });

        setValidationRows(rows);
    };

    const exportToExcel = () => {
        if (validationRows.length === 0) return;
        const worksheet = XLSX.utils.json_to_sheet(validationRows.map(r => ({
            'Secuencia': r.secuencia,
            'Número Parte': r.partNoPedimento,
            'Fracción': r.fraccion,
            'Cant UMC': r.cantUmc,
            'Permiso R8': r.permisoR8 || 'N/A',
            'Precio Pedimento (USD)': r.precioPedimento,
            'Precio Factura (USD)': r.precioFactura !== null ? r.precioFactura : 'N/A',
            'Diferencia': r.diferencia !== null ? r.diferencia.toFixed(4) : 'N/A',
            'Estado': r.estado
        })));
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Validación");
        XLSX.writeFile(workbook, `Validacion_Pedimento_${searchInvoice}.xlsx`);
    };

    const getStatusStyle = (status: ValidationStatus) => {
        switch (status) {
            case 'OK': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
            case 'DIFERENCIA': return 'bg-amber-100 text-amber-800 border-amber-200';
            case 'NO_EN_FACTURA': return 'bg-red-100 text-red-800 border-red-200';
            case 'NO_EN_PEDIMENTO': return 'bg-orange-100 text-orange-800 border-orange-200';
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* PROGRESS BAR */}
            <div className="flex items-center justify-between mb-8 relative">
                <div className="absolute left-0 top-1/2 w-full h-1 bg-slate-200 -z-10 -translate-y-1/2"></div>
                <div className={`absolute left-0 top-1/2 h-1 bg-blue-600 -z-10 -translate-y-1/2 transition-all duration-500`} style={{ width: step === 1 ? '0%' : step === 2 ? '50%' : '100%' }}></div>
                
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold border-4 ${step >= 1 ? 'bg-blue-600 text-white border-blue-200' : 'bg-slate-100 text-slate-400 border-white'}`}>1</div>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold border-4 ${step >= 2 ? 'bg-blue-600 text-white border-blue-200' : 'bg-slate-100 text-slate-400 border-white'}`}>2</div>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold border-4 ${step >= 3 ? 'bg-blue-600 text-white border-blue-200' : 'bg-slate-100 text-slate-400 border-white'}`}>3</div>
            </div>

            {/* ERROR ALERT */}
            {error && (
                <div className="bg-red-50 text-red-700 p-4 rounded-lg border border-red-200 flex items-start gap-3">
                    <AlertTriangle className="shrink-0 mt-0.5" size={20} />
                    <div>
                        <h4 className="font-bold">Error en el proceso</h4>
                        <p className="text-sm">{error}</p>
                        <button onClick={() => setError(null)} className="mt-2 text-xs font-bold uppercase underline">Cerrar</button>
                    </div>
                </div>
            )}

            {/* LOADING STATE */}
            {loading && (
                <div className="bg-white p-12 rounded-xl shadow-sm border border-slate-200 text-center">
                    <div className="animate-spin rounded-full h-14 w-14 border-4 border-slate-100 border-t-blue-600 mx-auto mb-4"></div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">Procesando...</h3>
                    <p className="text-slate-500">{loadingMessage}</p>
                </div>
            )}

            {/* STEP 1: UPLOAD */}
            {!loading && step === 1 && (
                <div className="bg-white p-12 rounded-xl shadow-sm border-2 border-dashed border-slate-300 text-center">
                    <Upload className="mx-auto mb-4 text-blue-500" size={48} />
                    <h2 className="text-2xl font-bold text-slate-800 mb-2">Subir Pedimento (PDF)</h2>
                    <p className="text-slate-500 max-w-md mx-auto mb-6">
                        Sube el archivo PDF del pedimento. El motor determinista extraerá las partidas mediante coordenadas sin usar IA, asegurando precisión absoluta.
                    </p>
                    <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".pdf" className="hidden" />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-md flex items-center justify-center gap-2 mx-auto"
                    >
                        <FileText size={20} /> Seleccionar PDF
                    </button>
                </div>
            )}

            {/* STEP 2: BIND INVOICE */}
            {!loading && step === 2 && extractedData && (
                <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex items-center gap-3 mb-6">
                        <CheckCircle className="text-emerald-500" size={28} />
                        <div>
                            <h2 className="text-xl font-bold text-slate-800">Extracción Exitosa</h2>
                            <p className="text-sm text-slate-500">Se encontraron {extractedData.partidas.length} partidas en el pedimento.</p>
                        </div>
                    </div>

                    <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 mb-8">
                        
                                        <h3 className="font-bold text-slate-700 mb-4">Vincular con Facturas Comerciales</h3>
                                        <p className="text-sm text-slate-600 mb-4">
                                            El extractor detectó {extractedData.cabecera?.facturas?.length || 0} documento(s) equivalente(s). Si son COVEs, reemplázalos por los folios de Logimaster.
                                        </p>
                                        <div className="flex flex-col gap-4">
                                            <div className="flex flex-col gap-2">
                                                {targetInvoices.map((inv, i) => (
                                                    <div key={inv.id} className="flex gap-2 items-center">
                                                        <input 
                                                            type="text" 
                                                            value={inv.label} 
                                                            onChange={(e) => {
                                                                const newTargets = [...targetInvoices];
                                                                newTargets[i].label = e.target.value;
                                                                setTargetInvoices(newTargets);
                                                            }}
                                                            className={`flex-1 px-3 py-2 border rounded font-mono text-sm uppercase ${inv.isCove ? 'border-orange-400 bg-orange-50' : 'border-slate-300'}`}
                                                            placeholder="Ej. 26CFMABTT28019"
                                                        />
                                                        {inv.isCove && (
                                                            <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded font-bold">⚠ COVE</span>
                                                        )}
                                                        <button 
                                                            onClick={() => setTargetInvoices(targetInvoices.filter((_, idx) => idx !== i))}
                                                            className="text-slate-400 hover:text-red-500 p-2"
                                                        >
                                                            ✕
                                                        </button>
                                                    </div>
                                                ))}
                                                <button 
                                                    onClick={() => setTargetInvoices([...targetInvoices, { id: `manual-${Date.now()}`, label: '', isCove: false }])}
                                                    className="text-sm text-blue-600 hover:text-blue-800 self-start font-bold mt-1"
                                                >
                                                    + Añadir folio
                                                </button>
                                            </div>
                                            
                                            <button
                                                onClick={handleLoadInvoice}
                                                disabled={targetInvoices.length === 0 || targetInvoices.some(t => !t.label.trim())}
                                                className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg font-bold transition-colors disabled:opacity-50 mt-2 self-start"
                                            >
                                                Cargar {targetInvoices.length} Factura(s) y Validar
                                            </button>
                                        </div>

                    </div>
                </div>
            )}

            {/* STEP 3: VALIDATION REPORT */}
            {!loading && step === 3 && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                        <div>
                            <h2 className="text-xl font-bold text-slate-800">Reporte de Discrepancias</h2>
                            <p className="text-sm text-slate-500">Factura: <span className="font-bold">{searchInvoice}</span></p>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setShowRawJson(!showRawJson)}
                                className="px-4 py-2 bg-slate-200 text-slate-700 hover:bg-slate-300 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors"
                            >
                                <FileJson size={16} /> JSON Extractor
                            </button>
                            <button
                                onClick={exportToExcel}
                                className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors"
                            >
                                <Download size={16} /> Exportar Excel
                            </button>
                            <button
                                onClick={() => { setStep(1); setExtractedData(null); setValidationRows([]); }}
                                className="px-4 py-2 bg-slate-800 text-white hover:bg-slate-900 rounded-lg text-sm font-bold transition-colors"
                            >
                                Nuevo Archivo
                            </button>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex border-b border-slate-200 bg-white">
                        <button 
                            onClick={() => setActiveTab('CABECERA')}
                            className={`flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 transition-colors ${activeTab === 'CABECERA' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-slate-500 hover:bg-slate-50'}`}
                        >
                            <LayoutDashboard size={18} /> A Nivel General (Cabecera)
                        </button>
                        <button 
                            onClick={() => setActiveTab('PARTIDAS')}
                            className={`flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 transition-colors ${activeTab === 'PARTIDAS' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-slate-500 hover:bg-slate-50'}`}
                        >
                            <ListTree size={18} /> A Nivel Secuencias (Partidas)
                        </button>
                    </div>

                    {/* CABECERA VIEW */}
                    {activeTab === 'CABECERA' && extractedData?.cabecera && (
                        <div className="p-6 bg-slate-50">
                            <div className="grid grid-cols-2 gap-6">
                                {/* Columna Izquierda */}
                                <div className="space-y-6">
                                    {/* Identificación del Pedimento */}
                                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                            <FileText className="text-blue-500" size={18}/> Identificación del Pedimento
                                        </h3>
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                            <div className="flex justify-between col-span-2 p-1.5 rounded bg-slate-50"><span className="text-slate-500">Núm. Pedimento</span><span className="font-bold">{extractedData.cabecera.pedimento}</span></div>
                                            <div className="flex justify-between p-1.5 rounded"><span className="text-slate-500">T. Oper</span><span className="font-bold">{extractedData.cabecera.tipo_operacion}</span></div>
                                            <div className="flex justify-between p-1.5 rounded"><span className="text-slate-500">Cve</span><span className="font-bold">{extractedData.cabecera.cve_pedimento}</span></div>
                                            <div className="flex justify-between p-1.5 rounded bg-slate-50"><span className="text-slate-500">Aduana</span><span className="font-bold">{extractedData.cabecera.aduana_es}</span></div>
                                            <div className="flex justify-between p-1.5 rounded bg-slate-50"><span className="text-slate-500">Ref</span><span className="font-bold">{extractedData.cabecera.referencia}</span></div>
                                        </div>
                                    </div>

                                    {/* Datos del Importador y Proveedor */}
                                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                            <Search className="text-indigo-500" size={18}/> Importador y Proveedor
                                        </h3>
                                        <div className="space-y-3 text-sm">
                                            <div>
                                                <p className="text-xs font-bold text-slate-400 uppercase">Importador</p>
                                                <p className="font-bold text-slate-700">{extractedData.cabecera.rfc_importador}</p>
                                                <p className="text-slate-600 truncate">{extractedData.cabecera.razon_social_importador}</p>
                                            </div>
                                            <div className="border-t border-slate-100"></div>
                                            <div>
                                                <p className="text-xs font-bold text-slate-400 uppercase">Proveedor</p>
                                                <p className="font-bold text-slate-700">{extractedData.cabecera.proveedor_id_fiscal || extractedData.cabecera.id_fiscal}</p>
                                                <p className="text-slate-600 truncate">{extractedData.cabecera.proveedor_nombre}</p>
                                                <p className="text-xs text-slate-500">Vinculación: {extractedData.cabecera.proveedor_vinculacion}</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Documentos Equivalentes (Facturas) */}
                                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                            <FileText className="text-amber-500" size={18}/> Documentos Equivalentes
                                        </h3>
                                        <div className="space-y-2">
                                            {extractedData.cabecera.facturas && extractedData.cabecera.facturas.length > 0 ? (
                                                extractedData.cabecera.facturas.map((f: any, i: number) => {
                                                    const normalize = (s: string) => s.trim().toUpperCase();
                                                    const facturasLogi = targetInvoices.map(t => normalize(t.label));
                                                    const isValidName = facturasLogi.includes(normalize(f.factura));
                                                    
                                                    // Calculate DB total value for this invoice
                                                    const dbInvoiceItems = invoiceItems.filter(item => normalize(item.invoiceNo) === normalize(f.factura));
                                                    const dbInvoiceTotal = dbInvoiceItems.reduce((sum, item) => sum + (item.totalAmount || (item.qty * item.unitPrice) || 0), 0);
                                                    const pdfValue = f.valor_moneda || f.valor_dolares || 0;
                                                    
                                                    // Valid if diff is small (rounding tolerance) and we actually have items
                                                    const diff = Math.abs(dbInvoiceTotal - pdfValue);
                                                    const isValueValid = dbInvoiceItems.length > 0 && diff < 0.5;
                                                    
                                                    return (
                                                        <div key={i} className="mb-2 last:mb-0 p-2 bg-slate-50 rounded border border-slate-100">
                                                            <div className="flex justify-between items-center mb-1">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-bold text-slate-800 text-sm">{f.factura}</span>
                                                                    {isValidName ? <CheckCircle className="text-green-500" size={16}/> : <XCircle className="text-red-500" size={16}/>}
                                                                </div>
                                                                <span className="text-xs text-slate-500">{f.fecha}</span>
                                                            </div>
                                                            <div className="flex justify-between items-center text-xs">
                                                                <span className="text-slate-600 bg-slate-200 px-1.5 py-0.5 rounded">{f.incoterm}</span>
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="font-bold text-slate-700">{f.moneda} ${f.valor_moneda?.toLocaleString()}</span>
                                                                    {isValueValid ? (
                                                                        <CheckCircle className="text-green-500" size={14} title={`Coincide con Logi: $${dbInvoiceTotal.toLocaleString()}`}/>
                                                                    ) : (
                                                                        <XCircle className="text-red-500" size={14} title={`Difiere de Logi: $${dbInvoiceTotal.toLocaleString()}`}/>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })
                                            ) : (
                                                <p className="text-sm text-slate-500 italic">No se encontraron facturas</p>
                                            )}
                                            {extractedData.cabecera.facturas && extractedData.cabecera.facturas.length > 1 && (
                                                <div className="mt-2 pt-2 border-t border-slate-200 flex justify-between font-bold text-sm text-slate-700">
                                                    <span>Total {extractedData.cabecera.facturas.length} Facturas:</span>
                                                    <span>USD ${extractedData.cabecera.facturas.reduce((sum: number, f: any) => sum + (f.valor_dolares || 0), 0).toLocaleString()}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Proveedor */}
                                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                            <FileText className="text-amber-500" size={18}/> Datos del Proveedor
                                        </h3>
                                        <div className="space-y-2 text-sm">
                                            <div className="flex justify-between p-1.5"><span className="text-slate-500">Razón Social</span><span className="font-bold text-right">{extractedData.cabecera.proveedor_nombre}</span></div>
                                            <div className="flex justify-between p-1.5 bg-slate-50"><span className="text-slate-500">ID Fiscal</span><span className="font-bold font-mono">{extractedData.cabecera.proveedor_id_fiscal}</span></div>
                                            <div className="flex justify-between p-1.5"><span className="text-slate-500">Vinculación</span><span className="font-bold">{extractedData.cabecera.proveedor_vinculacion}</span></div>
                                            <div className="flex justify-between p-1.5 bg-slate-50"><span className="text-slate-500">Domicilio</span><span className="font-bold text-right text-xs max-w-[200px]">{extractedData.cabecera.proveedor_domicilio}</span></div>
                                        </div>
                                    </div>

                                    {/* Medios de Transporte */}
                                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                            <CheckCircle className="text-indigo-500" size={18}/> Medios de Transporte y Carga
                                        </h3>
                                        <div className="space-y-2 text-sm">
                                            <div className="flex justify-between p-1.5"><span className="text-slate-500">Medio Entrada</span><span className="font-bold">{extractedData.cabecera.transporte_entrada_desc} ({extractedData.cabecera.transporte_entrada})</span></div>
                                            <div className="flex justify-between p-1.5 bg-slate-50"><span className="text-slate-500">Peso Bruto</span><span className="font-bold">{extractedData.cabecera.peso_bruto?.toLocaleString()} kg</span></div>
                                            <div className="flex justify-between p-1.5"><span className="text-slate-500">Bultos Totales</span><span className="font-bold">{extractedData.cabecera.num_bultos}</span></div>
                                            <div className="flex justify-between p-1.5 bg-slate-50"><span className="text-slate-500">Marcas</span><span className="font-bold text-xs max-w-[150px] text-right">{extractedData.cabecera.marcas_numeros_bultos}</span></div>
                                        </div>
                                    </div>

                                    {/* Datos Bancarios y Pago */}
                                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                            <FileText className="text-blue-500" size={18}/> Datos del Pago Bancario
                                        </h3>
                                        <div className="space-y-2 text-sm">
                                            <div className="flex justify-between p-1.5"><span className="text-slate-500">Banco</span><span className="font-bold">{extractedData.cabecera.pago_banco}</span></div>
                                            <div className="flex justify-between p-1.5 bg-slate-50"><span className="text-slate-500">Línea de Captura</span><span className="font-bold font-mono">{extractedData.cabecera.pago_linea_captura}</span></div>
                                            <div className="flex justify-between p-1.5"><span className="text-slate-500">Importe Pagado</span><span className="font-bold text-emerald-700">${extractedData.cabecera.pago_importe?.toLocaleString()}</span></div>
                                            <div className="flex justify-between p-1.5 bg-slate-50"><span className="text-slate-500">Fecha de Pago</span><span className="font-bold">{extractedData.cabecera.pago_fecha_hora}</span></div>
                                            <div className="flex justify-between p-1.5"><span className="text-slate-500">Transacción SAT</span><span className="font-bold font-mono text-xs">{extractedData.cabecera.pago_transaccion_sat}</span></div>
                                        </div>
                                    </div>


                                    {/* Cruce Logístico (Embarques) */}
                                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                            <CheckCircle className="text-emerald-500" size={18}/> Cruce Logístico (Embarques)
                                        </h3>
                                        <div className="space-y-3 text-sm">
                                            {/* Guia */}
                                            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                                                <div className="flex justify-between mb-1">
                                                    <span className="text-slate-500 text-xs uppercase font-bold">Guía / BL (PDF)</span>
                                                    <span className="font-bold">{extractedData.cabecera.guia || 'No detectado'}</span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <span className="text-emerald-600 text-xs uppercase font-bold">BL (Base de Datos)</span>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-emerald-700">
                                                            {relatedPreAlert?.bookingAbw || (relatedTracking && relatedTracking.length > 0 ? relatedTracking[0].blNo : null) || 'No vinculado'}
                                                        </span>
                                                        {extractedData.cabecera.guia && (relatedPreAlert?.bookingAbw || (relatedTracking && relatedTracking.length > 0 ? relatedTracking[0].blNo : null)) ? (
                                                            (relatedPreAlert?.bookingAbw || relatedTracking?.[0]?.blNo || '').toUpperCase().includes(extractedData.cabecera.guia.toUpperCase()) || 
                                                            extractedData.cabecera.guia.toUpperCase().includes((relatedPreAlert?.bookingAbw || relatedTracking?.[0]?.blNo || '').toUpperCase())
                                                            ? <CheckCircle className="text-green-500" size={16}/> 
                                                            : <XCircle className="text-red-500" size={16}/>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            {/* Contenedores */}
                                            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                                                <div className="mb-2">
                                                    <span className="text-slate-500 text-xs uppercase font-bold block mb-1">Contenedores (PDF)</span>
                                                    <div className="flex flex-wrap gap-1">
                                                        {extractedData.cabecera.contenedores?.map((c: any, idx: number) => {
                                                            const containerText = typeof c === 'string' ? c : c.numero;
                                                            return (
                                                                <span key={idx} className="bg-white border border-slate-300 px-2 py-0.5 rounded text-xs font-mono">{containerText}</span>
                                                            );
                                                        }) || <span className="text-slate-400 text-xs">Ninguno detectado</span>}
                                                    </div>
                                                </div>
                                                <div>
                                                    <span className="text-emerald-600 text-xs uppercase font-bold block mb-1">Contenedores y Facturas (Base de Datos)</span>
                                                    <div className="flex flex-col gap-1.5">
                                                        {relatedTracking && relatedTracking.length > 0 ? (
                                                            relatedTracking.map((t: any, idx: number) => {
                                                                const dbContainer = t.containerNo || 'S/N';
                                                                const pdfContainers = extractedData.cabecera.contenedores?.map((c:any) => typeof c === 'string' ? c.toUpperCase() : c.numero?.toUpperCase()) || [];
                                                                const isValidContainer = pdfContainers.includes(dbContainer.toUpperCase());
                                                                
                                                                // Validate Invoices linked to this container in Tracking
                                                                const normalize = (s: string) => s.trim().toUpperCase();
                                                                const dbInvoices = t.invoiceNo ? t.invoiceNo.split(',').map((i: string) => normalize(i)) : [];
                                                                const pdfInvoices = extractedData.cabecera.facturas?.map((f:any) => normalize(f.factura)) || [];
                                                                
                                                                // Check if AT LEAST ONE invoice linked to this container matches the pedimento invoices
                                                                const hasMatchingInvoice = dbInvoices.length > 0 && dbInvoices.some((dbInv: string) => pdfInvoices.includes(dbInv));
                                                                const invoiceValidationText = dbInvoices.length > 0 ? `Facturas: ${dbInvoices.join(', ')}` : 'Sin facturas ligadas';

                                                                return (
                                                                    <div key={idx} className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-2 py-1.5 rounded">
                                                                        <div className="flex flex-col">
                                                                            <span className="text-emerald-900 text-xs font-mono font-bold">
                                                                                Contenedor: {dbContainer}
                                                                            </span>
                                                                            <span className="text-[10px] text-emerald-700 font-mono">
                                                                                {invoiceValidationText}
                                                                            </span>
                                                                        </div>
                                                                        <div className="flex flex-col items-center ml-auto gap-1">
                                                                            <div className="flex items-center gap-1 text-[10px] text-emerald-800" title="Validación Contenedor vs PDF">
                                                                                CONT: {isValidContainer ? <CheckCircle className="text-green-600" size={12}/> : <XCircle className="text-red-500" size={12}/>}
                                                                            </div>
                                                                            <div className="flex items-center gap-1 text-[10px] text-emerald-800" title="Validación Facturas ligadas vs PDF">
                                                                                FAC: {hasMatchingInvoice ? <CheckCircle className="text-green-600" size={12}/> : <XCircle className="text-red-500" size={12}/>}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })
                                                        ) : relatedPreAlert?.linkedContainers && relatedPreAlert.linkedContainers.length > 0 ? (
                                                            relatedPreAlert.linkedContainers.map((c: string, idx: number) => {
                                                                const pdfContainers = extractedData.cabecera.contenedores?.map((cObj:any) => typeof cObj === 'string' ? cObj.toUpperCase() : cObj.numero?.toUpperCase()) || [];
                                                                const isValidContainer = pdfContainers.includes(c.toUpperCase());
                                                                
                                                                // PreAlerts often have global invoices, not per container
                                                                const normalize = (s: string) => s.trim().toUpperCase();
                                                                const paInvoices = relatedPreAlert.invoiceNo ? relatedPreAlert.invoiceNo.split(',').map((i: string) => normalize(i)) : [];
                                                                const pdfInvoices = extractedData.cabecera.facturas?.map((f:any) => normalize(f.factura)) || [];
                                                                const hasMatchingInvoice = paInvoices.length > 0 && paInvoices.some((dbInv: string) => pdfInvoices.includes(dbInv));

                                                                return (
                                                                    <div key={idx} className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-2 py-1.5 rounded">
                                                                        <div className="flex flex-col">
                                                                            <span className="text-emerald-900 text-xs font-mono font-bold">
                                                                                Contenedor: {c}
                                                                            </span>
                                                                            <span className="text-[10px] text-emerald-700 font-mono">
                                                                                Pre-Alerta Facturas: {paInvoices.length > 0 ? paInvoices.join(', ') : 'S/N'}
                                                                            </span>
                                                                        </div>
                                                                        <div className="flex flex-col items-center ml-auto gap-1">
                                                                            <div className="flex items-center gap-1 text-[10px] text-emerald-800" title="Validación Contenedor vs PDF">
                                                                                CONT: {isValidContainer ? <CheckCircle className="text-green-600" size={12}/> : <XCircle className="text-red-500" size={12}/>}
                                                                            </div>
                                                                            <div className="flex items-center gap-1 text-[10px] text-emerald-800" title="Validación Facturas ligadas vs PDF">
                                                                                FAC: {hasMatchingInvoice ? <CheckCircle className="text-green-600" size={12}/> : <XCircle className="text-red-500" size={12}/>}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })
                                                        ) : (
                                                            <span className="text-slate-400 text-xs p-2">No se encontraron contenedores en Tracking para estas facturas/BL</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Columna Derecha */}
                                <div className="space-y-6">
                                    {/* Incrementables y Valores */}
                                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                            <ListTree className="text-purple-500" size={18}/> Valores e Incrementables
                                        </h3>
                                        <div className="space-y-2 text-sm">
                                            <div className="flex justify-between p-1.5 rounded"><span className="text-slate-500">Valor Dólares</span><span className="font-bold">${extractedData.cabecera.valor_dolares?.toLocaleString()}</span></div>
                                            <div className="flex justify-between p-1.5 rounded bg-slate-50"><span className="text-slate-500">Valor Aduana</span><span className="font-bold">${extractedData.cabecera.valor_aduana?.toLocaleString()}</span></div>
                                            <div className="flex justify-between p-1.5 rounded"><span className="text-slate-500">Precio Pagado</span><span className="font-bold">${extractedData.cabecera.precio_pagado?.toLocaleString()}</span></div>
                                            <div className="border-t border-slate-100 my-2"></div>
                                            <div className="flex justify-between p-1.5 rounded"><span className="text-slate-500">Fletes</span><span className="font-bold">${extractedData.cabecera.fletes?.toLocaleString()}</span></div>
                                            <div className="flex justify-between p-1.5 rounded bg-slate-50"><span className="text-slate-500">Seguros</span><span className="font-bold">${extractedData.cabecera.seguros?.toLocaleString()}</span></div>
                                            <div className="flex justify-between p-1.5 rounded"><span className="text-slate-500">Embalajes</span><span className="font-bold">${extractedData.cabecera.embalajes?.toLocaleString()}</span></div>
                                            <div className="flex justify-between p-1.5 rounded bg-slate-50"><span className="text-slate-500">Otros</span><span className="font-bold">${extractedData.cabecera.otros_incrementables?.toLocaleString()}</span></div>
                                        </div>
                                    </div>

                                    {/* Tasas */}
                                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                            <FileText className="text-red-500" size={18}/> Tasas a Nivel Pedimento
                                        </h3>
                                        <div className="space-y-2 text-sm">
                                            {extractedData.cabecera.tasas && extractedData.cabecera.tasas.length > 0 ? (
                                                extractedData.cabecera.tasas.map((t: any, i: number) => (
                                                    <div key={i} className="flex justify-between p-1.5 rounded border-b border-slate-100 last:border-0">
                                                        <span className="font-bold text-slate-700">{t.contribucion}</span>
                                                        <span className="text-slate-500">Cve: {t.clave_tasa} &nbsp;|&nbsp; Tasa: {t.tasa}</span>
                                                    </div>
                                                ))
                                            ) : (
                                                <p className="text-slate-500">No se encontraron tasas</p>
                                            )}
                                        </div>
                                    </div>


                                    {/* Cuadro de Liquidación */}
                                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                            <FileText className="text-blue-500" size={18}/> Cuadro de Liquidación y Totales
                                        </h3>
                                        <div className="space-y-2 text-sm">
                                            {extractedData.cabecera.cuadro_liquidacion && extractedData.cabecera.cuadro_liquidacion.length > 0 ? (
                                                extractedData.cabecera.cuadro_liquidacion.map((c: any, i: number) => (
                                                    <div key={i} className="flex justify-between p-1.5 rounded bg-slate-50">
                                                        <span className="text-slate-600 font-bold">
                                                            {c.concepto} 
                                                            {c.forma_pago !== undefined && (
                                                                <span className="ml-2 text-xs font-normal px-2 py-0.5 bg-slate-200 text-slate-500 rounded-full">
                                                                    F.P. {c.forma_pago}
                                                                </span>
                                                            )}
                                                        </span>
                                                        <span className="font-bold text-slate-800">${c.importe?.toLocaleString()}</span>
                                                    </div>
                                                ))
                                            ) : (
                                                <>
                                                    <div className="flex justify-between p-1.5 rounded bg-slate-50"><span className="text-slate-600 font-bold">DTA</span><span className="font-bold text-slate-800">${extractedData.cabecera.dta?.toLocaleString()}</span></div>
                                                    <div className="flex justify-between p-1.5 rounded"><span className="text-slate-600 font-bold">PRV</span><span className="font-bold text-slate-800">${extractedData.cabecera.prv?.toLocaleString()}</span></div>
                                                    <div className="flex justify-between p-1.5 rounded bg-slate-50"><span className="text-slate-600 font-bold">IVA</span><span className="font-bold text-slate-800">${extractedData.cabecera.iva?.toLocaleString()}</span></div>
                                                </>
                                            )}
                                            
                                            <div className="my-2 border-t border-slate-200"></div>
                                            <div className="flex justify-between p-2 rounded bg-slate-800 text-white">
                                                <span className="font-bold">TOTAL EFECTIVO</span>
                                                <span className="font-bold">${(extractedData.cabecera.total_efectivo || extractedData.cabecera.efectivo)?.toLocaleString()}</span>
                                            </div>

                                            {/* Validación DTA (BugFix) */}
                                            {(() => {
                                                const cvePedimento = extractedData.cabecera.cve_pedimento || '';
                                                const dtaTasa = extractedData.cabecera.tasas?.find((t: any) => t.contribucion.includes('DTA'));
                                                const dtaLiq = extractedData.cabecera.cuadro_liquidacion?.find((c: any) => c.concepto === 'DTA');
                                                const actualDTA = dtaLiq ? dtaLiq.importe : (extractedData.cabecera.dta || 0);
                                                
                                                if (dtaTasa) {
                                                    const vAduana = extractedData.cabecera.valor_aduana || 0;
                                                    let expectedDTA = 0;
                                                    let regimen = 'DEFINITIVA';
                                                    let dtaLabel = '8 al millar';
                                                    
                                                    // IMMEX INSUMOS
                                                    if (['IN', 'RT'].includes(cvePedimento)) {
                                                        regimen = 'IMMEX_INSUMOS';
                                                        expectedDTA = 462; // Cuota fija 2026
                                                        dtaLabel = 'Cuota Fija Insumos IMMEX';
                                                    } 
                                                    // IMMEX ACTIVO FIJO
                                                    else if (['AF'].includes(cvePedimento)) {
                                                        regimen = 'IMMEX_ACTIVO_FIJO';
                                                        expectedDTA = Math.round(vAduana * 0.00176); // 1.76 al millar
                                                        dtaLabel = '1.76 al millar Activo Fijo IMMEX';
                                                    }
                                                    // T-MEC Exentos
                                                    else if (actualDTA === 0 || dtaTasa.tasa === 0) {
                                                        regimen = 'TMEC';
                                                        expectedDTA = 0;
                                                        dtaLabel = 'Exento (T-MEC / Tratado)';
                                                    }
                                                    // DEFAULT (8 al millar)
                                                    else {
                                                        expectedDTA = Math.round(vAduana * 0.008);
                                                    }
                                                    
                                                    const diffDTA = actualDTA - expectedDTA;

                                                    return (
                                                        <div className="mt-4 p-3 rounded bg-blue-50 border border-blue-200">
                                                            <div className="flex justify-between mb-1">
                                                                <span className="text-blue-700 font-bold text-xs uppercase" title="Base: Art. 49 LFD">
                                                                    DTA Calculado ({dtaLabel}) - Cve: {cvePedimento}
                                                                </span>
                                                                <span className="font-bold text-blue-800">${expectedDTA.toLocaleString()}</span>
                                                            </div>
                                                            {diffDTA !== 0 ? (
                                                                <div className="text-right text-xs text-red-500 font-bold">Dif: ${diffDTA.toLocaleString()}</div>
                                                            ) : (
                                                                <div className="text-right text-xs text-emerald-600 font-bold mt-1">DTA Correcto ✓</div>
                                                            )}
                                                            <div className="mt-2 text-[10px] text-blue-600/80 leading-tight">
                                                                * Base legal: Art. 49 Ley Federal de Derechos (2026).
                                                                Si es T-MEC, validar certificado de origen.
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            })()}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* PARTIDAS VIEW */}
                    {activeTab === 'PARTIDAS' && (
                        <>
                            {/* Stats */}
                            <div className="grid grid-cols-4 divide-x divide-slate-100 border-b border-slate-100">
                        <div className="p-4 text-center">
                            <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Partidas Pedimento</p>
                            <p className="text-2xl font-bold text-slate-800">{extractedData?.partidas.length}</p>
                        </div>
                        <div className="p-4 text-center">
                            <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Ítems Factura</p>
                            <p className="text-2xl font-bold text-slate-800">{invoiceItems.length}</p>
                        </div>
                        <div className="p-4 text-center">
                            <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Diferencias</p>
                            <p className="text-2xl font-bold text-amber-600">
                                {validationRows.filter(r => r.estado === 'DIFERENCIA').length}
                            </p>
                        </div>
                        <div className="p-4 text-center">
                            <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Sin Match</p>
                            <p className="text-2xl font-bold text-red-600">
                                {validationRows.filter(r => r.estado === 'NO_EN_FACTURA' || r.estado === 'NO_EN_PEDIMENTO').length}
                            </p>
                        </div>
                    </div>

                    {/* Raw JSON Debugger */}
                    {showRawJson && extractedData && (
                        <div className="p-6 bg-slate-900 border-b border-slate-200">
                            <h3 className="text-slate-300 font-bold mb-2">Extractor JSON (Capa A)</h3>
                            <pre className="text-green-400 font-mono text-xs overflow-auto max-h-96">
                                {JSON.stringify(extractedData, null, 2)}
                            </pre>
                        </div>
                    )}

                    {/* Table */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-xs">
                                <tr>
                                    <th className="px-4 py-3">Sec.</th>
                                    <th className="px-4 py-3">Núm. Parte / Desc.</th>
                                    <th className="px-4 py-3">Factura Origen</th>
                                    <th className="px-4 py-3">Fracción / NOM</th>
                                    <th className="px-4 py-3 text-center">Regla 8</th>
                                    <th className="px-4 py-3 text-right">Cant UMC</th>
                                    <th className="px-4 py-3 text-right">Precio Pedimento</th>
                                    <th className="px-4 py-3 text-right">Precio Factura</th>
                                    <th className="px-4 py-3 text-right">Diferencia</th>
                                    <th className="px-4 py-3 text-right">Importe</th>
                                    <th className="px-4 py-3">Estado</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {validationRows.map((row, i) => (
                                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3 text-slate-500">{row.secuencia}</td>
                                        <td className="px-4 py-3 font-medium text-slate-800">
                                            <div className="font-bold">{row.partNoPedimento}</div>
                                            <div className="text-xs text-slate-500 max-w-[150px] truncate" title={row.descripcion || ''}>{row.descripcion}</div>
                                        </td>
                                        <td className="px-4 py-3 text-slate-500 font-mono text-xs">{row.facturaOrigen || '-'}</td>
                                        <td className="px-4 py-3 text-slate-600">
                                            <div>{row.fraccion}</div>
                                            {row.nomAplicable && <div className="text-[10px] bg-slate-100 text-slate-600 px-1 py-0.5 mt-1 rounded inline-block">{row.nomAplicable}</div>}
                                        </td>
                                        <td className="px-4 py-3 text-xs text-indigo-600 font-mono text-center">
                                            {row.permisoR8 || <span className="text-slate-300">—</span>}
                                        </td>
                                        <td className="px-4 py-3 text-right font-medium">{row.cantUmc}</td>
                                        <td className="px-4 py-3 text-right text-blue-600">${row.precioPedimento.toFixed(5)}</td>
                                        <td className="px-4 py-3 text-right text-slate-600">
                                            {row.precioFactura !== null ? `$${row.precioFactura.toFixed(4)}` : '—'}
                                        </td>
                                        <td className={`px-4 py-3 text-right font-bold ${row.diferencia && Math.abs(row.diferencia) > 0.01 ? 'text-red-500' : 'text-slate-400'}`}>
                                            {row.diferencia !== null ? `$${row.diferencia.toFixed(4)}` : '—'}
                                        </td>
                                        <td className="px-4 py-3 text-right font-medium text-slate-700">
                                            {row.importe ? `$${parseFloat(row.importe).toLocaleString()}` : '—'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 rounded text-xs font-bold border ${getStatusStyle(row.estado)}`}>
                                                {row.estado.replace(/_/g, ' ')}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

