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

    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [savedReports, setSavedReports] = useState<DataStageReport[]>([]);
    const hiddenInputRef = useRef<HTMLInputElement>(null);
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

    const handleFileSelect = async (files: FileList | File[] | File) => {
        if (!files) return;

        // CRITICAL FIX: Normalize input to File[]
        let fileArray: File[] = [];
        if (files instanceof FileList) {
            fileArray = Array.from(files);
        } else if (files instanceof File) {
            fileArray = [files];
        } else if (Array.isArray(files)) {
            fileArray = files;
        }

        if (fileArray.length === 0) return;

        // Validation for single file overwrite
        if (fileArray.length === 1 && currentFileName && currentFileName === fileArray[0].name) {
            if (!window.confirm(`⚠️ EL ARCHIVO "${fileArray[0].name}" YA ESTÁ VISIBLE.\n\n¿Deseas recargarlo?`)) return;
        }

        setLoading(true);
        setError(null);
        setSaveStatus("Cargando Vista Previa (Local)...");

        try {
            // STEP 1: DECOMPRESS & VALIDATE (Sequential for Safety)
            const allRecords: PedimentoRecord[] = [];
            const allRawFiles: RawFileParsed[] = [];
            let processedCount = 0;

            for (const file of fileArray) {
                processedCount++;
                setSaveStatus("Validando y Descomprimiendo...");
                await new Promise(r => setTimeout(r, 10)); // Yield

                try {
                    const result = await processZipFile(file, (current, total) => {
                        // Granular UI Feedback
                        setSaveStatus(`Validando: ${current} de ${total} archivos...`);
                    });

                    if (result && (result.records.length > 0 || result.rawFiles.length > 0)) {
                        allRecords.push(...result.records);
                        allRawFiles.push(...result.rawFiles);
                    } else {
                        throw new Error(`El archivo ${file.name} no contiene datos válidos.`);
                    }
                } catch (e: any) {
                    throw new Error(`VALIDACIÓN FALLIDA en ${file.name}: ${e.message}`);
                }
            }

            if (allRecords.length === 0) {
                throw new Error("No se encontraron registros válidos para procesar.");
            }

            // 1. Deduplicate New Records internally
            const recordMap = new Map<string, PedimentoRecord>();
            allRecords.forEach(r => recordMap.set(r.id, r));
            const newBatchUnique = Array.from(recordMap.values());

            const fileName = fileArray.length === 1 ? fileArray[0].name : `Lote de ${fileArray.length}`;

            // 2. ACCUMULATE: Merge with existing data (PRE-CALCULATE for Draft Save)
            // Fix: We must save the COMBINED state to draft, not just the new batch.

            const combinedRecordsMap = new Map<string, PedimentoRecord>();
            // Add old records first (from current state 'data')
            if (data) {
                data.forEach(r => combinedRecordsMap.set(r.id, r));
            }
            // Overwrite/Add new records
            newBatchUnique.forEach(r => combinedRecordsMap.set(r.id, r));
            const finalCombinedRecords = Array.from(combinedRecordsMap.values());

            // Merge Raw Files
            const existingFileNames = new Set(rawFiles.map(f => f.fileName));
            const newFiles = allRawFiles.filter(f => !existingFileNames.has(f.fileName));
            const finalRawFiles = [...rawFiles, ...newFiles];

            // 3. Update State
            setData(finalCombinedRecords);
            setRawFiles(finalRawFiles);

            setCurrentFileName(prev => {
                // If accumulating, switch to clean Summary Name immediately.
                if (prev) {
                    return `Auditoría Mensual - ${new Date().toLocaleDateString()} (${new Date().toLocaleTimeString()})`;
                }
                return fileName;
            });

            if (fileArray.length > 0) {
                setPendingFile(fileArray[0]);
            }

            setSaveStatus("");

            // Background draft (Save the FULL STATE)
            storageService.saveDraftDataStage({
                records: finalCombinedRecords,
                rawFiles: finalRawFiles,
                fileName: fileName, // Or summary name? Keep last filename for context or update? Keep simple.
                timestamp: new Date().toISOString()
            }).catch(console.warn);

        } catch (err: any) {
            console.error(err);
            setSaveStatus("");
            setError(err.message);
            alert(`⛔ ERROR:\n\n${err.message}`);
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

            // 2. Sync Customs Records (Optimized Batch)
            let result = await storageService.batchSyncDataStage(data);

            // Check for Force Sync scenario
            if (result.added === 0 && result.skipped > 0) {
                const force = window.confirm(
                    `⚠️ DUPLICADOS DETECTADOS\n\n` +
                    `Se encontraron ${result.skipped} registros que YA existen en tu equipo.\n` +
                    `¿Deseas FORZAR el envío a la Nube? (Útil si no aparecen en otros dispositivos).`
                );

                if (force) {
                    setSaveStatus("Forzando Sincronización...");
                    result = await storageService.batchSyncDataStage(data, { force: true });
                }
            }

            const { added, updated, skipped, cloudStatus, errorMsg } = result;

            if (cloudStatus === 'failed') {
                alert(
                    `⚠️ GUARDADO PARCIAL (SOLO LOCAL)\n\n` +
                    `Se procesaron ${added + (updated || 0)} registros, pero FALLÓ la sincronización con la Nube.\n` +
                    `Error: ${errorMsg}\n\n` +
                    `Tus datos NO serán visibles para otros usuarios hasta que se restablezca la conexión.`
                );
            } else {
                let msg = `✅ Sincronización Completada:\n\n`;
                if (added > 0) msg += `- ${added} nuevos registros.\n`;
                if (updated && updated > 0) msg += `- ${updated} registros actualizados/sincronizados.\n`;
                if (skipped > 0) msg += `- ${skipped} duplicados omitidos.\n`;
                msg += `- ${supplierCount} proveedores verificados.`;

                alert(msg);
            }
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

            // 2. SAVE REPORT TO DB (Interpreted JSON Data)
            setSaveStatus("Guardando Datos Interpretados...");

            // Enforce 30s Timeout
            const savePromise = storageService.saveDataStageReport(report);
            const timeoutPromise = new Promise<boolean>((_, reject) =>
                setTimeout(() => reject(new Error("Tiempo agotado (30s) al guardar. Verifica tu conexión.")), 30000)
            );

            const success = await Promise.race([savePromise, timeoutPromise]);

            setSaveStatus("Finalizando...");
            setLoading(false);
            setSaveStatus("");

            setPendingFile(null);
            alert(existingReport ? "✅ Reporte actualizado." : "✅ Datos guardados correctamente.");
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

                // Check if it's a "Pointer" report
                // Case A: Storage URL (Legacy or Specific Cases)
                if (report.records.length === 0 && report.storageUrl) {
                    // preserving legacy for safety, but primary path is now DB
                    try {
                        console.log("Downloading full report from Storage (Legacy)...");
                        const response = await fetch(report.storageUrl);
                        if (!response.ok) throw new Error("Error fetching storage file");
                        const blob = await response.blob();
                        // ... simple json parse for legacy compatibility
                        const text = await blob.text(); // Assuming legacy JSON
                        const fullReport = JSON.parse(text);
                        finalRecords = fullReport.records;
                        finalRawFiles = fullReport.rawFiles;
                    } catch (err) {
                        console.error("Legacy Storage load failed", err);
                        alert("Error al descargar el reporte completo del servidor (legado).");
                        setLoading(false);
                        return;
                    }
                }
                // Case B: Batched DB Records (New System)
                else if (report.records.length === 0 && !report.storageUrl) {
                    console.log("Loading batched records from Firestore Subcollection...");
                    const { collection, getDocs } = await import('firebase/firestore');
                    const { db } = await import('../services/firebaseConfig');

                    if (db) {
                        const itemsRef = collection(db, 'dataStageReports', report.id, 'items');
                        const snapshot = await getDocs(itemsRef);
                        if (!snapshot.empty) {
                            finalRecords = snapshot.docs.map(d => d.data() as any);
                            console.log(`Loaded ${finalRecords.length} records from DB.`);
                        } else {
                            console.warn("No records found in subcollection.");
                        }
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
                        : pendingFile
                            ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 animate-pulse'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                        }`}
                >
                    <Save className="w-4 h-4" />
                    {pendingFile ? "☁️ Subir y Guardar (Pendiente)" : "Guardar en Historial"}
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
                        <h3 className="text-xl font-bold text-slate-800">{saveStatus || "Procesando Nuevo Archivo..."}</h3>
                        <p className="text-slate-500">Por favor espera, no cierres la ventana.</p>
                    </div>
                )}
                {/* Always Show Dashboard, even if empty */}
                <DataStageDashboard data={data || []} rawFiles={rawFiles} onSync={handleSync} />
            </div>
        </div >
    );
};