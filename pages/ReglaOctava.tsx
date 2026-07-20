import React, { useState, useMemo, useSyncExternalStore } from 'react';
import { FileCheck, Upload, XCircle, ShieldCheck, Database, Search, Plus, Download, Filter, Trash2, AlertTriangle } from 'lucide-react';
import { storageService } from '../services/storageService.ts';
import { Rule8th } from '../types.ts';
import { CatalogQueryBuilder, QueryCondition, evaluateCondition } from '../components/CatalogQueryBuilder.tsx';
import { r8Extractor } from '../services/r8Extractor.ts';
import { vucemR8Extractor } from '../services/vucemR8Extractor.ts';
import { uploadFileToDrive } from '../services/googleDriveService.ts';

const ResizableHeader = ({ children, className = "", minWidth = "100px" }: { children: React.ReactNode, className?: string, minWidth?: string }) => (
    <th className="p-0 align-middle border-r border-slate-200 last:border-0 bg-slate-50 text-slate-600 font-medium">
        <div className={`resize-x overflow-hidden px-4 py-3 flex items-center ${className}`} style={{ minWidth }}>
            {children}
        </div>
    </th>
);
// Helper para similitud de strings (Levenshtein)
function getSimilarity(s1: string, s2: string): number {
  if (!s1 || !s2) return 0;
  s1 = s1.toLowerCase(); s2 = s2.toLowerCase();
  const costs = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) costs[j] = j;
      else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        costs[j - 1] = lastValue; lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return (s1.length - costs[s2.length]) / s1.length;
}

