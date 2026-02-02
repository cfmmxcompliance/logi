import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { FolderOpen, Search, Download, ExternalLink, RefreshCw, FileText, CheckCircle2, Clock, AlertCircle, FileSpreadsheet, Zap, Trash2 } from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { storageService } from '../services/storageService';
import { DataStageReport, PedimentoRecord } from '../types';
import { useVucem } from '../context/VucemContext';
import { vucemAutomation } from '../services/vucem/vucemAutomation';
import { VucemConfig } from '../services/vucem/types';
import { Link2 } from 'lucide-react';

interface DossierItem {
    name: string;
    url: string;
    driveId: string;
    createdAt: string;
}

interface Dossier {
    id: string;
    numPedimento: string;
    items: DossierItem[];
    lastUpdate: string;
    status?: 'Complete' | 'Incomplete' | 'Empty';
}

interface Props {
    setActiveTab: (tab: string) => void;
}

export const ExpedienteElectronico: React.FC<Props> = ({ setActiveTab }) => {
    const [dossiers, setDossiers] = useState<Dossier[]>([]);
    const [reports, setReports] = useState<DataStageReport[]>([]);
    const [selectedReportId, setSelectedReportId] = useState<string>('');
    const { config, isConfigured, connectionStatus, testConnection, logout, lastError } = useVucem();
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [syncing, setSyncing] = useState(false);
    const [syncStats, setSyncStats] = useState({ current: 0, total: 0, status: '' });
    const [reprocessingId, setReprocessingId] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Discovery Mode State
    const [syncMode, setSyncMode] = useState<'report' | 'date'>('report');
    const [dateRange, setDateRange] = useState({ start: '', end: '' });

    useEffect(() => {
        // Fetch Dossiers from Firestore
        const q = query(collection(db, 'electronic_dossiers'), orderBy('lastUpdate', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Dossier[];
            setDossiers(data);
            setLoading(false);
        });

        // Fetch Data Stage Reports from storageService
        setReports(storageService.getDataStageReports());
        const unsubReports = storageService.subscribe(() => {
            setReports(storageService.getDataStageReports());
        });

        return () => {
            unsubscribe();
            unsubReports();
        };
    }, []);

    const filteredDossiers = dossiers
        .filter(d => {
            if (!searchTerm.trim()) return true;
            const searchTerms = searchTerm.toLowerCase().split(',').map(t => t.trim()).filter(t => t);

            const pedNo = (d.numPedimento || "").toLowerCase();
            const financials = (d as any).financials || {};
            const supplier = (financials.supplierName || "").toLowerCase();
            const importer = (financials.importerName || "").toLowerCase();
            const bank = (financials.banco || "").toLowerCase();
            const lc = (financials.lineaCaptura || "").toLowerCase();

            return searchTerms.some(term => {
                return pedNo.includes(term) ||
                    supplier.includes(term) ||
                    importer.includes(term) ||
                    bank.includes(term) ||
                    lc.includes(term);
            });
        })
        .sort((a, b) => {
            if (a.numPedimento.includes('POR_CLASIFICAR') && !b.numPedimento.includes('POR_CLASIFICAR')) return 1;
            if (!a.numPedimento.includes('POR_CLASIFICAR') && b.numPedimento.includes('POR_CLASIFICAR')) return -1;
            return a.numPedimento.localeCompare(b.numPedimento);
        });

    const handleSyncSelectedReport = async () => {
        if (!selectedReportId || !config) return;
        const report = reports.find(r => r.id === selectedReportId);
        if (!report) return;

        setSyncing(true);
        let records = report.records;

        // Hydration check for pointer reports
        if (records.length === 0) {
            alert("Este reporte requiere hidratación. Por favor cárgalo primero en el módulo de Data Stage (o espera a que cargue del servidor).");
            setSyncing(false);
            return;
        }

        setSyncStats({ current: 0, total: records.length, status: 'Iniciando...' });

        for (let i = 0; i < records.length; i++) {
            const pedimento = records[i];
            setSyncStats(s => ({ ...s, current: i + 1, status: `Procesando ${pedimento.pedimento}...` }));

            try {
                await vucemAutomation.syncPedimentoToDrive(pedimento, config, (msg: string) => {
                    setSyncStats(s => ({ ...s, status: msg }));
                });
            } catch (err) {
                console.error(`Error syncing pedimento ${pedimento.pedimento}:`, err);
            }
        }

        setSyncing(false);
        setSyncStats(s => ({ ...s, status: 'Completado' }));
        alert(`Sincronización finalizada. Revisa tu Google Drive.`);
    };

    const handleSyncDateRange = async () => {
        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);
        const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays > 31) {
            alert("⚠️ Límite Excedido: VUCEM solo permite consultas de hasta 31 días por vez para evitar saturación del servicio. Por favor ajusta tu rango.");
            setSyncing(false);
            return;
        }

        setSyncStats({ current: 0, total: 0, status: 'Consultando VUCEM...' });

        try {
            await vucemAutomation.syncDateRangeToDrive(dateRange.start, dateRange.end, config, (msg: string) => {
                setSyncStats(s => ({ ...s, status: msg }));
            });
            alert("Sincronización por rango de fechas completada.");
        } catch (err: any) {
            console.error("Error syncing date range:", err);
            alert("Error durante la sincronización: " + (err.message || "Error desconocido"));
        } finally {
            setSyncing(false);
            setSyncStats(s => ({ ...s, status: 'Completado' }));
        }
    };

    const robustParseDate = (dateStr: string) => {
        if (!dateStr || typeof dateStr !== 'string') return null;
        const clean = dateStr.trim();
        if (!clean) return null;

        // Caso 1: YYYY-MM-DD (Evitar desfase de zona horaria)
        if (/^\d{4}-\d{2}-\d{2}/.test(clean)) {
            const [y, m, d] = clean.split('T')[0].split('-').map(Number);
            return new Date(y, m - 1, d);
        }

        // Caso 2: DD/MM/YYYY
        if (/^\d{2}\/\d{2}\/\d{4}/.test(clean)) {
            const [d, m, y] = clean.split(' ')[0].split('/').map(Number);
            return new Date(y, m - 1, d);
        }

        const d = new Date(clean);
        return isNaN(d.getTime()) ? null : d;
    };

    const formatDateMMDDYYYY = (dateStr: string) => {
        const d = robustParseDate(dateStr);
        if (!d) return dateStr || "";
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${mm}/${dd}/${yyyy}`;
    };

    const formatDateYYYYMMDD = (dateStr: string) => {
        const d = robustParseDate(dateStr);
        if (!d) return dateStr || "";
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    };

    const handleFinancialExport = async () => {
        if (dossiers.length === 0) {
            alert("No hay expedientes para exportar");
            return;
        }

        try {
            const XLSX = await import('xlsx');

            // 1. DEDUPLICAR por Numero de Pedimento antes de exportar
            // Esto evita que si hay registros duplicados en Firestore/LocalState, salgan doble en el Excel
            const uniqueDossierMap = new Map<string, any>();

            dossiers.forEach(d => {
                const pedNo = d.numPedimento?.replace(/\s+/g, '') || "SIN_PEDIMENTO";

                // Omitir "POR_CLASIFICAR" del reporte financiero ya que no tienen impuestos válidos/completos
                if (pedNo.includes('POR_CLASIFICAR')) return;

                // Si ya existe, preferimos el que tenga más datos (status Complete o financials)
                const existing = uniqueDossierMap.get(pedNo);
                if (!existing || (!existing.financials && d.financials)) {
                    uniqueDossierMap.set(pedNo, d);
                }
            });

            const dataToExport = Array.from(uniqueDossierMap.values()).map(d => {
                const fins = (d as any).financials || {};
                const fixedAssets = d.isFixedAsset || (d.numPedimento?.startsWith("24") || fins.clavePedimento === "AF") ? "Yes" : "No";

                // Ensure 15 digits for audit and format with spaces if requested
                let fullPed = fins.pedimentoNum || d.numPedimento || "";
                if (fullPed.length === 7) fullPed = `26163471${fullPed}`;

                // Format: "26  16  3471  8001234"
                let formattedPed = fullPed;
                if (fullPed.length === 15) {
                    formattedPed = `${fullPed.slice(0, 2)}  ${fullPed.slice(2, 4)}  ${fullPed.slice(4, 8)}  ${fullPed.slice(8)}`;
                }

                return {
                    "Pedimento Number": formattedPed,
                    "Monto Pagado": fins.montoPagado || 0,
                    "Referencia Ampliada": fins.lineaCaptura || "",
                    "Fiscal ID": fins.supplierTaxId || "",
                    "Supplier Name": fins.supplierName || "",
                    "Country": fins.supplierCountry || "",
                    "Fixed Assets (Yes/No)": fixedAssets,
                    "Merchandise Custom Value": fins.valorAduana || 0,
                    "Prevalidation VAT": fins.ivaPrv || 0,
                    "Import VAT": fins.iva || 0,
                    "Prevalidation (PRV)": fins.prv || 0,
                    "Custom Duties (DTA)": fins.dta || 0,
                    "General Custom Tax (IGI)": fins.igi || 0,
                    "Fee (CNT)": fins.cnt || 0,
                    "Payed - Pedimento": fins.montoPagado || 0,
                    "Payment Date": formatDateMMDDYYYY(fins.fechaPago),
                    "Entry Date": formatDateYYYYMMDD(fins.fechaEntrada),
                    "OTROS": fins.otrosCargos || 0,
                    "DIFERENCIA": 0,
                    "CLAVE": fins.clavePedimento || "",
                    "Bank Name": fins.banco || ""
                };
            });

            const worksheet = XLSX.utils.json_to_sheet(dataToExport);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Financials");
            const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
            const blob = new Blob([wbout], { type: 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `VUCEM_Financial_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (e) {
            console.error("Export Error", e);
            alert("Error al generar Excel: " + e);
        }
    };

    const handleCSVExport = () => {
        if (dossiers.length === 0) {
            alert("No hay datos para exportar");
            return;
        }

        try {
            // 1. Headers (Exactly what the user needs for traceability)
            const headers = [
                'PEDIMENTO', 'DOCS DETECTADOS', 'ESTATUS', 'ULTIMA ACTUALIZACION',
                'MONTO PAGADO', 'LC', 'RFC PROVEEDOR', 'NOMBRE PROVEEDOR', 'BANCO'
            ];

            // 2. Data Rows with sanitization
            const csvRows = dossiers.map(d => {
                const fins = (d as any).financials || {};

                const esc = (val: any) => {
                    if (val === null || val === undefined) return '';
                    const str = String(val).trim();
                    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                        return `"${str.replace(/"/g, '""')}"`;
                    }
                    return str;
                };

                return [
                    esc(d.numPedimento),
                    esc(d.items?.length || 0),
                    esc(d.status || 'Pending'),
                    esc(d.updatedAt || ''),
                    fins.montoPagado || 0,
                    esc(fins.lineaCaptura || ''),
                    esc(fins.supplierTaxId || ''),
                    esc(fins.supplierName || ''),
                    esc(fins.banco || '')
                ].join(',');
            });

            // 3. Build with BOM for Excel
            const csvContent = '\uFEFF' + headers.join(',') + '\n' + csvRows.join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');

            const timestamp = new Date().toISOString().slice(0, 10);
            link.setAttribute('href', url);
            link.setAttribute('download', `Digital_Dossier_Export_${timestamp}.csv`);

            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // Clean up
            setTimeout(() => window.URL.revokeObjectURL(url), 100);

        } catch (e) {
            console.error("CSV Export Error", e);
            alert("Error al generar CSV: " + e);
        }
    };

    const toggleSelect = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedIds(new Set(filteredDossiers.map(d => d.numPedimento)));
        } else {
            setSelectedIds(new Set());
        }
    };

    const handleBulkReprocess = async () => {
        if (selectedIds.size === 0 || syncing || reprocessingId) return;

        const idsToProcess = Array.from(selectedIds) as string[];
        setSyncing(true);
        setSyncStats({ current: 0, total: idsToProcess.length, status: 'Iniciando Reproceso Masivo...' });

        let successCount = 0;
        let failCount = 0;
        const errorDetails: string[] = [];

        for (let i = 0; i < idsToProcess.length; i++) {
            const pedimentoNo = idsToProcess[i];
            setSyncStats(s => ({ ...s, current: i + 1, status: `Reprocesando ${pedimentoNo}...` }));

            try {
                await vucemAutomation.reprocessDossier(pedimentoNo as string, (msg: string) => {
                    setSyncStats(s => ({ ...s, status: `[${i + 1}/${idsToProcess.length}] ${msg}` }));
                });
                successCount++;
            } catch (err: any) {
                console.error(`Error reprocesando ${pedimentoNo}:`, err);
                failCount++;
                const msg = err.code ? `[${err.code}] ${err.message}` : (err.message || "Error desconocido");
                errorDetails.push(`- ${pedimentoNo}: ${msg}`);
            }
        }

        // Dar tiempo al usuario para leer el mensaje final
        await new Promise(r => setTimeout(r, 2000));

        setSyncing(false);
        setSyncStats({ current: 0, total: 0, status: '' });
        setSelectedIds(new Set());

        let finalMsg = `✅ Proceso Finalizado.\nÉxitos: ${successCount}\nFallos: ${failCount}`;
        if (errorDetails.length > 0) {
            finalMsg += `\n\nDETALLE DE ERRORES:\n${errorDetails.slice(0, 10).join('\n')}`;
            if (errorDetails.length > 10) finalMsg += `\n... y ${errorDetails.length - 10} más.`;
        }

        alert(finalMsg);
    };

    const handleFixAllUnclassified = async () => {
        const unclassified = dossiers.filter(d => d.numPedimento.includes('POR_CLASIFICAR'));
        if (unclassified.length === 0) {
            alert("No hay expedientes sin clasificar.");
            return;
        }

        if (!window.confirm(`¿Deseas intentar reubicar automáticamente los ${unclassified.length} expedientes sin clasificar usando búsqueda por nombre y sufijo?`)) return;

        setSyncing(true);
        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < unclassified.length; i++) {
            const dossier = unclassified[i];
            setSyncStats({ current: i + 1, total: unclassified.length, status: `Relocalizando ${dossier.numPedimento}...` });
            try {
                await vucemAutomation.reprocessDossier(dossier.numPedimento, (msg: string) => {
                    setSyncStats(s => ({ ...s, status: msg }));
                });
                successCount++;
            } catch (err: any) {
                console.error(`Error relocalizando ${dossier.numPedimento}:`, err);
                failCount++;
                const msg = err.code ? `[${err.code}] ${err.message}` : (err.message || "Error desconocido");
                if (setSyncStats) setSyncStats(s => ({ ...s, status: `❌ Error en ${dossier.numPedimento}: ${msg}` }));
            }
        }

        setSyncing(false);
        setSyncStats({ current: 0, total: 0, status: '' });
        alert(`✅ Proceso finalizado.\nRelocalizados con éxito: ${successCount}\nPermanece sin identificar: ${failCount}`);
    };

    const handleDeleteDossier = async (pedimentoNo: string) => {
        if (!window.confirm(`¿Estás SEGURO de eliminar el expediente ${pedimentoNo}? Se borrarán los registros de Firebase y los archivos de Drive.`)) return;

        setSyncing(true);
        try {
            await vucemAutomation.deleteDossier(pedimentoNo, (msg) => {
                setSyncStats({ current: 1, total: 1, status: msg });
            });
            alert("Expediente eliminado con éxito.");
        } catch (err: any) {
            console.error("Error al eliminar:", err);
            alert(`Error al eliminar: ${err.message}`);
        } finally {
            setSyncing(false);
            setSyncStats({ current: 0, total: 0, status: '' });
        }
    };

    const handleBulkDelete = async () => {
        if (selectedIds.size === 0 || syncing) return;
        const ids = Array.from(selectedIds) as string[];

        if (!window.confirm(`¿Estás SEGURO de eliminar los ${ids.length} expedientes seleccionados? Esta acción es irreversible y borrará los archivos de Drive.`)) return;

        setSyncing(true);
        let count = 0;
        for (const id of ids) {
            try {
                setSyncStats({ current: count + 1, total: ids.length, status: `Eliminando ${id}...` });
                await vucemAutomation.deleteDossier(id, (msg) => {
                    setSyncStats(s => ({ ...s, status: `[${count + 1}/${ids.length}] ${msg}` }));
                });
                count++;
            } catch (err: any) {
                console.error(`Error eliminando ${id}:`, err);
            }
        }

        setSyncing(false);
        setSyncStats({ current: 0, total: 0, status: '' });
        setSelectedIds(new Set());
        alert(`✅ Proceso finalizado. Eliminados: ${count}`);
    };

    const handleReprocess = async (pedimentoNo: string) => {
        if (syncing || reprocessingId) return;

        setReprocessingId(pedimentoNo);
        setSyncStats({ current: 0, total: 1, status: 'Iniciando Reproceso...' });

        try {
            await vucemAutomation.reprocessDossier(pedimentoNo as string, (msg: string) => {
                setSyncStats(s => ({ ...s, status: msg }));
            });
            alert(`✅ Expediente ${pedimentoNo} reprocesado con éxito.`);
        } catch (err: any) {
            console.error("Error al reprocesar:", err);
            alert(`❌ Error al reprocesar: ${err.message || "Error desconocido"}`);
        } finally {
            // Delay para visibilidad del mensaje final
            await new Promise(r => setTimeout(r, 1500));
            setReprocessingId(null);
            setSyncStats({ current: 0, total: 2, status: '' });
        }
    };

    const handleLocalXmlImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setSyncing(true);
        let count = 0;
        const fileList = Array.from(files) as File[];
        for (const file of fileList) {
            try {
                setSyncStats({ current: count + 1, total: fileList.length, status: `Procesando ${file.name}...` });
                await vucemAutomation.processLocalXml(file, (msg: string) => {
                    setSyncStats(prev => ({ ...prev, status: msg }));
                });
                count++;
            } catch (err: any) {
                console.error(`Error importando ${file.name}:`, err);
                alert(`Error en ${file.name}: ${err.message}`);
            }
        }
        setSyncing(false);
        alert(`✅ Importación finalizada. Se procesaron ${count} archivos correctamente.`);
        // fetchDossiers(); se actualiza por onSnapshot
    };


    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header Area */}
            {/* Sync Controls */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div>
                    <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                        <FolderOpen className="text-blue-600" size={28} />
                        Expediente Electrónico
                        {isConfigured && (
                            <div className="flex items-center gap-3 ml-4 px-3 py-1.5 bg-slate-100 rounded-2xl border border-slate-200">
                                <div className={`w-2 h-2 rounded-full animate-pulse ${connectionStatus === 'online' ? 'bg-emerald-500' :
                                    connectionStatus === 'error' ? 'bg-red-500' :
                                        connectionStatus === 'testing' ? 'bg-amber-500' : 'bg-slate-400'
                                    }`} />
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 mr-2">
                                    Vucem: {connectionStatus === 'online' ? 'Conectado' :
                                        connectionStatus === 'error' ? 'Error' :
                                            connectionStatus === 'testing' ? 'Validando' : 'Desconectado'}
                                </span>

                                {connectionStatus !== 'online' && (
                                    <button
                                        onClick={async () => {
                                            const ok = await testConnection();
                                            if (ok) alert("✅ Conexión Exitosa con VUCEM.");
                                            else alert(lastError || "Error al intentar conectar.");
                                        }}
                                        disabled={connectionStatus === 'testing'}
                                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded-lg transition-all shadow-sm disabled:opacity-50"
                                    >
                                        {connectionStatus === 'testing' ? 'CONECTANDO...' : 'CONECTAR A VUCEM'}
                                    </button>
                                )}

                                {isConfigured && (
                                    <button
                                        onClick={() => logout()}
                                        className="px-3 py-1 bg-slate-200 hover:bg-red-600 hover:text-white text-slate-600 text-[10px] font-bold rounded-lg transition-all shadow-sm"
                                        title="Borra archivos y cierra sesión"
                                    >
                                        DESCONECTAR / LIMPIAR
                                    </button>
                                )}
                            </div>
                        )}
                    </h2>
                    <p className="text-slate-500 text-sm mt-1">Gestión y respaldo automatizado de documentos de comercio exterior en Google Drive.</p>
                </div>

                <div className="flex flex-col gap-2 align-end">
                    {/* Mode Selector */}
                    <div className="flex bg-slate-100 p-1 rounded-lg self-end">
                        <button
                            onClick={() => setSyncMode('report')}
                            className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${syncMode === 'report' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Por Reporte
                        </button>
                        <button
                            onClick={() => setSyncMode('date')}
                            className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${syncMode === 'date' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Por Fecha (Discovery)
                        </button>
                    </div>

                    <div className="flex flex-wrap gap-3 items-center justify-end">
                        <input
                            type="file"
                            id="local-xml-import"
                            multiple
                            accept=".xml"
                            className="hidden"
                            onChange={handleLocalXmlImport}
                        />
                        <button
                            onClick={() => document.getElementById('local-xml-import')?.click()}
                            disabled={syncing}
                            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition-all shadow-sm disabled:opacity-50"
                        >
                            <FileText size={16} />
                            IMPORTAR XML LOCAL
                        </button>
                        {syncMode === 'report' ? (
                            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 p-1 rounded-xl">
                                <FileSpreadsheet size={16} className="text-slate-400 ml-2" />
                                <select
                                    className="bg-transparent text-sm font-medium focus:outline-none min-w-[200px] pr-8"
                                    value={selectedReportId}
                                    onChange={(e) => setSelectedReportId(e.target.value)}
                                >
                                    <option value="">Seleccionar Reporte SAT...</option>
                                    {reports.map(r => (
                                        <option key={r.id} value={r.id}>{r.name} ({r.stats?.pedimentosCount || 0} ped)</option>
                                    ))}
                                </select>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                <input
                                    type="date"
                                    className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                                    value={dateRange.start}
                                    onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                                />
                                <span className="text-slate-400">-</span>
                                <input
                                    type="date"
                                    className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                                    value={dateRange.end}
                                    onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                                />
                            </div>
                        )}


                        <button
                            onClick={!isConfigured ? () => { setActiveTab('vucem'); } : (syncMode === 'report' ? handleSyncSelectedReport : handleSyncDateRange)}
                            disabled={syncing || !isConfigured || connectionStatus !== 'online' || (syncMode === 'report' ? !selectedReportId : (!dateRange.start || !dateRange.end))}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-blue-100 disabled:opacity-50 disabled:shadow-none ${!isConfigured ? 'bg-amber-500 hover:bg-amber-600' : syncMode === 'date' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-blue-600 hover:bg-blue-700'} text-white`}
                            title={connectionStatus !== 'online' ? "Debes Activar la Conexión primero" : ""}
                        >
                            {syncing ? (
                                <>
                                    <RefreshCw className="animate-spin" size={18} />
                                    {syncStats.status || `${syncStats.current}/${syncStats.total}`}
                                </>
                            ) : !isConfigured ? (
                                <>
                                    <AlertCircle size={18} />
                                    Configurar FIEL
                                </>
                            ) : (
                                <>
                                    <RefreshCw size={18} />
                                    {syncMode === 'report' ? 'Sincronizar Reporte' : 'Buscar y Descargar'}
                                </>
                            )}
                        </button>

                        <button
                            onClick={handleFinancialExport}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-100 transition-all"
                            title="Generar Excel con desglose de impuestos (DTA, IGI, IVA, etc.)"
                            disabled={dossiers.length === 0}
                        >
                            <FileSpreadsheet size={18} />
                            Reporte Financiero
                        </button>

                        <button
                            onClick={handleCSVExport}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-100 transition-all border border-indigo-200"
                            title="Exportar listado de expedientes en formato CSV (Compatible con Excel)"
                            disabled={dossiers.length === 0}
                        >
                            <Download size={18} />
                            Exportar CSV
                        </button>


                        {dossiers.some(d => d.numPedimento.includes('POR_CLASIFICAR')) && (
                            <button
                                onClick={handleFixAllUnclassified}
                                disabled={syncing}
                                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-100 transition-all border border-orange-400"
                                title="Intenta mover archivos de POR_CLASIFICAR a sus expedientes reales usando el nombre del archivo"
                            >
                                <Zap size={18} className={syncing ? 'animate-pulse' : ''} />
                                Corregir Clasificaciones
                            </button>
                        )}

                        {selectedIds.size > 0 && (
                            <div className="flex gap-2 animate-in slide-in-from-right-4">
                                <button
                                    onClick={handleBulkReprocess}
                                    disabled={syncing}
                                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-lg shadow-amber-100 transition-all"
                                >
                                    <RefreshCw size={18} className={syncing ? 'animate-spin' : ''} />
                                    Reprocesar Selección ({selectedIds.size})
                                </button>
                                <button
                                    onClick={handleBulkDelete}
                                    disabled={syncing}
                                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-100 transition-all"
                                >
                                    <Trash2 size={18} />
                                    Eliminar Selección ({selectedIds.size})
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Stats & Search */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatCard label="Total Expedientes" value={dossiers.length} icon={FolderOpen} color="blue" />
                <StatCard label="Documentos en Drive" value={dossiers.reduce((acc, d) => acc + (d.items?.length || 0), 0)} icon={FileText} color="indigo" />

                {/* Clock Removed, Search Expanded */}
                <div className="md:col-span-2 bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="Buscar por pedimento, cliente, banco..."
                            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* Dossier Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full text-left">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="px-3 py-4 w-10">
                                <input
                                    type="checkbox"
                                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                    checked={selectedIds.size > 0 && selectedIds.size === filteredDossiers.length}
                                    onChange={handleSelectAll}
                                />
                            </th>
                            {/* MULTI COLUMN HEADERS */}
                            <th className="px-3 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Año</th>
                            <th className="px-3 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Adu</th>
                            <th className="px-3 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Pat</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Pedimento</th>

                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Documentos Detectados</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Estatus</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading ? (
                            Array(5).fill(0).map((_, i) => (
                                <tr key={i} className="animate-pulse">
                                    <td colSpan={8} className="px-6 py-4 h-16 bg-slate-50/50"></td>
                                </tr>
                            ))
                        ) : filteredDossiers.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="px-6 py-20 text-center">
                                    <div className="flex flex-col items-center gap-2 text-slate-400">
                                        <AlertCircle size={48} />
                                        <p className="font-medium text-lg text-slate-500">No se encontraron expedientes</p>
                                        <p className="text-sm">Inicia una sincronización o carga datos.</p>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            filteredDossiers.map((dossier) => {
                                // Fallback logic if meta is missing (e.g. manually added ones)
                                const fullP = (dossier.numPedimento?.length === 15) ? dossier.numPedimento : `26163471${dossier.numPedimento}`; // default old behavior if unknown
                                const displayYear = dossier.meta_year || (fullP.length === 15 ? fullP.slice(0, 2) : "??");
                                const displayAdu = dossier.meta_aduana || (fullP.length === 15 ? fullP.slice(2, 4) : "??");
                                const displayPat = dossier.meta_patente || (fullP.length === 15 ? fullP.slice(4, 8) : "????");
                                const displayPed = fullP.length === 15 ? fullP.slice(8) : dossier.numPedimento;

                                return (
                                    <tr key={dossier.id} className={`hover:bg-slate-50/80 transition-colors group ${selectedIds.has(dossier.numPedimento) ? 'bg-blue-50/50' : ''}`}>
                                        <td className="px-3 py-4 text-center">
                                            <input
                                                type="checkbox"
                                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                                checked={selectedIds.has(dossier.numPedimento)}
                                                onChange={() => toggleSelect(dossier.numPedimento)}
                                            />
                                        </td>
                                        {/* MULTI COLUMN ROWS */}
                                        <td className="px-3 py-4 text-center text-slate-600 font-medium">{displayYear}</td>
                                        <td className="px-3 py-4 text-center text-slate-600 font-medium">{displayAdu}</td>
                                        <td className="px-3 py-4 text-center text-slate-600 font-medium">{displayPat}</td>

                                        <td className="px-6 py-4">
                                            <span className="font-mono font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-lg whitespace-nowrap">
                                                {displayPed}
                                            </span>
                                        </td>

                                        {/* ... rest of columns ... */}
                                        <td className="px-6 py-4">
                                            <div className="flex gap-1.5 overflow-x-auto max-w-[300px] scrollbar-hide py-1">
                                                {([...(dossier.items || [])].sort((a, b) => {
                                                    const typeA = vucemAutomation.getDocType(a.name);
                                                    const typeB = vucemAutomation.getDocType(b.name);
                                                    const order = ['PED-C', 'PED-S', 'FACT', 'BL', 'MBL', 'HBL', 'ACUSE', 'EDOC', 'XML'];
                                                    return order.indexOf(typeA) - order.indexOf(typeB);
                                                })).map((item, idx) => {
                                                    const type = vucemAutomation.getDocType(item.name);
                                                    const colors: Record<string, string> = {
                                                        'PED-C': 'bg-blue-600 text-white',
                                                        'PED-S': 'bg-sky-500 text-white',
                                                        'FACT': 'bg-emerald-500 text-white',
                                                        'BL': 'bg-indigo-500 text-white',
                                                        'MBL': 'bg-indigo-600 text-white',
                                                        'HBL': 'bg-indigo-400 text-white',
                                                        'ACUSE': 'bg-amber-100 text-amber-700 border border-amber-200',
                                                        'XML': 'bg-slate-100 text-slate-500',
                                                        'EDOC': 'bg-purple-50 text-purple-600 border border-purple-100'
                                                    };
                                                    return (
                                                        <a
                                                            key={idx}
                                                            href={item.url}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            title={item.name}
                                                            className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-tighter transition-all flex-shrink-0 flex items-center justify-center min-w-[36px] shadow-sm hover:scale-105 ${colors[type] || 'bg-slate-100 text-slate-600'}`}
                                                        >
                                                            {type}
                                                        </a>
                                                    );
                                                })}
                                                {(!dossier.items || dossier.items.length === 0) && (
                                                    <span className="text-xs text-slate-400 italic">Sin archivos</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <DossierStatusBadge items={dossier.items || []} />
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-2">
                                                {/* Action buttons same as before */}
                                                <button
                                                    onClick={() => handleReprocess(dossier.numPedimento)}
                                                    disabled={!!reprocessingId || syncing}
                                                    className={`p-2 rounded-lg transition-all ${reprocessingId === dossier.numPedimento ? 'text-blue-600 bg-blue-50 animate-pulse' : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'}`}
                                                    title="Reprocesar"
                                                >
                                                    <RefreshCw size={18} className={reprocessingId === dossier.numPedimento ? 'animate-spin' : ''} />
                                                </button>

                                                <button
                                                    onClick={() => dossier.items?.[0] && window.open(`https://drive.google.com/drive/folders/${dossier.items[0].driveId.split('/')[0]}`, '_blank')}
                                                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                                    title="Ver en Drive"
                                                >
                                                    <ExternalLink size={18} />
                                                </button>
                                                <button
                                                    onClick={async () => {
                                                        const XLSX = await import('xlsx');
                                                        const data = dossier.items.map(it => ({ Nombre: it.name, Link: it.url }));
                                                        const ws = XLSX.utils.json_to_sheet(data);
                                                        const wb = XLSX.utils.book_new();
                                                        XLSX.utils.book_append_sheet(wb, ws, "Archivos");
                                                        XLSX.writeFile(wb, `Expediente_${dossier.numPedimento}.xlsx`);
                                                    }}
                                                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                                    title="Descargar Relación"
                                                >
                                                    <Download size={18} />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteDossier(dossier.numPedimento)}
                                                    disabled={syncing}
                                                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                                    title="Eliminar Expediente"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div >
    );
};

const StatCard: React.FC<{ label: string, value: string | number, icon: any, color: string }> = ({ label, value, icon: Icon, color }) => (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
        <div className={`p-3 rounded-xl bg-${color}-50 text-${color}-600`}>
            <Icon size={24} />
        </div>
        <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{label}</p>
            <p className="text-2xl font-black text-slate-800">{value}</p>
        </div>
    </div>
);

const DossierStatusBadge: React.FC<{ items: DossierItem[] }> = ({ items }) => {
    // Intelligent Status: Checks for specific required document types
    const types = new Set(items.map(i => vucemAutomation.getDocType(i.name)));
    const hasPedimento = types.has('PED-C') || types.has('PED-S');
    const hasXml = types.has('XML');
    const hasAcuse = types.has('ACUSE') || types.has('EDOC'); // EDOC often acts as proof too

    const isEmpry = items.length === 0;
    const isComplete = hasPedimento && hasXml && hasAcuse;

    if (isEmpry) return <span className="px-2.5 py-1 bg-slate-100 text-slate-500 rounded-full text-[10px] font-black uppercase tracking-tighter">Vacío</span>;
    if (!isComplete) {
        return (
            <div className="flex flex-col gap-0.5 items-center">
                <span className="px-2.5 py-1 bg-amber-50 text-amber-600 rounded-full text-[10px] font-black uppercase tracking-tighter flex items-center gap-1 justify-center">
                    <Clock size={10} /> Parcial
                </span>
            </div>
        );
    }
    return <span className="px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black uppercase tracking-tighter flex items-center gap-1 justify-center"><CheckCircle2 size={10} /> Completo</span>;
};
