import React, { useState } from 'react';
import { PedimentoRecord, RawFileParsed } from '../../types.ts';
import { OperationsChart, TopSuppliersChart } from './Charts.tsx';
import { DollarSign, Package, TrendingUp, TrendingDown, Search, Cpu, Table, BarChart3, FileText, ChevronRight, Share2, FileDown, Archive } from 'lucide-react';
import { geminiService } from '../../services/geminiService.ts';
import { DATA_STAGE_SCHEMAS, RECORD_DESCRIPTIONS } from '../../utils/schemas.ts';

interface DashboardProps {
    data: PedimentoRecord[];
    rawFiles: RawFileParsed[];
    onSync: () => void;
}

const DataStageDashboard: React.FC<DashboardProps> = ({ data, rawFiles, onSync }) => {
    const [activeTab, setActiveTab] = useState<'overview' | 'raw'>('overview');
    const [searchTerm, setSearchTerm] = useState('');
    const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    // Raw Data State
    const [selectedFileCode, setSelectedFileCode] = useState<string>(rawFiles[0]?.code || '');

    // KPIs
    const totalValue = data.reduce((acc, curr) => acc + curr.totalValueUsd, 0);
    const totalWeight = data.reduce((acc, curr) => acc + curr.pesoBruto, 0);

    // KPI Calculation: Count Unique Pedimentos
    // We use a Set to ensure we are counting distinct Pedimento Numbers declared, not just rows.
    const uniqueImportPedimentos = new Set(data.filter(r => r.tipoOperacion === '1').map(r => r.pedimento));
    const totalImports = uniqueImportPedimentos.size;

    const uniqueExportPedimentos = new Set(data.filter(r => r.tipoOperacion === '2').map(r => r.pedimento));
    const totalExports = uniqueExportPedimentos.size;

    const filteredData = data.filter(r =>
        r.pedimento.includes(searchTerm) ||
        r.invoices.some(i => i.proveedor.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const selectedRawFile = rawFiles.find(f => f.code === selectedFileCode);
    const currentSchema = selectedRawFile ? DATA_STAGE_SCHEMAS[selectedRawFile.code] : null;

    const handleAIAnalyze = async () => {
        setIsAnalyzing(true);
        const result = await geminiService.analyzeDataStage(data, "Please summarize the key performance indicators and suggest areas for cost optimization.");
        setAiAnalysis(result);
        setIsAnalyzing(false);
    };

    const handleExport = () => {
        let csvContent = '';
        let filename = '';

        if (activeTab === 'overview') {
            if (filteredData.length === 0) {
                alert("No hay datos para exportar con los filtros actuales.");
                return;
            }

            const headers = ['Patente', 'Pedimento', 'Seccion', 'Tipo Operacion', 'Clave Doc', 'Valor USD', 'Peso Bruto (Kg)', 'Cantidad Items', 'Proveedores'];
            const rows = filteredData.map(r => {
                const proveedores = Array.from(new Set(r.invoices.map(i => i.proveedor))).join('; ');
                return [
                    r.patente,
                    r.pedimento,
                    r.seccion,
                    r.tipoOperacion === '1' ? 'IMPORTACION' : 'EXPORTACION',
                    r.claveDocumento,
                    r.totalValueUsd,
                    r.pesoBruto,
                    r.items.length,
                    proveedores
                ];
            });

            const headerRow = headers.join(',');
            const dataRows = rows.map(row =>
                row.map(val => {
                    const strVal = String(val);
                    if (strVal.includes(',') || strVal.includes('"') || strVal.includes('\n')) {
                        return `"${strVal.replace(/"/g, '""')}"`;
                    }
                    return strVal;
                }).join(',')
            ).join('\n');

            csvContent = '\uFEFF' + headerRow + '\n' + dataRows;
            const timestamp = new Date().toISOString().slice(0, 10);
            filename = `resumen_operaciones_${searchTerm ? 'filtrado_' : ''}${timestamp}.csv`;

        } else if (activeTab === 'raw' && selectedRawFile) {
            // Export Raw Data
            const headers = currentSchema || selectedRawFile.rows[0]?.map((_, i) => `Campo ${i}`) || [];

            const headerRow = headers.join(',');
            const dataRows = selectedRawFile.rows.map(row =>
                row.map(val => {
                    const strVal = String(val);
                    if (strVal.includes(',') || strVal.includes('"') || strVal.includes('\n')) {
                        return `"${strVal.replace(/"/g, '""')}"`;
                    }
                    return strVal;
                }).join(',')
            ).join('\n');

            csvContent = '\uFEFF' + headerRow + '\n' + dataRows;
            filename = `archivo_${selectedRawFile.code}_${selectedRawFile.fileName}.csv`;
        }

        if (csvContent) {
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            if (link.download !== undefined) {
                const url = URL.createObjectURL(blob);
                link.setAttribute('href', url);
                link.setAttribute('download', filename);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        }
    };

    return (
        <div className="space-y-6">

            {/* Header with Sync */}
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-slate-800">Visualización de Operaciones</h2>
                <button
                    onClick={onSync}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-colors"
                >
                    <Share2 size={18} /> Sincronizar con LogiMaster
                </button>
            </div>

            {/* Tab Navigation */}
            <div className="border-b border-slate-200">
                <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                    <button
                        onClick={() => setActiveTab('overview')}
                        className={`${activeTab === 'overview'
                            ? 'border-blue-500 text-blue-600'
                            : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2`}
                    >
                        <BarChart3 className="w-4 h-4" />
                        Dashboard y Resumen
                    </button>
                    <button
                        onClick={() => setActiveTab('raw')}
                        className={`${activeTab === 'raw'
                            ? 'border-blue-500 text-blue-600'
                            : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2`}
                    >
                        <Table className="w-4 h-4" />
                        Explorador de Archivos (Detalle)
                    </button>
                </nav>
            </div>

            {activeTab === 'overview' ? (
                <div className="space-y-6 animate-fade-in">
                    {/* Header Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-slate-500 text-sm font-medium">Valor Total (USD)</h3>
                                <div className="p-2 bg-green-50 rounded-lg">
                                    <DollarSign className="w-5 h-5 text-green-600" />
                                </div>
                            </div>
                            <p className="text-2xl font-bold text-slate-900">${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                        </div>

                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-slate-500 text-sm font-medium">Peso Bruto Total (Kg)</h3>
                                <div className="p-2 bg-blue-50 rounded-lg">
                                    <Package className="w-5 h-5 text-blue-600" />
                                </div>
                            </div>
                            <p className="text-2xl font-bold text-slate-900">{totalWeight.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                        </div>

                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-slate-500 text-sm font-medium">Operaciones Imp.</h3>
                                <div className="p-2 bg-indigo-50 rounded-lg">
                                    <TrendingDown className="w-5 h-5 text-indigo-600" />
                                </div>
                            </div>
                            <div className="flex flex-col">
                                <p className="text-2xl font-bold text-slate-900">{totalImports}</p>
                                <span className="text-xs text-slate-400">Pedimentos únicos</span>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-slate-500 text-sm font-medium">Operaciones Exp.</h3>
                                <div className="p-2 bg-orange-50 rounded-lg">
                                    <TrendingUp className="w-5 h-5 text-orange-600" />
                                </div>
                            </div>
                            <div className="flex flex-col">
                                <p className="text-2xl font-bold text-slate-900">{totalExports}</p>
                                <span className="text-xs text-slate-400">Pedimentos únicos</span>
                            </div>
                        </div>
                    </div>

                    {/* Charts Section */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                            <h3 className="text-lg font-semibold text-slate-800 mb-4">Distribución de Operaciones</h3>
                            <OperationsChart data={data} />
                        </div>
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                            <h3 className="text-lg font-semibold text-slate-800 mb-4">Top 5 Proveedores (Valor USD)</h3>
                            <TopSuppliersChart data={data} />
                        </div>
                    </div>

                    {/* AI Analysis Section */}
                    <div className="bg-gradient-to-r from-purple-50 to-indigo-50 p-6 rounded-xl border border-indigo-100">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="text-lg font-semibold text-indigo-900 flex items-center gap-2">
                                    <Cpu className="w-5 h-5" />
                                    Análisis Inteligente (Gemini AI)
                                </h3>
                                <p className="text-indigo-600 text-sm mt-1">Genera un resumen ejecutivo y detecta anomalías en tus operaciones.</p>
                            </div>
                            <button
                                onClick={handleAIAnalyze}
                                disabled={isAnalyzing}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                            >
                                {isAnalyzing ? 'Analizando...' : 'Generar Reporte'}
                            </button>
                        </div>
                        {aiAnalysis && (
                            <div className="bg-white p-4 rounded-lg border border-indigo-100 text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">
                                {aiAnalysis}
                            </div>
                        )}
                    </div>

                    {/* Data Table */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <h3 className="text-lg font-semibold text-slate-800">Detalle de Pedimentos (Procesado)</h3>
                            <div className="flex gap-2 w-full sm:w-auto">
                                <div className="relative flex-1 sm:flex-none">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder="Buscar pedimento o proveedor..."
                                        className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-64"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                    />
                                </div>
                                <button
                                    onClick={handleExport}
                                    className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg hover:bg-emerald-100 shadow-sm transition-colors text-sm font-medium"
                                    title="Exportar tabla actual a CSV"
                                >
                                    <FileDown size={16} /> Exportar CSV
                                </button>
                            </div>
                        </div>
                        <div className="overflow-x-auto scrollbar-thin">
                            <table className="w-full text-left text-sm text-slate-600">
                                <thead className="bg-slate-50 text-slate-700 font-medium">
                                    <tr>
                                        <th className="px-6 py-3">Pedimento</th>
                                        <th className="px-6 py-3">Tipo</th>
                                        <th className="px-6 py-3">Clave</th>
                                        <th className="px-6 py-3 text-right">Valor USD</th>
                                        <th className="px-6 py-3 text-right">Peso (Kg)</th>
                                        <th className="px-6 py-3 text-right">Items</th>
                                        <th className="px-6 py-3">Proveedor Principal</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredData.slice(0, 50).map((row) => (
                                        <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-6 py-3 font-medium text-slate-900">{row.patente}-{row.pedimento}</td>
                                            <td className="px-6 py-3">
                                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${row.tipoOperacion === '1' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                                                    }`}>
                                                    {row.tipoOperacion === '1' ? 'IMP' : 'EXP'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-3">{row.claveDocumento}</td>
                                            <td className="px-6 py-3 text-right">${row.totalValueUsd.toLocaleString()}</td>
                                            <td className="px-6 py-3 text-right">{row.pesoBruto.toLocaleString()}</td>
                                            <td className="px-6 py-3 text-right">{row.items.length}</td>
                                            <td className="px-6 py-3 truncate max-w-[200px]" title={row.invoices[0]?.proveedor}>
                                                {row.invoices[0]?.proveedor || '-'}
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredData.length === 0 && (
                                        <tr>
                                            <td colSpan={7} className="px-6 py-8 text-center text-slate-400">
                                                No se encontraron resultados.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-250px)]">
                    {/* Sidebar with files */}
                    <div className="w-full lg:w-64 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                        <div className="p-4 bg-slate-50 border-b border-slate-100">
                            <h3 className="font-semibold text-slate-700">Archivos (Registros)</h3>
                            <p className="text-xs text-slate-500 mt-1">Selecciona para ver detalle</p>
                        </div>
                        <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-1">
                            {rawFiles.map((file) => (
                                <button
                                    key={file.code}
                                    onClick={() => setSelectedFileCode(file.code)}
                                    className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between transition-colors ${selectedFileCode === file.code
                                        ? 'bg-blue-50 text-blue-700 font-medium'
                                        : 'text-slate-600 hover:bg-slate-50'
                                        }`}
                                >
                                    <span className="flex items-center gap-2">
                                        <FileText className="w-4 h-4 opacity-70" />
                                        <span>{file.code}</span>
                                    </span>
                                    <ChevronRight className={`w-3 h-3 ${selectedFileCode === file.code ? 'text-blue-500' : 'text-slate-300'}`} />
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Main Table View */}
                    <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                        {selectedRawFile ? (
                            <>
                                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                                    <div>
                                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                            Registro {selectedRawFile.code}
                                            <span className="text-sm font-normal text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                                                {RECORD_DESCRIPTIONS[selectedRawFile.code] || 'Desconocido'}
                                            </span>
                                        </h3>
                                        <p className="text-xs text-slate-500 mt-1 font-mono">Archivo: {selectedRawFile.fileName}</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={handleExport}
                                            className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg hover:bg-emerald-100 shadow-sm transition-colors text-xs font-medium"
                                        >
                                            <FileDown size={14} /> Exportar
                                        </button>
                                        <div className="text-xs text-slate-500 bg-white px-3 py-1 rounded-full border border-slate-200">
                                            {selectedRawFile.rows.length} registros
                                        </div>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-auto scrollbar-thin">
                                    <table className="w-full text-left text-sm text-slate-600 whitespace-nowrap">
                                        <thead className="bg-slate-100 text-slate-700 font-medium sticky top-0 z-10 shadow-sm">
                                            <tr>
                                                <th className="px-4 py-3 border-b border-slate-200 bg-slate-100 w-12 text-center text-xs uppercase tracking-wider text-slate-500">#</th>
                                                {selectedRawFile.rows[0]?.map((_, index) => {
                                                    // Determine Header Name
                                                    const headerName = currentSchema && currentSchema[index]
                                                        ? currentSchema[index]
                                                        : `Campo ${index}`;

                                                    return (
                                                        <th key={index} className="px-4 py-3 border-b border-slate-200 bg-slate-100 border-l border-slate-200/50 text-xs uppercase tracking-wider text-slate-600 font-bold">
                                                            {headerName}
                                                        </th>
                                                    );
                                                })}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {selectedRawFile.rows.slice(0, 500).map((row, rowIndex) => (
                                                <tr key={rowIndex} className="hover:bg-blue-50/50 transition-colors">
                                                    <td className="px-2 py-2 text-center text-slate-400 text-xs bg-slate-50/50 font-mono">{rowIndex + 1}</td>
                                                    {row.map((cell, cellIndex) => (
                                                        <td key={cellIndex} className="px-4 py-2 border-l border-slate-100 max-w-xs truncate font-mono text-xs" title={cell}>
                                                            {cell}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                            {selectedRawFile.rows.length > 500 && (
                                                <tr>
                                                    <td colSpan={selectedRawFile.rows[0].length + 1} className="px-4 py-4 text-center text-slate-500 bg-slate-50 text-xs italic">
                                                        Mostrando primeros 500 registros para optimizar rendimiento del navegador.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        ) : (selectedRawFile && selectedRawFile.rows.length === 0) ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 text-center">
                                <div className="bg-amber-50 p-4 rounded-full mb-4">
                                    <Archive className="w-8 h-8 text-amber-500" />
                                </div>
                                <h3 className="text-lg font-semibold text-slate-700 mb-2">Contenido Archivado</h3>
                                <p className="text-sm text-slate-500 max-w-md">
                                    El contenido detallado de este archivo fue removido para optimizar el espacio en el historial.
                                    <br />
                                    Sin embargo, sus datos <strong>sí fueron procesados</strong> y están incluidos en los totales del Dashboard.
                                </p>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                                <Table className="w-16 h-16 mb-4 opacity-10" />
                                <p className="font-medium">Selecciona un archivo del menú lateral</p>
                                <p className="text-sm opacity-70">Visualiza los datos crudos con estructura oficial</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default DataStageDashboard;