export const ReglaOctava = () => {
    const rule8ths = storageService.getRule8ths();
    const masterData = useSyncExternalStore(
        storageService.subscribe,
        () => storageService.getLocalState().parts
    );

    const [isUploading, setIsUploading] = useState(false);
    const [selectedRows, setSelectedRows] = useState<string[]>([]);

    // Advanced Query Builder State
    const [isQueryBuilderOpen, setIsQueryBuilderOpen] = useState(false);
    const [conditions, setConditions] = useState<QueryCondition[]>([
        { id: '1', column: 'folio', operator: 'in', type: 'string', input: '' }
    ]);
    const [activeFilters, setActiveFilters] = useState<QueryCondition[]>([]);

    // Filter Logic
    const filteredRules = useMemo(() => {
        if (!activeFilters || activeFilters.length === 0) return rule8ths;
        return rule8ths.filter(rule => {
            return activeFilters.every(f => {
                const val = (rule as any)[f.column];
                return evaluateCondition(val, f);
            });
        });
    }, [rule8ths, activeFilters]);

    // CSV Export
    const handleExportCSV = () => {
        if (filteredRules.length === 0) {
            alert('No hay registros para exportar');
            return;
        }

        const headers = ['Folio', 'No_Parte', 'MD_Part_Number', 'Fraccion_Original', 'Fraccion_R8', 'Permiso_Previo', 'Descripcion_R8', 'MD_Descripcion', 'Saldo_UM', 'Unidad_Medida', 'Valor_USD', 'Emision', 'Vigencia', 'Estatus'];
        const csvContent = "data:text/csv;charset=utf-8," + 
            headers.join(",") + "\n" +
            filteredRules.map(r => {
                
                // Recalculate match to avoid bad DB data
                const r8CleanDesc = (r.description || '').trim().toUpperCase();
                const r8CleanPermiso = (r.permisoPrevio || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
                
                const mdMatch = (() => {
                    if (r.masterdataPartNumber) {
                        const match = masterData.find(p => p.PART_NUMBER === r.masterdataPartNumber);
                        if (match) return match;
                    }
                    const exactMatch = masterData.find(p => {
                        const mdDesc = (p.DESCRIPCION_ES || '').trim().toUpperCase();
                        const mdR8 = (p.R8 || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
                        return (r8CleanPermiso && mdR8 === r8CleanPermiso) && (r8CleanDesc && mdDesc && r8CleanDesc === mdDesc);
                    });
                    if (exactMatch) return exactMatch;
                    
                    const descMatch = masterData.find(p => {
                        const mdDesc = (p.DESCRIPCION_ES || '').trim().toUpperCase();
                        return r8CleanDesc && mdDesc && r8CleanDesc === mdDesc;
                    });
                    return descMatch || null;
                })();
                
                const exportPartNumber = mdMatch?.PART_NUMBER || '';
                const exportDesc = mdMatch?.DESCRIPCION_ES || '';

                return [
                    r.folio,
                    r.partNumber,
                    exportPartNumber,
                    r.originalTariffFraction,
                    r.fraccionReglaOctava || '',
                    r.permisoPrevio || '',
                    `"${(r.description || '').replace(/"/g, '""')}"`,
                    `"${exportDesc.replace(/"/g, '""')}"`,

                    r.balance,
                    r.unidadMedida || '',
                    r.valorDolares || 0,
                    new Date(r.issueDate).toLocaleDateString(),
                    new Date(r.expirationDate).toLocaleDateString(),
                    r.status
                ].join(",");
            }).join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Reglas_8vas_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleDeleteRule = async (id: string) => {
        if (!id) {
            alert("Este registro no tiene un ID válido y parece estar corrupto. Por favor usa 'Limpiar Todo'.");
            return;
        }
        if (confirm('¿Estás seguro de eliminar este registro?')) {
            try {
                await storageService.deleteRule8th(id);
                window.location.reload();
            } catch (e: any) {
                alert("Error al eliminar: " + e.message);
            }
        }
    };

    const handleClearAll = async () => {
        if (confirm('¿Estás seguro de ELIMINAR TODOS los oficios registrados? Esto limpiará la pantalla.')) {
            try {
                await storageService.clearAllRule8ths();
                window.location.reload();
            } catch (e: any) {
                alert("Error al limpiar: " + e.message);
            }
        }
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedRows(filteredRules.map(r => r.id!));
        } else {
            setSelectedRows([]);
        }
    };

    const handleSelectRow = (id: string) => {
        setSelectedRows(prev => prev.includes(id) ? prev.filter(rowId => rowId !== id) : [...prev, id]);
    };

    const handleDeleteSelected = async () => {
        if (selectedRows.length === 0) return;
        if (confirm(`¿Estás seguro de eliminar ${selectedRows.length} registros seleccionados?`)) {
            try {
                for (const id of selectedRows) {
                    await storageService.deleteRule8th(id);
                }
                setSelectedRows([]);
                window.location.reload();
            } catch (e: any) {
                alert("Error al eliminar seleccionados: " + e.message);
            }
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;

        setIsUploading(true);
        try {
            const masterData = storageService.getLocalState().parts;

            for (let i = 0; i < files.length; i++) {
                const currentFile = files[i];
                
                // Backup to Google Drive FIRST - NON-NEGOTIABLE
                let driveUrl = '';
                try {
                    const uploadResult = await uploadFileToDrive(
                        currentFile, 
                        `Respaldo Regla 8va: ${currentFile.name}`, 
                        '1NDErmWE3Y97Woq_s93bJmzDpM4nVaCZA'
                    );
                    driveUrl = uploadResult.webViewLink;
                } catch (driveErr) {
                    console.error("Fallo crítico: No se pudo respaldar en Drive.", driveErr);
                    throw new Error("El archivo no se pudo respaldar en Google Drive. El proceso ha sido abortado por seguridad.");
                }

                const extracted = await r8Extractor.extractFromPdf(currentFile);
                for (const r8 of extracted) {
                    const r8CleanPermiso = r8.permisoPrevio ? r8.permisoPrevio.replace(/[^A-Z0-9]/gi, '').toUpperCase() : '';
                    
                    const permisoExists = r8CleanPermiso 
                        ? masterData.some(p => (p.R8 || '').replace(/[^A-Z0-9]/gi, '').toUpperCase() === r8CleanPermiso)
                        : false;

                    let masterdataMatch: 'matched' | 'mismatched' | 'not_found' = permisoExists ? 'matched' : 'not_found';
                    let masterdataErrors: string[] = [];
                    let masterdataPartNumber: string | undefined = undefined;
                    let masterdataDescription: string | undefined = undefined;
                    let masterdataR8: string | undefined = undefined;

                    if (!permisoExists) {
                        masterdataErrors.push(`No se encontró el Permiso Previo en MasterData`);
                    }

                    await storageService.addRule8th({
                        ...r8,
                        consumed: 0,
                        balance: r8.totalAuthorized,
                        status: 'Vigente',
                        masterdataMatch,
                        masterdataErrors,
                        masterdataPartNumber,
                        masterdataDescription,
                        masterdataR8,
                        pdfUrl: driveUrl // Save the backup URL
                    });
                }
            }
            alert('Documentos procesados y validados contra MasterData correctamente.');
            window.location.reload();
        } catch (error: any) {
            console.error(error);
            alert(error.message);
        } finally {
            setIsUploading(false);
        }
    };

    const handleVucemUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            const vucemRows = await vucemR8Extractor.extractFromExcel(file);
            let matchCount = 0;
            const usedVucemIndices = new Set<number>();

            for (const rule of rule8ths) {
                const r8Permiso = rule.permisoPrevio?.replace(/[^A-Z0-9]/gi, '').toUpperCase() || '';
                const r8Desc = (rule.description || '').trim().toUpperCase();

                const vucemCandidates = vucemRows
                    .map((r, i) => ({ row: r, index: i }))
                    .filter(v => v.row.NUMERO_DE_REGLA_8VA.replace(/[^A-Z0-9]/gi, '').toUpperCase() === r8Permiso && !usedVucemIndices.has(v.index));

                let match = undefined;

                if (vucemCandidates.length > 0) {
                    const exactMatch = vucemCandidates.find(v => v.row.DESCRIPCION.trim().toUpperCase() === r8Desc);
                    if (exactMatch) {
                        match = exactMatch;
                    } else {
                        let bestMatch = vucemCandidates[0];
                        let bestScore = -1;
                        for (const v of vucemCandidates) {
                            const score = getSimilarity(r8Desc, v.row.DESCRIPCION.trim().toUpperCase());
                            if (score > bestScore) {
                                bestScore = score;
                                bestMatch = v;
                            }
                        }
                        if (bestScore > 0) match = bestMatch; // Fallback to highest similarity
                    }
                }

                if (match) {
                    usedVucemIndices.add(match.index);
                    matchCount++;
                    
                    const balance = match.row.CANTIDAD_AUTORIZADA - match.row.CANTIDAD_EJERCIDA;
                    
                    await storageService.updateRule8th(rule.id!, {
                        totalAuthorized: match.row.CANTIDAD_AUTORIZADA,
                        consumed: match.row.CANTIDAD_EJERCIDA,
                        balance: balance,
                        valorDolares: match.row.VALOR_AUTORIZADO,
                        valorDolaresEjercido: match.row.VALOR_EJERCIDO,
                        status: balance <= 0 || new Date(rule.expirationDate) < new Date() ? 'Vencida' : 'Vigente'
                    });
                }
            }

            alert(`Saldos VUCEM procesados correctamente. Se actualizaron ${matchCount} partidas.`);
        } catch (error: any) {
            console.error(error);
            alert("Error al cargar VUCEM: " + error.message);
        } finally {
            setIsUploading(false);
            if (e.target) e.target.value = ''; // Reset input
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
                        <FileCheck className="text-indigo-600" size={28} />
                        Control de Reglas 8vas
                    </h1>
                    <p className="text-slate-500 mt-1">Gestión, control de saldos y vigencia de oficios de Regla 8va.</p>
                </div>
                <div className="flex gap-3">
                    {selectedRows.length > 0 && (
                        <button 
                            onClick={handleDeleteSelected}
                            className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 font-medium rounded-lg hover:bg-red-100 transition border border-red-200"
                        >
                            <Trash2 size={18} />
                            Eliminar ({selectedRows.length})
                        </button>
                    )}
                    {rule8ths.length > 0 && (
                        <button 
                            onClick={handleClearAll}
                            className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 font-medium rounded-lg hover:bg-red-100 transition"
                        >
                            <Trash2 size={18} />
                            Limpiar Todo
                        </button>
                    )}
                    <label className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition cursor-pointer">
                        {isUploading ? <span className="animate-pulse">Procesando...</span> : <><Database size={18} /> Cargar VUCEM (Saldos)</>}
                        <input type="file" className="hidden" accept=".xlsx,.xls" onChange={handleVucemUpload} disabled={isUploading} />
                    </label>
                    <label className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition cursor-pointer">
                        {isUploading ? <span className="animate-pulse">Procesando...</span> : <><Upload size={18} /> Cargar PDF</>}
                        <input type="file" className="hidden" multiple accept=".pdf" onChange={handleFileUpload} disabled={isUploading} />
                    </label>
                </div>
            </div>

            {/* Dashboard KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-slate-500">Oficios Vigentes</p>
                            <h3 className="text-3xl font-bold text-slate-800 mt-2">
                                {rule8ths.filter(r => r.status === 'Vigente').length}
                            </h3>
                        </div>
                        <div className="p-3 bg-green-50 text-green-600 rounded-lg">
                            <ShieldCheck size={24} />
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-slate-500">Próximos a Vencer (30d)</p>
                            <h3 className="text-3xl font-bold text-slate-800 mt-2">
                                {rule8ths.filter(r => {
                                    if (r.status !== 'Vigente') return false;
                                    const exp = new Date(r.expirationDate).getTime();
                                    const now = Date.now();
                                    const diffDays = (exp - now) / (1000 * 3600 * 24);
                                    return diffDays <= 30 && diffDays > 0;
                                }).length}
                            </h3>
                        </div>
                        <div className="p-3 bg-amber-50 text-amber-600 rounded-lg">
                            <AlertTriangle size={24} />
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-slate-500">Discrepancias vs Masterdata</p>
                            <h3 className="text-3xl font-bold text-slate-800 mt-2">
                                {rule8ths.filter(r => r.masterdataMatch === 'mismatched').length}
                            </h3>
                        </div>
                        <div className="p-3 bg-red-50 text-red-600 rounded-lg">
                            <Database size={24} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Table and Filters */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col min-h-[500px]">
                <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setIsQueryBuilderOpen(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition"
                        >
                            <Filter size={18} />
                            Filtros Avanzados
                            {activeFilters.length > 0 && (
                                <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-2 py-0.5 rounded-full">
                                    {activeFilters.length}
                               </span>
                            )}
                        </button>
                        {activeFilters.length > 0 && (
                            <button
                                onClick={() => setActiveFilters([])}
                                className="text-sm text-slate-500 hover:text-red-600 transition font-medium"
                            >
                                Limpiar
                            </button>
                        )}
                    </div>
                    <button
                        onClick={handleExportCSV}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white font-medium rounded-lg hover:bg-slate-900 transition"
                    >
                        <Download size={18} />
                        Exportar a CSV
                    </button>
                </div>
                
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap border-collapse border border-slate-200">
                        <thead>
                            <tr>
                                <th className="px-4 py-3 text-center w-10 border-r border-slate-200 bg-slate-50">
                                    <input 
                                        type="checkbox" 
                                        className="rounded text-indigo-600 focus:ring-indigo-500"
                                        checked={filteredRules.length > 0 && selectedRows.length === filteredRules.length}
                                        onChange={handleSelectAll}
                                    />
                                </th>
                                <ResizableHeader minWidth="80px">Folio</ResizableHeader>
                                <ResizableHeader minWidth="130px">Fracción Original</ResizableHeader>
                                <ResizableHeader minWidth="130px">Fracción Declarar</ResizableHeader>
                                <ResizableHeader minWidth="130px">Permiso Previo</ResizableHeader>
                                <ResizableHeader minWidth="200px">Descripción R8</ResizableHeader>
                                <ResizableHeader minWidth="100px">Saldo UM</ResizableHeader>
                                <ResizableHeader minWidth="100px">Valor USD</ResizableHeader>
                                <ResizableHeader minWidth="100px">Emisión</ResizableHeader>
                                <ResizableHeader minWidth="100px">Vigencia</ResizableHeader>
                                <ResizableHeader minWidth="100px">Estatus</ResizableHeader>
                                <th className="px-4 py-3 text-center border-l border-slate-200 bg-slate-50 text-slate-600 font-medium">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 border-b border-slate-200">
                            {filteredRules.length === 0 ? (
                                <tr>
                                    <td colSpan={16} className="px-4 py-8 text-center text-slate-500">
                                        No hay oficios registrados. Carga un PDF para empezar.
                                    </td>
                                </tr>
                            ) : (
                                filteredRules.map((rule) => {
                                    const isPermisoOk  = rule.masterdataMatch === 'exact' || rule.masterdataMatch === 'matched' || rule.masterdataMatch === 'desc_mismatch';

                                    return (
                                        <tr key={rule.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-4 py-3 text-center border-r border-slate-200">
                                                <input 
                                                    type="checkbox" 
                                                    className="rounded text-indigo-600 focus:ring-indigo-500"
                                                    checked={selectedRows.includes(rule.id!)}
                                                    onChange={() => handleSelectRow(rule.id!)}
                                                />
                                            </td>
                                            <td className="px-4 py-3 font-medium text-slate-700">{rule.folio}</td>
                                            <td className="px-4 py-3">
                                                <span className="font-mono text-slate-600">{rule.originalTariffFraction}</span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded-md" title="Fracción Arancelaria a Declarar en Pedimento">
                                                    {rule.fraccionReglaOctava || 'Sin R8'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 font-mono text-slate-600 text-sm">
                                                <div className="flex items-center gap-2">
                                                    <span>{rule.permisoPrevio || 'N/A'}</span>
                                                    {isPermisoOk && (
                                                        <ShieldCheck size={16} className="text-green-500 flex-shrink-0" />
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 whitespace-normal min-w-[200px]">
                                                <div className="text-xs text-slate-500">
                                                    {rule.description}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex flex-col">
                                                    <span className={`font-medium ${rule.totalAuthorized > 0 ? 'text-slate-700' : 'text-slate-400'}`}>
                                                        {rule.totalAuthorized > 0 ? `${rule.balance.toLocaleString()} ${rule.unidadMedida?.substring(0,3).toUpperCase() || 'UM'}` : `0 ${rule.unidadMedida?.substring(0,3).toUpperCase() || 'UM'}`}
                                                    </span>
                                                    <span className={`text-[10px] ${rule.totalAuthorized > 0 ? 'text-slate-500' : 'text-slate-400'}`}>
                                                        {rule.totalAuthorized > 0 ? `de ${rule.totalAuthorized.toLocaleString()} ${rule.unidadMedida?.substring(0,3).toUpperCase() || 'UM'}` : 'Por calcular'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className={`px-4 py-3 font-medium ${rule.valorDolares && rule.valorDolares > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                                                {rule.valorDolares && rule.valorDolares > 0 ? `$${(rule.valorDolares - (rule.valorDolaresEjercido || 0)).toLocaleString()}` : '$0'}
                                            </td>
                                            <td className="px-4 py-3">
                                                {new Date(rule.issueDate).toLocaleDateString()}
                                            </td>
                                            <td className="px-4 py-3">
                                                {new Date(rule.expirationDate).toLocaleDateString()}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                                    rule.status === 'Vigente' ? 'bg-green-100 text-green-700' :
                                                    rule.status === 'Vencida' ? 'bg-red-100 text-red-700' :
                                                    'bg-slate-100 text-slate-700'
                                                }`}>
                                                    {rule.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center border-l border-slate-200">
                                                <button
                                                    onClick={() => handleDeleteRule(rule.id!)}
                                                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="Eliminar Registro"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            <CatalogQueryBuilder
                columns={['folio', 'originalTariffFraction', 'fraccionReglaOctava', 'status']}
                conditions={conditions}
                setConditions={setConditions}
                onApply={() => {
                    setActiveFilters(conditions);
                    setIsQueryBuilderOpen(false);
                }}
                onClear={() => {
                    setConditions([{ id: '1', column: 'folio', operator: 'in', type: 'string', input: '' }]);
                    setActiveFilters([]);
                    setIsQueryBuilderOpen(false);
                }}
            />
        </div>
    );
};
