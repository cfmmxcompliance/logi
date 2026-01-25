
import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { FolderOpen, Search, Download, ExternalLink, RefreshCw, FileText, CheckCircle2, Clock, AlertCircle, FileSpreadsheet } from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { storageService } from '../services/storageService';
import { DataStageReport, PedimentoRecord } from '../types';
import { useVucem } from '../context/VucemContext';
import { vucemAutomation } from '../services/vucem/vucemAutomation';
import { VucemConfig } from '../services/vucem/types';

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
    const { config, isConfigured } = useVucem();
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [syncing, setSyncing] = useState(false);
    const [syncStats, setSyncStats] = useState({ current: 0, total: 0, status: '' });

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

    const filteredDossiers = dossiers.filter(d =>
        d.numPedimento.toLowerCase().includes(searchTerm.toLowerCase())
    );

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
                await vucemAutomation.syncPedimentoToDrive(pedimento, config, (msg) => {
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
        if (!config || !dateRange.start || !dateRange.end) return;

        setSyncing(true);
        setSyncStats({ current: 0, total: 0, status: 'Consultando VUCEM...' });

        try {
            await vucemAutomation.syncDateRangeToDrive(dateRange.start, dateRange.end, config, (msg) => {
                setSyncStats(s => ({ ...s, status: msg }));
            });
            alert("Sincronización por rango de fechas completada.");
        } catch (err) {
            console.error("Error syncing date range:", err);
            alert("Ocurrió un error durante la sincronización.");
        } finally {
            setSyncing(false);
            setSyncStats(s => ({ ...s, status: 'Completado' }));
        }
    };

    const handleFinancialExport = async () => {
        if (dossiers.length === 0) {
            alert("No hay expedientes para exportar");
            return;
        }

        try {
            const XLSX = await import('xlsx');
            const dataToExport = dossiers.map(d => {
                const fins = (d as any).financials || {};
                const fixedAssets = (d.numPedimento?.startsWith("24") || fins.clavePedimento === "AF") ? "Yes" : "No";

                return {
                    "Pedimento Number": fins.pedimentoNum || d.numPedimento || "",
                    "Monto Pagado": fins.montoPagado || 0,
                    "Referencia Ampliada": fins.lineaCaptura || "",
                    "Fiscal ID": fins.supplierTaxId || "",
                    "Supplier Name": fins.supplierName || "",
                    "Country": fins.supplierCountry || "",
                    "Fixed Assets (Yes/No)": fixedAssets,
                    "Merchandise Custom Value": fins.valorAduana || 0,
                    "Prevalidation VAT": (fins.prv || 0) * 0.16,
                    "Import VAT": fins.iva || 0,
                    "Prevalidation (PRV)": fins.prv || 0,
                    "Custom Duties (DTA)": fins.dta || 0,
                    "General Custom Tax (IGI)": fins.igi || 0,
                    "Fee (CNT)": fins.cnt || 0,
                    "Payed - Pedimento": fins.montoPagado || 0,
                    "Payment Date": fins.fechaPago || "",
                    "DIFERENCIA": 0,
                    "CLAVE": fins.clavePedimento || "",
                    "Bank Name": fins.banco || ""
                };
            });

            const worksheet = XLSX.utils.json_to_sheet(dataToExport);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Financials");
            XLSX.writeFile(workbook, `VUCEM_Financial_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
        } catch (e) {
            console.error("Export Error", e);
            alert("Error al generar Excel: " + e);
        }
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
                            disabled={syncing || (isConfigured && (syncMode === 'report' ? !selectedReportId : (!dateRange.start || !dateRange.end)))}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-blue-100 disabled:opacity-50 disabled:shadow-none ${!isConfigured ? 'bg-amber-500 hover:bg-amber-600' : syncMode === 'date' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-blue-600 hover:bg-blue-700'} text-white`}
                            title={!isConfigured ? "Ir a Configuración VUCEM" : ""}
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
                    </div>
                </div>
            </div>

            {/* Stats & Search */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatCard label="Total Expedientes" value={dossiers.length} icon={FolderOpen} color="blue" />
                <StatCard label="Documentos en Drive" value={dossiers.reduce((acc, d) => acc + (d.items?.length || 0), 0)} icon={FileText} color="indigo" />
                <StatCard label="Última Sincronización" value="Hoy 09:42 AM" icon={Clock} color="slate" />
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="Buscar por pedimento..."
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
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Pedimento</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Documentos Detectados</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Estatus</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Última Actualización</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading ? (
                            Array(5).fill(0).map((_, i) => (
                                <tr key={i} className="animate-pulse">
                                    <td colSpan={5} className="px-6 py-4 h-16 bg-slate-50/50"></td>
                                </tr>
                            ))
                        ) : filteredDossiers.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-20 text-center">
                                    <div className="flex flex-col items-center gap-2 text-slate-400">
                                        <AlertCircle size={48} />
                                        <p className="font-medium text-lg text-slate-500">No se encontraron expedientes</p>
                                        <p className="text-sm">Inicia una sincronización desde VUCEM o carga un archivo Data Stage.</p>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            filteredDossiers.map((dossier) => (
                                <tr key={dossier.id} className="hover:bg-slate-50/80 transition-colors group">
                                    <td className="px-6 py-4 text-center">
                                        <span className="font-mono font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-lg">
                                            {dossier.numPedimento}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex gap-1.5 overflow-x-auto max-w-[300px] scrollbar-hide">
                                            {dossier.items?.map((item, idx) => (
                                                <a
                                                    key={idx}
                                                    href={item.url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    title={item.name}
                                                    className="p-2 bg-slate-100 hover:bg-blue-100 text-slate-500 hover:text-blue-600 rounded-lg transition-all flex-shrink-0"
                                                >
                                                    <FileText size={16} />
                                                </a>
                                            ))}
                                            {(!dossier.items || dossier.items.length === 0) && (
                                                <span className="text-xs text-slate-400 italic">Sin archivos</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <DossierStatusBadge items={dossier.items || []} />
                                    </td>
                                    <td className="px-6 py-4 text-sm text-slate-500">
                                        {new Date(dossier.lastUpdate).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            <button className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Ver en Drive">
                                                <ExternalLink size={18} />
                                            </button>
                                            <button className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all" title="Descargar Offline">
                                                <Download size={18} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
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
    // Basic logic: if has > 2 items (Pedimento + COVE + Acuse), it's basically complete
    const count = items.length;
    if (count === 0) return <span className="px-2.5 py-1 bg-slate-100 text-slate-500 rounded-full text-[10px] font-black uppercase tracking-tighter">Vacío</span>;
    if (count < 3) return <span className="px-2.5 py-1 bg-amber-50 text-amber-600 rounded-full text-[10px] font-black uppercase tracking-tighter flex items-center gap-1 justify-center"><Clock size={10} /> Parcial</span>;
    return <span className="px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black uppercase tracking-tighter flex items-center gap-1 justify-center"><CheckCircle2 size={10} /> Completo</span>;
};
