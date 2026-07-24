import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { FileText, Search, Download, RefreshCw, RotateCcw, Trash2, Filter, ChevronDown, Database, X, Plus, AlertCircle, Calendar } from 'lucide-react';
import { storageService } from '../services/storageService.ts';
import { XMLCIRecord } from '../types.ts';
import { useNotification } from '../context/NotificationContext.tsx';

interface QueryCondition {
    id: string;
    column: string;
    operator: string;
    type: 'string' | 'number' | 'boolean';
    input: string;
}

export const XMLCI: React.FC = () => {
    const { showNotification } = useNotification();
    const [records, setRecords] = useState<XMLCIRecord[]>([]);
    const [loading, setLoading] = useState(false);

    // Search & Filter State
    const [searchTerm, setSearchTerm] = useState('');
    const [activeSearch, setActiveSearch] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Advanced Query Builder State
    const [isQueryBuilderOpen, setIsQueryBuilderOpen] = useState(false);
    const [queryConditions, setQueryConditions] = useState<QueryCondition[]>([
        { id: Date.now().toString(), column: 'invoiceNo', operator: 'in', type: 'string', input: '' }
    ]);
    const [appliedConditions, setAppliedConditions] = useState<QueryCondition[]>([]);
    const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);

    // Selection State
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Resizable Columns State
    const [columnWidths, setColumnWidths] = useState<Record<string, number>>({
        select: 40,
        acciones: 50,
        idFiscal: 140,
        nombre: 250,
        domicilio: 250,
        vinc: 60,
        factura: 140,
        fecha: 110,
        incoterm: 100,
        moneda: 80,
        valMon: 130,
        factor: 100,
        valUsd: 130,
        uuid: 250
    });

    const resizingColumn = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

    const onMouseDown = (key: string, e: React.MouseEvent) => {
        const th = (e.currentTarget as HTMLElement).parentElement;
        if (!th) return;
        resizingColumn.current = {
            key,
            startX: e.pageX,
            startWidth: columnWidths[key] || th.offsetWidth
        };
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        document.body.style.cursor = 'col-resize';
    };

    const onMouseMove = useCallback((e: MouseEvent) => {
        if (!resizingColumn.current) return;
        const { key, startX, startWidth } = resizingColumn.current;
        const newWidth = Math.max(40, startWidth + (e.pageX - startX));
        setColumnWidths(prev => ({ ...prev, [key]: newWidth }));
    }, []);

    const onMouseUp = useCallback(() => {
        resizingColumn.current = null;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = 'default';
    }, [onMouseMove]);


    useEffect(() => {
        loadRecords();
    }, [activeSearch]);

    const loadRecords = async () => {
        const terms = activeSearch.split(/[,\n]/).map(s => s.trim().toUpperCase()).filter(s => s.length > 0);
        if (terms.length === 0) {
            setRecords([]);
            setLoading(false);
            return;
        }
        
        setLoading(true);
        try {
            const data = await storageService.searchXMLCIRecordsByPrefix(terms);
            setRecords(data);
        } catch (error) {
            console.error("Error loading XMLCI records:", error);
            showNotification('Error', 'No se pudieron cargar los registros de XMLCI.', 'error');
        } finally {
            setLoading(false);
        }
    };


    const filteredRecords = useMemo(() => {
        return records.filter(r => {
            if (startDate || endDate) {
                const itemDateStr = r.fecha || '';
                const parseToISO = (d: any) => {
                    if (!d) return '';
                    if (typeof d === 'object' && d.seconds !== undefined) {
                        try {
                            return new Date(d.seconds * 1000).toISOString().split('T')[0];
                        } catch (e) { return ''; }
                    }
                    let clean = String(d).trim();
                    if (!clean || clean === '[object Object]') return '';

                    // Handle 'Jan-17th,2026' or similar (English months with ordinal suffixes)
                    if (/[a-zA-Z]/.test(clean)) {
                        let normalized = clean
                            .replace(/-/g, ' ')
                            .replace(/,/g, ' ')
                            .replace(/(\d+)(st|nd|rd|th)/i, '$1') // 17th -> 17
                            .replace(/\s+/g, ' ')
                            .trim();
                        try {
                            const date = new Date(normalized);
                            if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
                        } catch (e) { }
                    }

                    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
                    const separator = clean.includes('/') ? '/' : clean.includes('-') ? '-' : null;
                    if (separator) {
                        const parts = clean.split(separator).map(p => p.trim());
                        if (parts.length === 3) {
                            if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
                            if (parts[2].length === 4) {
                                let day = parts[0], month = parts[1];
                                const p0 = parseInt(parts[0]), p1 = parseInt(parts[1]);
                                if (p1 > 12 && p0 <= 12) { month = parts[0]; day = parts[1]; }
                                return `${parts[2]}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                            }
                        }
                    }
                    try {
                        const date = new Date(clean);
                        if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
                    } catch (e) { }
                    return '';
                };

                const itemISO = parseToISO(itemDateStr);
                if (itemISO) {
                    if (startDate && itemISO < startDate) return false;
                    if (endDate && itemISO > endDate) return false;
                } else if (startDate || endDate) {
                    return false;
                }
            }

            if (searchTerm.trim()) {
                // Split by comma OR newline
                const rawTerms = searchTerm.split(/[\n,]/).map(v => v.trim()).filter(v => v !== '');
                if (rawTerms.length > 0) {
                    const norm = (s: string) =>
                        s.toUpperCase().replace(/O/g, '0').replace(/I/g, '1').replace(/G/g, '6');
                    const storedUUIDNorm = norm(r.uuid || '').toLowerCase();

                    const searchableContent = [
                        r.idFiscal, r.nombre, r.domicilio, r.invoiceNo, r.fecha, r.incoterm,
                        r.moneda, (r.uuid || '').toLowerCase(), (r as any).archivo,
                        r.valMonFact, r.valDolares, r.totalAduana, r.fletes, r.seguros,
                        r.embalajes, r.otrosIncrementables, r.descuentos
                    ].map(v => (v || '').toString().toLowerCase());

                    // OR logic: match any term against any field
                    const matchesSearch = rawTerms.some(term => {
                        const tLow = term.toLowerCase();
                        const tNorm = norm(term).toLowerCase();
                        if (searchableContent.some(c => c.includes(tLow))) return true;
                        if (storedUUIDNorm.includes(tNorm)) return true;
                        return false;
                    });
                    if (!matchesSearch) return false;
                }
            }

            if (appliedConditions.length > 0) {
                const matchesConditions = appliedConditions.every(cond => {
                    const rawVal = (r as any)[cond.column];

                    if (cond.operator === 'empty') {
                        return rawVal === null || rawVal === undefined || String(rawVal).trim() === '';
                    }
                    if (cond.operator === 'not_empty') {
                        return rawVal !== null && rawVal !== undefined && String(rawVal).trim() !== '';
                    }

                    const inputLines = (cond.input || '').split(/[\r\n,;\t]+/).map(t => t.trim()).filter(t => t.length > 0);
                    if (inputLines.length === 0) return true;

                    const normalizeStrict = (s: any) => String(s || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
                    const normUUID = (s: string) => s.toUpperCase().replace(/O/g, '0').replace(/I/g, '1').replace(/G/g, '6').toLowerCase();

                    if (cond.operator === 'in') {
                        const colNorm = normalizeStrict(rawVal);
                        const colUUIDNorm = normUUID(String(rawVal || ''));
                        // For uuid column: use substring + char normalization; for others: exact match
                        if (cond.column === 'uuid') {
                            return inputLines.some(l =>
                                colNorm.includes(normalizeStrict(l)) ||
                                colUUIDNorm.includes(normUUID(l))
                            );
                        }
                        const set = new Set(inputLines.map(l => normalizeStrict(l)));
                        return set.has(colNorm);
                    }

                    const cast = (val: any) => {
                        if (cond.type === 'number') return parseFloat(String(val || '0')) || 0;
                        if (cond.type === 'boolean') {
                            const s = normalizeStrict(val);
                            return s === 'true' || s === 'yes' || s === 'y' || s === 's' || s === 'si' ? true : false;
                        }
                        return cond.type === 'string' ? normalizeStrict(val) : String(val || '').trim();
                    };

                    const itemVal = cast(rawVal);

                    const matchesLine = (lineStr: string) => {
                        const targetVal = cast(lineStr);
                        switch (cond.operator) {
                            case '==': return itemVal === targetVal;
                            case '!=': return itemVal !== targetVal;
                            case '>': return itemVal > targetVal;
                            case '>=': return itemVal >= targetVal;
                            case '<': return itemVal < targetVal;
                            case '<=': return itemVal <= targetVal;
                            case 'contains': return String(itemVal).includes(String(targetVal));
                            case 'not_contains': return !String(itemVal).includes(String(targetVal));
                            default: return true;
                        }
                    };

                    if (cond.operator === '!=' || cond.operator === 'not_contains') {
                        return inputLines.every(matchesLine);
                    } else {
                        return inputLines.some(matchesLine);
                    }
                });
                if (!matchesConditions) return false;
            }

            return true;
        });
    }, [records, searchTerm, startDate, endDate, appliedConditions]);

    const totals = useMemo(() => {
        return filteredRecords.reduce((acc, r) => {
            acc.valMonFact += r.valMonFact || 0;
            acc.valDolares += r.valDolares || 0;
            return acc;
        }, { valMonFact: 0, valDolares: 0 });
    }, [filteredRecords]);

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedIds(new Set(filteredRecords.map(r => r.id)));
        } else {
            setSelectedIds(new Set());
        }
    };

    const handleSelectRow = (id: string) => {
        const newSelected = new Set(selectedIds);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedIds(newSelected);
    };

    const addQueryCondition = () => {
        setQueryConditions([...queryConditions, { id: Date.now().toString(), column: 'invoiceNo', operator: 'in', type: 'string', input: '' }]);
    };

    const removeQueryCondition = (id: string) => {
        if (queryConditions.length > 1) {
            setQueryConditions(queryConditions.filter(c => c.id !== id));
        }
    };

    const updateQueryCondition = (id: string, updates: Partial<QueryCondition>) => {
        setQueryConditions(queryConditions.map(c => c.id === id ? { ...c, ...updates } : c));
    };

    const applyAdvancedQuery = () => {
        setAppliedConditions(queryConditions);
        setIsQueryBuilderOpen(false);
    };

    const resetQueryBuilder = () => {
        const initialCondition: QueryCondition = { id: Date.now().toString(), column: 'invoiceNo', operator: 'in', type: 'string', input: '' };
        setQueryConditions([initialCondition]);
        setAppliedConditions([]);
    };

    const esc = (v: any) => {
        if (v === null || v === undefined) return "";
        let s = String(v);
        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
            return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
    };

    const handleExportCSV = () => {
        let itemsToExport = records.filter(r => selectedIds.has(r.id));
        if (selectedIds.size === 0) {
            showNotification('Atención', "Selecciona al menos un registro para exportar.", 'info');
            return;
        }

        try {
            const headers = [
                "ID FISCAL", "NOMBRE", "DOMICILIO", "VINCULACIÓN",
                "NUM. FACTURA", "ARCHIVO", "FECHA", "INCOTERM", "MONEDA",
                "VAL. MON. FACT.", "FACTOR MON.", "VAL. DOLARES", "UUID"
            ];

            const rows = itemsToExport.map(r => [
                r.idFiscal,
                r.nombre,
                r.domicilio,
                r.vinculacion,
                r.invoiceNo,
                (r as any).archivo || '',
                r.fecha,
                r.incoterm,
                r.moneda,
                r.valMonFact.toFixed(2),
                r.factorMoneda.toFixed(4),
                r.valDolares.toFixed(2),
                r.uuid
            ]);

            const csvContent = "\uFEFF" + headers.join(',') + '\n' + rows.map(row => row.map(esc).join(',')).join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            const timestamp = itemsToExport[0]?.invoiceNo || new Date().toISOString().split('T')[0];

            link.setAttribute('href', url);
            link.setAttribute('download', `XMLCI_Export_${timestamp}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            showNotification('Éxito', `Exportación de ${itemsToExport.length} facturas completada.`, 'success');
        } catch (error) {
            console.error("Export Error:", error);
            showNotification('Error', 'Falló la generación del CSV.', 'error');
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await storageService.deleteXMLCIRecord(id);
            setRecords(records.filter(r => r.id !== id));
            showNotification('Eliminado', 'Registro eliminado correctamente.', 'info');
        } catch (e) {
            showNotification('Error', 'No se pudo eliminar el registro.', 'error');
        }
    };

    const handleBulkDelete = async () => {
        if (selectedIds.size === 0) return;
        try {
            const idsToDelete = Array.from(selectedIds) as string[];
            await storageService.deleteXMLCIRecords(idsToDelete);
            setRecords(prev => prev.filter(r => !selectedIds.has(r.id)));
            setSelectedIds(new Set());
            setIsBulkDeleteModalOpen(false);
            showNotification('Éxito', `Se han eliminado ${idsToDelete.length} registros.`, 'success');
        } catch (err) {
            console.error(err);
            showNotification('Error', 'No se pudieron eliminar los registros.', 'error');
        }
    };

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
            {/* Header */}
            <header className="bg-white border-b border-slate-200 px-8 py-5 flex-shrink-0 flex justify-between items-center z-10">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
                        <FileText className="text-blue-600" size={28} />
                        XMLCI (Consolidated Summary)
                    </h1>
                    <p className="text-slate-500 mt-1">Resumen consolidado de facturas extraídas de XML.</p>
                </div>

                <div className="flex items-center gap-4">


                    {selectedIds.size > 0 && (
                        <>
                            <button
                                onClick={() => setIsBulkDeleteModalOpen(true)}
                                className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium transition-all bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 animate-in fade-in slide-in-from-right-4"
                            >
                                <Trash2 size={20} />
                                <span>Eliminar Seleccionados ({selectedIds.size})</span>
                            </button>
                            <button
                                onClick={handleExportCSV}
                                className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium transition-all bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/20 shadow-lg animate-in fade-in slide-in-from-right-4"
                            >
                                <Download size={20} />
                                <span>Exportar Seleccionados (CSV) ({selectedIds.size})</span>
                            </button>
                        </>
                    )}



                    <button
                        onClick={loadRecords}
                        className="p-2.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all duration-200"
                        title="Refrescar datos"
                    >
                        <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </header>

            {/* Toolbar */}
            <div className="bg-white border-b border-slate-200 px-8 py-4 flex items-center gap-6 justify-between flex-shrink-0">
                <div className="flex items-center gap-6 flex-1 max-w-5xl">
                    <div className="relative flex-1 group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={20} />
                        <input
                            type="text"
                            placeholder="Buscar registros (Prefijo para BD)..."
                            className="w-full pl-10 pr-24 py-2 bg-white border-2 border-slate-100 rounded-xl focus:border-blue-500 transition-colors text-sm outline-none"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    setActiveSearch(searchTerm);
                                }
                            }}
                        />
                        <button
                            onClick={() => setActiveSearch(searchTerm)}
                            className="absolute right-1 top-1/2 transform -translate-y-1/2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-md text-xs font-bold transition-colors"
                        >
                            Buscar
                        </button>
                        {searchTerm && (
                            <button
                                onClick={() => setSearchTerm('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 transition-colors"
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>

                    <button
                        onClick={() => setIsQueryBuilderOpen(true)}
                        className={`flex items-center gap-2 px-4 py-2 border rounded-xl transition-all font-medium whitespace-nowrap ${appliedConditions.length > 0 ? 'bg-blue-50 border-blue-200 text-blue-600 shadow-sm' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                        <Filter size={18} />
                        Query Builder {appliedConditions.length > 0 && `(${appliedConditions.length})`}
                    </button>

                    <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-xl px-3 py-1.5 shadow-sm transition-all focus-within:ring-2 focus-within:ring-blue-500/20">
                        <Calendar size={14} className="text-slate-400" />
                        <input
                            type="date"
                            className="bg-transparent border-none text-xs text-slate-600 focus:ring-0 outline-none p-0 cursor-pointer"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                        />
                        <span className="text-slate-300 text-[10px] font-bold uppercase">to</span>
                        <input
                            type="date"
                            className="bg-transparent border-none text-xs text-slate-600 focus:ring-0 outline-none p-0 cursor-pointer"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                        />
                        {(startDate || endDate) && (
                            <button
                                onClick={() => { setStartDate(''); setEndDate(''); }}
                                className="text-[10px] text-red-500 hover:text-red-700 font-bold ml-1 transition-colors"
                                title="Clear Dates"
                            >
                                <X size={12} />
                            </button>
                        )}
                    </div>
                </div>

                <div className="text-sm font-medium text-slate-500 flex items-center gap-2">
                    <span className="bg-slate-100 px-3 py-1 rounded-full">{filteredRecords.length} registros</span>
                    {selectedIds.size > 0 && (
                        <span className="bg-emerald-50 text-emerald-600 px-3 py-1 rounded-full border border-emerald-100 animate-in zoom-in-95">
                            {selectedIds.size} seleccionados
                        </span>
                    )}
                </div>
            </div>

            {/* Data Table */}
            <div className="flex-1 overflow-auto p-8 pt-6">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200 font-bold text-[11px] text-slate-600 uppercase tracking-wider">
                                    <th className="sticky top-0 z-20 bg-slate-50 px-2 py-3 w-8 text-center border-b border-slate-200 group relative" style={{ width: columnWidths['select'] || 40 }}>
                                        <input
                                            type="checkbox"
                                            className="w-3 h-3 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                            checked={filteredRecords.length > 0 && selectedIds.size === filteredRecords.length}
                                            onChange={handleSelectAll}
                                        />
                                        <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => onMouseDown('select', e)} />
                                    </th>
                                    <th className="sticky top-0 z-20 bg-slate-50 px-2 py-3 text-center border-b border-slate-200 group relative" style={{ width: columnWidths['acciones'] || 50 }}>
                                        Acc.
                                        <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => onMouseDown('acciones', e)} />
                                    </th>
                                    <th className="sticky top-0 z-20 bg-slate-50 px-2 py-3 border-b border-slate-200 group relative" style={{ width: columnWidths['idFiscal'] || 140 }}>
                                        ID Fiscal
                                        <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => onMouseDown('idFiscal', e)} />
                                    </th>
                                    <th className="sticky top-0 z-20 bg-slate-50 px-2 py-3 border-b border-slate-200 group relative" style={{ width: columnWidths['nombre'] || 250 }}>
                                        Proveedor
                                        <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => onMouseDown('nombre', e)} />
                                    </th>
                                    <th className="sticky top-0 z-20 bg-slate-50 px-2 py-3 border-b border-slate-200 group relative" style={{ width: columnWidths['domicilio'] || 250 }}>
                                        Domicilio
                                        <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => onMouseDown('domicilio', e)} />
                                    </th>
                                    <th className="sticky top-0 z-20 bg-slate-50 px-2 py-3 border-b border-slate-200 text-center group relative" style={{ width: columnWidths['vinc'] || 60 }}>
                                        Vinc.
                                        <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => onMouseDown('vinc', e)} />
                                    </th>
                                    <th className="sticky top-0 z-20 bg-slate-50 px-2 py-3 border-b border-slate-200 group relative" style={{ width: columnWidths['factura'] || 140 }}>
                                        Factura
                                        <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => onMouseDown('factura', e)} />
                                    </th>
                                    <th className="sticky top-0 z-20 bg-slate-50 px-2 py-3 border-b border-slate-200 group relative" style={{ width: columnWidths['archivo'] || 180 }}>
                                        Archivo
                                        <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => onMouseDown('archivo', e)} />
                                    </th>
                                    <th className="sticky top-0 z-20 bg-slate-50 px-2 py-3 border-b border-slate-200 group relative" style={{ width: columnWidths['fecha'] || 110 }}>
                                        Fecha
                                        <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => onMouseDown('fecha', e)} />
                                    </th>
                                    <th className="sticky top-0 z-20 bg-slate-50 px-2 py-3 border-b border-slate-200 group relative" style={{ width: columnWidths['incoterm'] || 100 }}>
                                        Incoterm
                                        <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => onMouseDown('incoterm', e)} />
                                    </th>
                                    <th className="sticky top-0 z-20 bg-slate-50 px-2 py-3 border-b border-slate-200 text-center group relative" style={{ width: columnWidths['moneda'] || 80 }}>
                                        Moneda
                                        <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => onMouseDown('moneda', e)} />
                                    </th>
                                    <th className="sticky top-0 z-20 bg-slate-50 px-2 py-3 border-b border-slate-200 text-right group relative" style={{ width: columnWidths['valMon'] || 130 }}>
                                        Val. Moneda
                                        <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => onMouseDown('valMon', e)} />
                                    </th>
                                    <th className="sticky top-0 z-20 bg-slate-50 px-2 py-3 border-b border-slate-200 text-right group relative" style={{ width: columnWidths['factor'] || 100 }}>
                                        Factor
                                        <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => onMouseDown('factor', e)} />
                                    </th>
                                    <th className="sticky top-0 z-20 bg-slate-50 px-2 py-3 border-b border-slate-200 text-right group relative" style={{ width: columnWidths['valUsd'] || 130 }}>
                                        Val. USD
                                        <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => onMouseDown('valUsd', e)} />
                                    </th>
                                    <th className="sticky top-0 z-20 bg-slate-50 px-2 py-3 border-b border-slate-200 group relative" style={{ width: columnWidths['uuid'] || 250 }}>
                                        UUID
                                        <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => onMouseDown('uuid', e)} />
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading ? (
                                    <tr>
                                        <td colSpan={15} className="p-20 text-center text-slate-400">
                                            <div className="flex flex-col items-center gap-3">
                                                <RefreshCw className="animate-spin" size={32} />
                                                <p>Sincronizando...</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : filteredRecords.length > 0 ? (
                                    filteredRecords.map((record) => (
                                        <tr
                                            key={record.id}
                                            className={`hover:bg-slate-50 transition-colors border-b border-slate-100 text-[11px] ${selectedIds.has(record.id) ? 'bg-blue-50/20' : ''}`}
                                            onClick={() => handleSelectRow(record.id)}
                                        >
                                            <td className="px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                                                <input
                                                    type="checkbox"
                                                    className="w-3 h-3 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                    checked={selectedIds.has(record.id)}
                                                    onChange={() => handleSelectRow(record.id)}
                                                />
                                            </td>
                                            <td className="px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    onClick={() => handleDelete(record.id)}
                                                    className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </td>
                                            <td className="px-2 py-2 text-slate-600 font-mono">{record.idFiscal}</td>
                                            <td className="px-2 py-2 text-slate-800 font-semibold truncate" style={{ maxWidth: columnWidths['nombre'] || 250 }} title={record.nombre}>{record.nombre}</td>
                                            <td className="px-2 py-2 text-slate-500 truncate" style={{ maxWidth: columnWidths['domicilio'] || 250 }} title={record.domicilio}>{record.domicilio}</td>
                                            <td className="px-2 py-2 text-center">
                                                <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded font-bold text-[9px]">{record.vinculacion}</span>
                                            </td>
                                            <td className="px-2 py-2 text-slate-700 font-bold">{record.invoiceNo}</td>
                                            <td className="px-2 py-2 text-slate-500 text-[10px] truncate" style={{ maxWidth: columnWidths['archivo'] || 180 }} title={(record as any).archivo || ''}>{(record as any).archivo || '-'}</td>
                                            <td className="px-2 py-2 text-slate-500">{record.fecha}</td>
                                            <td className="px-2 py-2 text-amber-700 font-bold uppercase">{record.incoterm}</td>
                                            <td className="px-2 py-2 text-center text-slate-700 font-bold">{record.moneda}</td>
                                            <td className="px-2 py-2 text-right font-mono text-slate-700 font-bold">{record.valMonFact.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                            <td className="px-2 py-2 text-right font-mono text-slate-400 text-[10px]">{record.factorMoneda.toFixed(4)}</td>
                                            <td className="px-2 py-2 text-right">
                                                <div className="font-mono text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded inline-block">${record.valDolares.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                                            </td>
                                            <td className="px-2 py-2 text-slate-400 font-mono text-[9px] truncate" title={record.uuid}>{record.uuid}</td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={15} className="p-20 text-center text-slate-400">
                                            <div className="flex flex-col items-center gap-3">
                                                <FileText size={48} className="opacity-20" />
                                                <p>No hay registros disponibles.</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Sticky Totals Footer (Matched to Extractor style/position) */}
            <div className="bg-blue-600 px-8 py-3 flex-shrink-0 z-20 flex justify-end items-center gap-10 text-white shadow-[0_-4px_20px_rgba(37,99,235,0.2)]">
                <div className="flex flex-col items-end">
                    <span className="text-[10px] font-bold opacity-70 uppercase tracking-widest">Total Moneda Factura</span>
                    <span className="text-sm font-mono font-bold leading-none">{totals.valMonFact.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex flex-col items-end border-l border-blue-400/50 pl-10 ml-2">
                    <span className="text-[10px] font-bold opacity-70 uppercase tracking-widest">Total en Dólares (USD)</span>
                    <span className="text-xl font-mono font-black leading-none">${totals.valDolares.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
            </div>

            {/* Bulk Delete Modal */}
            {isBulkDeleteModalOpen && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6">
                            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center text-red-600 mb-4">
                                <AlertCircle size={24} />
                            </div>
                            <h3 className="text-xl font-bold text-slate-800 mb-2">¿Eliminar registros?</h3>
                            <p className="text-slate-600 mb-6">
                                Estás a punto de eliminar <span className="font-bold text-red-600">{selectedIds.size}</span> resúmenes de factura de forma permanente.
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setIsBulkDeleteModalOpen(false)}
                                    className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleBulkDelete}
                                    className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl transition-colors shadow-lg shadow-red-500/20"
                                >
                                    Eliminar Ahora
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Advanced Query Builder Modal */}
            {isQueryBuilderOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
                        <div className="bg-slate-50 p-6 border-b border-slate-100 flex justify-between items-center">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                    <Database size={20} className="text-indigo-600" />
                                    Advanced Query Builder (XMLCI)
                                </h3>
                                <p className="text-xs text-slate-500 mt-1">Combine multiple filters to find specific invoices.</p>
                            </div>
                            <button onClick={() => setIsQueryBuilderOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                        </div>

                        <div className="p-6 flex-1 overflow-y-auto space-y-6 bg-white">
                            {queryConditions.map((cond, index) => (
                                <div key={cond.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200 relative group animate-in slide-in-from-top-2 duration-200">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold">
                                            {index + 1}
                                        </div>
                                        <div className="h-px flex-1 bg-slate-200"></div>
                                        {queryConditions.length > 1 && (
                                            <button
                                                onClick={() => removeQueryCondition(cond.id)}
                                                className="text-slate-400 hover:text-red-500 transition-colors"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Column</label>
                                            <select
                                                className="w-full border border-slate-300 rounded-lg p-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500"
                                                value={cond.column}
                                                onChange={(e) => updateQueryCondition(cond.id, { column: e.target.value })}
                                            >
                                                <option value="idFiscal">RFC / ID Fiscal</option>
                                                <option value="nombre">Nombre Proveedor</option>
                                                <option value="invoiceNo">Num. Factura</option>
                                                <option value="incoterm">Incoterm</option>
                                                <option value="uuid">UUID</option>
                                                <option value="domicilio">Domicilio</option>
                                                <option value="fecha">Fecha</option>
                                                <option value="moneda">Moneda</option>
                                                <option value="valMonFact">Val Mon Fact</option>
                                                <option value="valDolares">Val Dólares</option>
                                                <option value="totalAduana">Total Aduana</option>
                                                <option value="fletes">Fletes</option>
                                                <option value="seguros">Seguros</option>
                                                <option value="embalajes">Embalajes</option>
                                                <option value="otrosIncrementables">Otros Incrementables</option>
                                                <option value="descuentos">Descuentos</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Operator</label>
                                            <select
                                                className="w-full border border-slate-300 rounded-lg p-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500"
                                                value={cond.operator}
                                                onChange={(e) => updateQueryCondition(cond.id, { operator: e.target.value })}
                                            >
                                                <option value="in">(in) in list</option>
                                                <option value="==">(==) equal to</option>
                                                <option value="!=">(!=) not equal to</option>
                                                <option value="contains">contains</option>
                                                <option value="not_contains">not contains</option>
                                                <option value="empty">is empty / null</option>
                                                <option value="not_empty">is NOT empty</option>
                                                <option value=">">( {'>'} ) greater than</option>
                                                <option value=">=">( {'>='} ) greater or equal</option>
                                                <option value="<">( {'<'} ) less than</option>
                                                <option value="<=">( {'<='} ) less or equal</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Data Type</label>
                                            <select
                                                className="w-full border border-slate-300 rounded-lg p-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:bg-slate-50"
                                                value={cond.type}
                                                disabled={cond.operator === 'empty' || cond.operator === 'not_empty'}
                                                onChange={(e) => updateQueryCondition(cond.id, { type: e.target.value as any })}
                                            >
                                                <option value="string">String (Text)</option>
                                                <option value="number">Number</option>
                                                <option value="boolean">Boolean (Y/N/Boolean)</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                                            {cond.operator === 'empty' || cond.operator === 'not_empty'
                                                ? 'Value (Not required for this operator)'
                                                : cond.operator === 'in' ? 'Values (One per line or comma-separated)' : 'Target Value'
                                            }
                                        </label>
                                        <textarea
                                            className="w-full border border-slate-300 rounded-lg p-3 font-mono text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none min-h-[80px] disabled:bg-slate-100 disabled:cursor-not-allowed"
                                            placeholder={cond.operator === 'empty' || cond.operator === 'not_empty' ? "N/A" : cond.operator === 'in' ? "Example:\nValue 1\nValue 2" : "Enter value..."}
                                            value={cond.operator === 'empty' || cond.operator === 'not_empty' ? '' : cond.input}
                                            disabled={cond.operator === 'empty' || cond.operator === 'not_empty'}
                                            onChange={(e) => updateQueryCondition(cond.id, { input: e.target.value })}
                                        />
                                    </div>
                                </div>
                            ))}

                            <button
                                onClick={addQueryCondition}
                                className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 transition-all flex items-center justify-center gap-2 font-medium"
                            >
                                <Plus size={18} /> Add Another Condition
                            </button>
                        </div>

                        <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
                            <button
                                onClick={resetQueryBuilder}
                                className="text-red-600 hover:text-red-700 font-medium text-sm flex items-center gap-1"
                            >
                                <RotateCcw size={16} /> Reset All
                            </button>
                            <div className="flex gap-3">
                                <button onClick={() => setIsQueryBuilderOpen(false)} className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 font-medium">Cancel</button>
                                <button
                                    onClick={applyAdvancedQuery}
                                    className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium shadow-lg shadow-indigo-200 transition-all flex items-center gap-2"
                                >
                                    <Search size={16} /> Apply Complex Filter
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
