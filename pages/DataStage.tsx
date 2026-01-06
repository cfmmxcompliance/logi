import React, { useState, useEffect, useRef } from 'react';
import FileUpload from '../components/datastage/FileUpload.tsx';
import DataStageDashboard from '../components/datastage/DataStageDashboard.tsx';
import { processZipFile } from '../services/parser.ts';
import { PedimentoRecord, RawFileParsed, DataStageReport } from '../types.ts';
import { RefreshCcw, Save, Archive, Trash2, Calendar, FileText, ChevronRight, Loader2 } from 'lucide-react';
import { storageService } from '../services/storageService.ts';

export const DataStage = () => {
    const [data, setData] = useState<PedimentoRecord[] | null>(null);
    const [rawFiles, setRawFiles] = useState<RawFileParsed[]>([]);
    const [currentFileName, setCurrentFileName] = useState<string>('');

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [savedReports, setSavedReports] = useState<DataStageReport[]>([]);
    const hiddenInputRef = useRef<HTMLInputElement>(null);
    const [saving, setSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<string>(""); // Granular status message

    useEffect(() => {
        // 1. Load Saved Reports (History)
        setSavedReports(storageService.getDataStageReports());
        const unsub = storageService.subscribe(() => {
            setSavedReports(storageService.getDataStageReports());
        });

        // 2. Load Draft Session (Persistence active view) - ASYNC NOW
        const loadDraft = async () => {
            try {
                const draft = await storageService.getDraftDataStage();
                if (draft && draft.records.length > 0) {
                    setData(draft.records);
                    setRawFiles(draft.rawFiles);
                    setCurrentFileName(draft.fileName);
                }
            } catch (e) {
                console.error("Error loading draft", e);
            }
        };
        loadDraft();

        return unsub;
    }, []);

    const handleFileSelect = async (files: FileList | File[]) => {
        if (!files || files.length === 0) return;

        const fileArray = Array.from(files);
        const fileName = fileArray.length === 1 ? fileArray[0].name : `Lote de ${fileArray.length} Archivos`;

        // Validation for single file overwrite (only if we have 1 file and context is set)
        if (fileArray.length === 1 && currentFileName && currentFileName === fileArray[0].name) {
            const confirmReload = window.confirm(
                `⚠️ ARCHIVO EN USO\n\n` +
                `El archivo "${fileArray[0].name}" es el que estás visualizando actualmente.\n` +
                `¿Deseas recargarlo y reiniciar la visualización?`
            );
            if (!confirmReload) return;
        }

        // New Feature: Duplicate Check against History
        const duplicates = fileArray.filter(f =>
            savedReports.some(r => r.name === f.name) // Checks if report name matches file name
        );

        if (duplicates.length > 0) {
            const duplicateNames = duplicates.map(d => d.name).join(', ');
            if (!window.confirm(`⚠️ ARCHIVO EXISTENTE\n\nLos siguientes archivos ya existen en el historial:\n${duplicateNames}\n\n¿Deseas SOBRESCRIBIRLOS?\n(Se eliminará la versión anterior y se guardará la nueva)`)) {
                setLoading(false);
                if (hiddenInputRef.current) hiddenInputRef.current.value = '';
                return; // "Se para la ejecución"
            }

            // "Se rescribe" -> Delete old reports before processing new ones
            console.log("Overwriting duplicates...");
            const duplicateIds = savedReports
                .filter(r => duplicates.some(d => d.name === r.name))
                .map(r => r.id);

            for (const id of duplicateIds) {
                await storageService.deleteDataStageReport(id);
            }
        }

        setLoading(true);
        setError(null);

        try {
            const allRecords: PedimentoRecord[] = [];
            const allRawFiles: RawFileParsed[] = [];
            const processedFilesStats = { count: 0 };

            // Process sequentially to be safe
            for (const file of fileArray) {
                try {
                    const result = await processZipFile(file);
                    if (result.records.length > 0 || result.rawFiles.length > 0) {
                        allRecords.push(...result.records);
                        allRawFiles.push(...result.rawFiles);
                        processedFilesStats.count++;
                    }
                } catch (err) {
                    console.error(`Error processing file ${file.name}:`, err);
                    // Continue with other files
                }
            }

            if (allRecords.length === 0 && allRawFiles.length === 0) {
                setError("No se encontraron registros válidos ni archivos de texto en los ZIPs seleccionados.");
            } else {
                // Merge Records (deduplicate by ID if necessary, for now simple concat is likely fine but map is safer)
                const recordMap = new Map<string, PedimentoRecord>();
                // Existing data? If user wants to APPEND, we should check. But usually "Upload" means "New Session".
                // User said "Cargar 1 o varios", usually implies a new load.
                // Assuming replace current view with this batch.

                allRecords.forEach(r => recordMap.set(r.id, r));
                const uniqueRecords = Array.from(recordMap.values());

                // Merge Raw Files (deduplicate by code/filename)
                const uniqueRawFiles = allRawFiles; // Raw files usually distinct by zip content

                setData(uniqueRecords);
                setRawFiles(uniqueRawFiles);
                setCurrentFileName(fileName);

                // Auto-save draft (Async)
                setSaving(true);
                await storageService.saveDraftDataStage({
                    records: uniqueRecords,
                    rawFiles: uniqueRawFiles,
                    fileName: fileName,
                    timestamp: new Date().toISOString()
                });

                // Auto-save Report to History
                try {
                    const reportId = crypto.randomUUID();
                    const report: DataStageReport = {
                        id: reportId,
                        name: fileName, // Auto-name using file name
                        timestamp: new Date().toISOString(),
                        records: uniqueRecords,
                        rawFiles: uniqueRawFiles,
                        stats: {
                            filesProcessed: uniqueRawFiles.length,
                            pedimentosCount: uniqueRecords.length,
                            itemsCount: uniqueRecords.reduce((acc, curr) => acc + curr.items.length, 0),
                            invoicesCount: uniqueRecords.reduce((acc, curr) => acc + curr.invoices.length, 0)
                        }
                    };
                    const reportSaved = await storageService.saveDataStageReport(report);

                    if (reportSaved) {
                        if (uniqueRecords.length > 0) {
                            alert(`✅ ÉXITO\n\nArchivo(s) procesado(s) y guardado(s) correctamente.\n\n- ${uniqueRecords.length} Pedimentos encontrados.\n- Reporte guardado en historial.`);
                        } else {
                            alert(`⚠️ PROCESO INCOMPLETO\n\nSe leyeron los archivos pero NO se encontraron pedimentos válidos.\n\n- Verifica que el archivo ZIP contenga los TXT/M3 correctos.\n- Se guardó el registro de la lectura en el historial.`);
                        }
                    } else {
                        alert(`⚠️ AVISO\n\nLos archivos se procesaron pero hubo un problema al guardar en el historial (posiblemente por tamaño).\n\nLos datos están visibles en pantalla, pero verifica tu conexión.`);
                    }
                } catch (autoSaveErr) {
                    console.error("Auto-save report failed", autoSaveErr);
                    alert(`⚠️ AVISO DE GUARDADO\n\nNo se pudo guardar automáticamente en el historial: ${autoSaveErr instanceof Error ? autoSaveErr.message : 'Error desconocido'}`);
                }

                setSaving(false);
            }
        } catch (err) {
            console.error(err);
            const errorMsg = err instanceof Error ? err.message : "Error desconocido al procesar archivos.";
            setError(errorMsg);
            alert(`❌ ERROR\n\nNo se pudieron procesar los archivos:\n${errorMsg}`);
        } finally {
            setLoading(false);
        }
    };

    const handleReset = async () => {
        if (window.confirm("¿Estás seguro de cerrar la vista actual? Esto borrará la sesión activa (pero no los reportes guardados en el historial).")) {
            setLoading(true);
            try {
                await storageService.clearDraftDataStage();
                setData(null);
                setRawFiles([]);
                setCurrentFileName('');
                setError(null);
            } catch (e) {
                console.error("Error clearing draft", e);
            } finally {
                setLoading(false);
            }
        }
    };

    const handleSync = async () => {
        if (!data || data.length === 0) return;

        if (!window.confirm(`¿Estás seguro de sincronizar ${data.length} operaciones con la base de datos central? Esto actualizará o creará registros de Aduanas y Proveedores.`)) {
            return;
        }

        setLoading(true);
        try {
            let supplierCount = 0;
            let customsCount = 0;

            // 1. Sync Suppliers (Client-side Deduplication)
            const uniqueSuppliers = new Map<string, string>(); // Name -> Address
            data.forEach(p => {
                p.invoices.forEach(inv => {
                    if (inv.proveedor && !uniqueSuppliers.has(inv.proveedor)) {
                        uniqueSuppliers.set(inv.proveedor, inv.proveedorCalle || '');
                    }
                });
            });

            // Get existing suppliers from Local State to avoid duplicates
            const existingSuppliers = storageService.getLocalState().suppliers || [];
            const existingMap = new Map(existingSuppliers.map((s: any) => [s.name.toLowerCase().trim(), s]));

            for (const [name, address] of uniqueSuppliers.entries()) {
                const normalizedKey = name.toLowerCase().trim();

                if (existingMap.has(normalizedKey)) {
                    // Already exists. Optional: Update address if missing?
                    // For now, we skip to prevent "Duplicate ID" or overwriting with less data.
                    console.log(`Supplier '${name}' already exists. Skipping.`);
                    continue;
                }

                await storageService.updateSupplier({
                    id: crypto.randomUUID(),
                    name: name,
                    type: 'Other',
                    contactName: 'Imported from DataStage',
                    email: '',
                    phone: '',
                    country: 'MX',
                    status: 'Active',
                    // TODO: Add address if model supports it
                });
                supplierCount++;
            }

            // Re-evaluating Supplier Sync: It's risky without deduplication by Name.
            // Implemented a safer "Check existence by Name" loop would be slow.
            // Let's stick to the high-value target: CUSTOMS OPERATIONS (Pedimentos).

            // 2. Sync Customs Records
            for (const record of data) {
                // Check if exists by Pedimento? 
                // storageService doesn't have "getByPedimento".
                // We'll create new records or update if we can find them.
                // For now, let's create new records with a specific ID strategy or random?
                // Use Pedimento Number as ID? No, IDs are UUIDs.
                // Let's just create them. User can dedupe or we assume they are new/updates.

                // Map PedimentoRecord -> CustomsClearanceRecord
                const newRec = {
                    id: crypto.randomUUID(),
                    blNo: '', // Not linked to BL yet? Or try to find BL?
                    // If we have "consignee" or "ref" in file?
                    containerNo: 'Multiple',
                    ataPort: '',
                    pedimentoNo: record.pedimento,
                    proformaRevisionBy: 'DataStage',
                    targetReviewDate: '',
                    proformaSentDate: '',
                    pedimentoAuthorizedDate: record.fechaPago, // Fecha Pago -> Authorized
                    peceRequestDate: '',
                    peceAuthDate: '',
                    pedimentoPaymentDate: record.fechaPago,
                    truckAppointmentDate: '',
                    ataFactory: '',
                    eirDate: ''
                };

                // Try to find matching BL from "Referencias" if available? 
                // data-stage logic doesn't currently extract BLs reliably from M3 logic unless "Referencia" field is mapped.
                // Let's just save valid Pedimento records.
                await storageService.updateCustomsClearance(newRec);
                customsCount++;
            }

            alert(`✅ Sincronización Completada:\n- ${customsCount} operaciones de aduanas registradas/actualizadas.`);
        } catch (e) {
            console.error(e);
            alert("❌ Error al sincronizar con la base de datos.");
        } finally {
            setLoading(false);
        }
    };

    const handleSaveReport = async () => {
        if (!data || !currentFileName) return;

        const defaultName = currentFileName.replace(/\.zip$/i, '');
        const reportName = prompt("Nombre para este reporte:", defaultName);

        if (!reportName) return;

        // Check if we are overwriting based on chosen name
        const existingReport = savedReports.find(r => r.name.toLowerCase() === reportName.toLowerCase());
        let reportId = crypto.randomUUID();

        if (existingReport) {
            const confirmOverwrite = window.confirm(
                `⚠️ YA EXISTE UN REPORTE LLAMADO "${reportName}"\n\n` +
                `¿Deseas SOBRESCRIBIR la información anterior con estos nuevos datos?`
            );
            if (!confirmOverwrite) return;

            reportId = existingReport.id; // Reuse ID to overwrite
        }

        const report: DataStageReport = {
            id: reportId,
            name: reportName,
            timestamp: new Date().toISOString(),
            records: data,
            rawFiles: rawFiles,
            stats: {
                filesProcessed: rawFiles.length,
                pedimentosCount: data.length,
                itemsCount: data.reduce((acc, curr) => acc + curr.items.length, 0),
                invoicesCount: data.reduce((acc, curr) => acc + curr.invoices.length, 0)
            }
        };

        try {
            setLoading(true);
            setSaveStatus("Preparando datos...");

            // Artificial delay for UX "dynamics" so user sees the step
            await new Promise(r => setTimeout(r, 500));

            setSaveStatus("Sincronizando con la Nube...");
            const success = await storageService.saveDataStageReport(report);

            setSaveStatus("Finalizando...");
            setLoading(false);
            setSaveStatus("");

            if (success) {
                alert(existingReport ? "✅ Reporte actualizado correctamente." : "✅ Reporte guardado en el historial.");
            } else {
                throw new Error("La operación de guardado retornó falso.");
            }
        } catch (e) {
            setLoading(false);
            setSaveStatus("");
            console.error("Save Error:", e);
            alert("❌ Error al guardar el reporte: " + (e instanceof Error ? e.message : "Error desconocido o límite de tamaño excedido. Intenta con menos archivos."));
        }
    };

    const loadReport = async (report: DataStageReport) => {
        if (window.confirm(`¿Cargar visualización del reporte "${report.name}"?`)) {
            setLoading(true);
            try {
                let finalRecords = report.records;
                let finalRawFiles = report.rawFiles;

                // Check if it's a "Pointer" report (Big Data in Storage)
                if (report.records.length === 0 && report.storageUrl) {
                    try {
                        const response = await fetch(report.storageUrl);
                        if (!response.ok) throw new Error("Error fetching storage file");
                        const fullReport = await response.json() as DataStageReport;
                        finalRecords = fullReport.records;
                        finalRawFiles = fullReport.rawFiles;
                    } catch (fetchErr) {
                        console.error("Error fetching full report from storage", fetchErr);
                        alert("Error al descargar el reporte completo del servidor.");
                        setLoading(false);
                        return;
                    }
                }

                setData(finalRecords);
                setRawFiles(finalRawFiles);
                setCurrentFileName(report.name);

                // Also update current session draft so it persists if page reloads
                await storageService.saveDraftDataStage({
                    records: finalRecords,
                    rawFiles: finalRawFiles,
                    fileName: report.name,
                    timestamp: new Date().toISOString()
                });
            } catch (e) {
                console.error(e);
                alert("Error cargando reporte.");
            } finally {
                setLoading(false);
            }
        }
    };

    const deleteReport = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (window.confirm("¿Estás seguro de eliminar este reporte del historial permanentemente?")) {
            await storageService.deleteDataStageReport(id);
        }
    };

    return (
        <div className="space-y-6 relative">
            <div>
                <h1 className="text-2xl font-bold text-slate-800">Data Stage (Aduanas)</h1>
                <p className="text-slate-500">Procesamiento y análisis de archivos M3 del SAT/VUCEM.</p>
            </div>
            <div className="flex gap-2">
                <input
                    type="file"
                    ref={hiddenInputRef}
                    className="hidden"
                    accept=".zip"
                    multiple
                    onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0) {
                            handleFileSelect(e.target.files);
                        }
                        e.target.value = ''; // Reset input to allow selecting same file
                    }}
                />
                <button
                    onClick={handleSaveReport}
                    disabled={!data || data.length === 0}
                    className={`text-sm border px-3 py-2 rounded-lg flex items-center gap-2 transition-colors font-medium ${(!data || data.length === 0)
                        ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                        }`}
                >
                    <Save className="w-4 h-4" />
                    Guardar en Historial
                </button>
                <button
                    onClick={() => hiddenInputRef.current?.click()}
                    className="text-sm text-slate-500 hover:text-blue-600 bg-white border border-slate-200 hover:bg-blue-50 px-3 py-2 rounded-lg flex items-center gap-2 transition-colors"
                    title="Cargar un nuevo archivo"
                >
                    <RefreshCcw className="w-4 h-4" />
                    {data && data.length > 0 ? 'Cargar Otro Archivo' : 'Cargar Archivo'}
                </button>
                {(data && data.length > 0) && (
                    <button
                        onClick={handleReset}
                        className="text-sm text-red-500 hover:text-red-700 bg-white border border-red-200 hover:bg-red-50 px-3 py-2 rounded-lg flex items-center gap-2 transition-colors"
                        title="Limpiar vista"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                )}
            </div>

            <div className="relative">
                {loading && (
                    <div className="absolute inset-0 z-50 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center rounded-xl">
                        <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
                        <h3 className="text-xl font-bold text-slate-800">Procesando Nuevo Archivo...</h3>
                        <p className="text-slate-500">Actualizando dashboard y resumen</p>
                    </div>
                )}
                {/* Always Show Dashboard, even if empty */}
                <DataStageDashboard data={data || []} rawFiles={rawFiles} onSync={handleSync} />
            </div>
        </div >
    );
};