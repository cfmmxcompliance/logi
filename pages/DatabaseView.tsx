import React, { useState, useRef, useMemo, useEffect } from 'react';
import { storageService } from '../services/storageService.ts';
import { RawMaterialPart, UserRole } from '../types.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { Download, Plus, Save, X, Trash2, Edit2, FileSpreadsheet, FileDown, ChevronLeft, ChevronRight, Search, RefreshCcw, Database, AlertTriangle } from 'lucide-react';
import { parseCSV } from '../utils/csvHelpers.ts';
import * as XLSX from 'xlsx';
import { ProcessingModal, ProcessingState, INITIAL_PROCESSING_STATE } from '../components/ProcessingModal.tsx';

const emptyPart: RawMaterialPart = {
    id: '',
    REGIMEN: 'IMD',
    PART_NUMBER: '',
    TypeMaterial: '',
    DESCRIPTION_EN: '',
    DESCRIPCION_ES: '',
    UMC: '',
    UMT: '',
    HTSMX: '',
    HTSMXBASE: '',
    HTSMXNICO: '',
    IGI_DUTY: 0,
    PROSEC: '',
    R8: '',
    DESCRIPCION_R8: '',
    RRYNA_NON_DUTY_REQUIREMENTS: '',
    REMARKS: '',
    NETWEIGHT: 0,
    IMPORTED_OR_NOT: true,
    SENSIBLE: false,
    HTS_SerialNo: '',
    CLAVESAT: '',
    DESCRIPCION_CN: '',
    MATERIAL_CN: '',
    MATERIAL_EN: '',
    FUNCTION_CN: '',
    FUNCTION_EN: '',
    COMPANY: 'CFMOTO',
    UPDATE_TIME: ''
};

// EXACT ORDER FROM CSV FILE
const CSV_ORDER_KEYS: (keyof RawMaterialPart)[] = [
    'PART_NUMBER',
    'REGIMEN',
    'TypeMaterial',
    'DESCRIPTION_EN',
    'DESCRIPCION_ES',
    'UMC',
    'UMT',
    'HTSMX',
    'HTSMXBASE',
    'HTSMXNICO',
    'IGI_DUTY',
    'PROSEC',
    'R8',
    'DESCRIPCION_R8',
    'RRYNA_NON_DUTY_REQUIREMENTS',
    'REMARKS',
    'NETWEIGHT',
    'IMPORTED_OR_NOT',
    'SENSIBLE',
    'HTS_SerialNo',
    'CLAVESAT',
    'DESCRIPCION_CN',
    'MATERIAL_CN',
    'MATERIAL_EN',
    'FUNCTION_CN',
    'FUNCTION_EN',
    'COMPANY'
];

export const DatabaseView = () => {
    const { hasRole } = useAuth();
    const canEdit = hasRole([UserRole.ADMIN, UserRole.EDITOR, UserRole.OPERATOR]);
    const canDelete = hasRole([UserRole.ADMIN]);

    const [parts, setParts] = useState<RawMaterialPart[]>(storageService.getParts());
    const [searchTerm, setSearchTerm] = useState('');

    const [procState, setProcState] = useState<ProcessingState>(INITIAL_PROCESSING_STATE);

    useEffect(() => {
        setParts([...storageService.getParts()]);
        const unsub = storageService.subscribe(() => {
            setParts([...storageService.getParts()]);
        });
        return unsub;
    }, []);

    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 50;

    const [isPartModalOpen, setIsPartModalOpen] = useState(false);
    const [currentPart, setCurrentPart] = useState<RawMaterialPart>(emptyPart);
    const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean, id: string | null }>({ isOpen: false, id: null });
    const [bulkDeleteModal, setBulkDeleteModal] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const [duplicateModal, setDuplicateModal] = useState<{
        isOpen: boolean;
        newItems: RawMaterialPart[];
        conflictingItems: RawMaterialPart[];
        existingMap: Record<string, string>; // PartNo -> ID
    }>({ isOpen: false, newItems: [], conflictingItems: [], existingMap: {} });

    const fileInputRef = useRef<HTMLInputElement>(null);
    const restoreInputRef = useRef<HTMLInputElement>(null);

    const handleBackup = () => {
        storageService.backup();
    };

    const handleRestoreBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setProcState({
            isOpen: true,
            status: 'loading',
            title: 'Restoring Database',
            message: 'Reading backup file...',
            progress: 10
        });

        const reader = new FileReader();
        reader.onload = async (evt) => {
            setTimeout(async () => {
                try {
                    const jsonStr = evt.target?.result as string;
                    if (!jsonStr) throw new Error("Empty file");

                    if (window.confirm("⚠️ ¿Restaurar base de datos?\nSe reemplazarán todos los datos actuales.")) {
                        setProcState(prev => ({ ...prev, progress: 50, message: 'Importing data structure...' }));
                        // @ts-ignore
                        const success = await storageService.importDatabase(jsonStr);
                        if (success) {
                            setProcState({
                                isOpen: true,
                                status: 'success',
                                title: 'Restore Complete',
                                message: 'Database restored.',
                                progress: 100
                            });
                            setTimeout(() => setProcState(INITIAL_PROCESSING_STATE), 2000);
                        } else {
                            throw new Error("Invalid backup format.");
                        }
                    } else {
                        setProcState(INITIAL_PROCESSING_STATE);
                    }
                } catch (err: any) {
                    setProcState({
                        isOpen: true,
                        status: 'error',
                        title: 'Restore Failed',
                        message: err.message,
                        progress: 0
                    });
                }
                if (restoreInputRef.current) restoreInputRef.current.value = '';
            }, 500);
        };
        reader.readAsText(file);
    };

    const handleEditPart = (part: RawMaterialPart) => {
        setCurrentPart(part);
        setIsPartModalOpen(true);
    };
    const handleCreatePart = () => {
        setCurrentPart(emptyPart);
        setIsPartModalOpen(true);
    };
    const handleSavePart = (e: React.FormEvent) => {
        e.preventDefault();
        storageService.updatePart(currentPart);
        setIsPartModalOpen(false);
    };

    const initiateDelete = (id: string) => {
        setDeleteModal({ isOpen: true, id });
    };

    const confirmDelete = async () => {
        if (!canDelete || !deleteModal.id) return;
        try {
            await storageService.deletePart(deleteModal.id);
            setDeleteModal({ isOpen: false, id: null });
        } catch (e) {
            alert('Error eliminando el registro.');
        }
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedIds(new Set(filteredParts.map(p => p.id)));
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

    const confirmBulkDelete = async () => {
        if (!canDelete) return;
        try {
            await storageService.deleteParts(Array.from(selectedIds));
            setSelectedIds(new Set());
            setBulkDeleteModal(false);
        } catch (e) {
            alert('Error eliminando registros.');
        }
    };

    const handlePartInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        setCurrentPart(prev => ({
            ...prev,
            [name]: type === 'number' ? parseFloat(value) : value
        }));
    };

    const handleDownloadTemplate = () => {
        // Generate Template based EXACTLY on CSV_ORDER_KEYS
        const headerRow = CSV_ORDER_KEYS.join(',');
        // Sample data matching types
        const exampleRow = CSV_ORDER_KEYS.map(key => {
            if (key === 'IGI_DUTY' || key === 'NETWEIGHT') return '0';
            if (key === 'IMPORTED_OR_NOT' || key === 'SENSIBLE') return 'Y';
            return `Sample ${key}`;
        }).join(',');

        const csvContent = headerRow + '\n' + exampleRow;
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', 'plantilla_exacta.csv');
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    const handleWipeDatabase = async () => {
        if (!hasRole([UserRole.ADMIN])) return;

        const confirmCode = Math.floor(1000 + Math.random() * 9000).toString();
        const userInput = window.prompt(`⚠️ DANGER: This will delete ALL ${parts.length} records.\nType "${confirmCode}" to confirm:`);

        if (userInput !== confirmCode) {
            if (userInput) alert("Incorrect confirmation code.");
            return;
        }

        setProcState({
            isOpen: true,
            status: 'loading',
            title: 'Wiping Database',
            message: 'Deleting all records...',
            progress: 0
        });

        try {
            // Get all IDs
            const allIds = parts.map(p => p.id);
            // Batch delete in chunks of 450
            // @ts-ignore
            await storageService.deleteParts(allIds);

            setProcState({
                isOpen: true,
                status: 'success',
                title: 'Data Cleared',
                message: 'All records have been deleted.',
                progress: 100
            });
            setTimeout(() => setProcState(INITIAL_PROCESSING_STATE), 2000);
            setSelectedIds(new Set());
        } catch (err: any) {
            console.error(err);
            setProcState({
                isOpen: true,
                status: 'error',
                title: 'Error',
                message: err.message,
                progress: 0
            });
        }
    };

    const handleBulkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setProcState({
            isOpen: true,
            status: 'loading',
            title: 'Reading File',
            message: 'Scanning file...',
            progress: 10
        });

        const reader = new FileReader();

        reader.onload = async (evt) => {
            setTimeout(async () => {
                try {
                    const data = evt.target?.result;
                    if (!data) throw new Error("File is empty");

                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheetName = workbook.SheetNames[0];
                    const sheet = workbook.Sheets[sheetName];
                    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as string[][];

                    // 1. FIND HEADER ROW EXACTLY
                    let headerIndex = -1;
                    for (let i = 0; i < Math.min(rows.length, 50); i++) {
                        const rowStr = rows[i].join(',').toUpperCase();
                        // Robust check
                        if (rowStr.includes('PART_NUMBER') || rowStr.replace(/[^A-Z]/g, '').includes('PARTNUMBER')) {
                            headerIndex = i;
                            break;
                        }
                    }

                    if (headerIndex === -1) {
                        throw new Error("Formato inválido: No se encontró la columna 'PART_NUMBER'.");
                    }

                    // 2. MAP COLUMNS BY INDEX
                    const fileHeaders = rows[headerIndex].map(h => (h || '').toString().trim());
                    const mapIndices: Record<string, number> = {};

                    CSV_ORDER_KEYS.forEach(key => {
                        const target = key.toUpperCase().replace(/[^A-Z0-9]/g, '');
                        // 1. Exact Name Match
                        let idx = fileHeaders.findIndex(h => h.toUpperCase().replace(/[^A-Z0-9]/g, '') === target);

                        // 2. Fuzzy Contain Match
                        if (idx === -1) {
                            idx = fileHeaders.findIndex(h => h.toUpperCase().replace(/[^A-Z0-9]/g, '').includes(target));
                        }

                        if (idx !== -1) mapIndices[key] = idx;
                    });

                    if (mapIndices['PART_NUMBER'] === undefined) {
                        throw new Error("Columna PART_NUMBER no encontrada.");
                    }

                    setProcState(prev => ({ ...prev, progress: 30, message: 'Processing rows...' }));

                    const parsedParts: RawMaterialPart[] = [];

                    // 3. PARSE DATA
                    for (let i = headerIndex + 1; i < rows.length; i++) {
                        const row = rows[i];
                        if (!row || row.length === 0) continue;

                        const newPart: any = { ...emptyPart };
                        let hasData = false;

                        CSV_ORDER_KEYS.forEach(key => {
                            const idx = mapIndices[key];
                            if (idx !== undefined && row[idx] !== undefined) {
                                const rawVal = (row[idx] || '').toString().trim();

                                // Specific conversions
                                if (key === 'NETWEIGHT') {
                                    newPart[key] = parseFloat(rawVal) || 0;
                                }
                                else if (key === 'IGI_DUTY') {
                                    if (rawVal.toUpperCase().includes('EX')) newPart[key] = 0;
                                    else {
                                        const num = parseFloat(rawVal.replace(/[^0-9.]/g, ''));
                                        newPart[key] = isNaN(num) ? 0 : num;
                                    }
                                }
                                else if (key === 'IMPORTED_OR_NOT' || key === 'SENSIBLE') {
                                    newPart[key] = ['Y', 'YES', 'SI', 'S', 'TRUE', '1'].includes(rawVal.toUpperCase());
                                }
                                else {
                                    newPart[key] = rawVal;
                                }

                                if (rawVal) hasData = true;
                            }
                        });

                        if (hasData && newPart.PART_NUMBER) {
                            parsedParts.push(newPart);
                        }
                    }

                    if (parsedParts.length === 0) throw new Error("No data found to import.");

                    // 4. DUPLICATE CHECK logic
                    // Fetch latest parts to be sure
                    const currentParts = storageService.getParts();
                    const existingMap: Record<string, string> = {};
                    currentParts.forEach(p => {
                        if (p.PART_NUMBER) existingMap[p.PART_NUMBER] = p.id;
                    });

                    const newItems: RawMaterialPart[] = [];
                    const conflictingItems: RawMaterialPart[] = [];

                    parsedParts.forEach(p => {
                        if (existingMap[p.PART_NUMBER]) {
                            conflictingItems.push(p);
                        } else {
                            newItems.push(p);
                        }
                    });

                    if (conflictingItems.length > 0) {
                        // Open Resolution Modal
                        setDuplicateModal({
                            isOpen: true,
                            newItems,
                            conflictingItems,
                            existingMap
                        });
                        setProcState(INITIAL_PROCESSING_STATE); // Close loading modal
                    } else {
                        // No duplicates, proceed directly
                        proceedWithUpload(newItems);
                    }

                } catch (err: any) {
                    console.error(err);
                    setProcState({
                        isOpen: true,
                        status: 'error',
                        title: 'Error',
                        message: err.message,
                        progress: 0
                    });
                } finally {
                    if (fileInputRef.current) fileInputRef.current.value = '';
                }
            }, 500);
        };
        reader.readAsArrayBuffer(file);
    };



    const proceedWithUpload = async (itemsToUpload: RawMaterialPart[]) => {
        if (itemsToUpload.length === 0) return;

        setProcState({
            isOpen: true,
            status: 'loading',
            title: 'Saving Data',
            message: `Saving ${itemsToUpload.length} records...`,
            progress: 0
        });

        // @ts-ignore
        await storageService.upsertParts(itemsToUpload, (p) => {
            setProcState(prev => ({ ...prev, progress: p * 100 }));
        });

        setProcState({
            isOpen: true,
            status: 'success',
            title: 'Import Successful',
            message: `Successfully imported items.`,
            progress: 100
        });

        setTimeout(() => setProcState(INITIAL_PROCESSING_STATE), 2000);
        setDuplicateModal({ isOpen: false, newItems: [], conflictingItems: [], existingMap: {} });
    };

    const handleResolveDuplicates = (action: 'replace' | 'skip') => {
        const { newItems, conflictingItems, existingMap } = duplicateModal;
        let finalUploadList = [...newItems];

        if (action === 'replace') {
            // Check: map duplicate items to their EXISTING IDs so we overwrite them
            const updates = conflictingItems.map(p => ({
                ...p,
                id: existingMap[p.PART_NUMBER] // CRITICAL: Use existing ID to force update
            }));
            finalUploadList = [...finalUploadList, ...updates];
        }
        // If 'skip', we just upload 'newItems' and ignore 'conflictingItems'

        proceedWithUpload(finalUploadList);
    };

    const filteredParts = useMemo(() => {
        if (!searchTerm) return parts;
        const lower = searchTerm.toLowerCase();
        return parts.filter(p =>
            (p.PART_NUMBER && String(p.PART_NUMBER).toLowerCase().includes(lower)) ||
            (p.DESCRIPTION_EN && String(p.DESCRIPTION_EN).toLowerCase().includes(lower)) ||
            (p.DESCRIPCION_ES && String(p.DESCRIPCION_ES).toLowerCase().includes(lower))
        );
    }, [parts, searchTerm]);

    // --- NEW EXPORT FUNCTIONALITY ---
    const handleExportFiltered = () => {
        if (filteredParts.length === 0) {
            alert("No hay datos para exportar con los filtros actuales.");
            return;
        }

        // 1. Headers
        const headerRow = CSV_ORDER_KEYS.join(',');

        // 2. Data Rows
        const dataRows = filteredParts.map(part => {
            return CSV_ORDER_KEYS.map(key => {
                let val = (part as any)[key];

                // Handle specific types
                if (val === null || val === undefined) return '';
                if (typeof val === 'boolean') return val ? 'Y' : 'N';

                // Escape CSV special characters
                const strVal = String(val);
                if (strVal.includes(',') || strVal.includes('"') || strVal.includes('\n')) {
                    return `"${strVal.replace(/"/g, '""')}"`;
                }
                return strVal;
            }).join(',');
        });

        const csvContent = '\uFEFF' + [headerRow, ...dataRows].join('\n'); // Add BOM for Excel support
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

        const timestamp = new Date().toISOString().slice(0, 10);
        const filename = `master_data_export_${searchTerm ? 'filtered_' : 'all_'}${timestamp}.csv`;

        const link = document.createElement('a');
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    const totalPages = Math.ceil(filteredParts.length / itemsPerPage);
    const currentItems = useMemo(() => {
        const idxFirst = (currentPage - 1) * itemsPerPage;
        return filteredParts.slice(idxFirst, idxFirst + itemsPerPage);
    }, [filteredParts, currentPage, itemsPerPage]);

    const handlePageChange = (newPage: number) => {
        if (newPage >= 1 && newPage <= totalPages) setCurrentPage(newPage);
    };

    return (
        <div className="space-y-6">
            <ProcessingModal state={procState} onClose={() => setProcState(INITIAL_PROCESSING_STATE)} />

            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-slate-800">Master Data Management</h1>
                <div className="flex gap-2">
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleBulkUpload}
                        onClick={(e) => (e.currentTarget.value = '')}
                        accept=".csv, .xlsx, .xls, .txt"
                        className="hidden"
                    />

                    {/* Bulk Delete Button */}
                    {selectedIds.size > 0 && canDelete && (
                        <button
                            onClick={() => setBulkDeleteModal(true)}
                            className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm hover:bg-red-100 transition-all font-medium"
                        >
                            <Trash2 size={16} /> Delete Selected ({selectedIds.size})
                        </button>
                    )}

                    <input
                        type="file"
                        ref={restoreInputRef}
                        onChange={handleRestoreBackup}
                        onClick={(e) => (e.currentTarget.value = '')}
                        accept=".json"
                        className="hidden"
                    />

                    {/* Export Filtered Results Button */}
                    <button
                        onClick={handleExportFiltered}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg hover:bg-emerald-100 shadow-sm transition-colors"
                        title="Export current table results to CSV"
                    >
                        <FileDown size={16} /> Export CSV
                    </button>

                    <button
                        onClick={handleDownloadTemplate}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 shadow-sm transition-colors"
                        title="Download Exact Template"
                    >
                        <FileSpreadsheet size={16} /> Template
                    </button>

                    {canEdit && (
                        <>
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={procState.isOpen}
                                className={`flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 shadow-sm transition-colors ${procState.isOpen ? 'opacity-50 cursor-wait' : ''}`}
                            >
                                <FileSpreadsheet size={16} /> Bulk Upload
                            </button>
                            <button
                                onClick={handleCreatePart}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm transition-colors"
                            >
                                <Plus size={16} /> Add Item
                            </button>
                            <div className="w-px h-8 bg-slate-300 mx-1"></div>
                            {!storageService.isCloudMode() && (
                                <button onClick={() => restoreInputRef.current?.click()} disabled={procState.isOpen} className="flex items-center gap-2 px-4 py-2 bg-slate-100 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-200 shadow-sm transition-colors" title="Restore DB">
                                    <RefreshCcw size={16} /> Restore
                                </button>
                            )}
                        </>
                    )}

                    <button onClick={handleBackup} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 shadow-sm transition-colors" title="Full Backup">
                        <Download size={16} /> Backup
                    </button>

                    {canDelete && (
                        <button
                            onClick={handleWipeDatabase}
                            className="flex items-center gap-2 px-4 py-2 bg-red-100 border border-red-300 text-red-800 rounded-lg hover:bg-red-200 shadow-sm transition-colors font-bold"
                            title="Delete ALL Records"
                        >
                            <Trash2 size={16} /> WIPE DB
                        </button>
                    )}
                </div>
            </div>

            <div className="bg-white shadow-sm border border-slate-200 rounded-xl overflow-hidden flex flex-col h-[700px]">
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center gap-4">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                        <input
                            type="text"
                            placeholder="Search PART_NUMBER, DESCRIPTION (EN/ES)..."
                            value={searchTerm}
                            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                            className="pl-9 pr-4 py-2 w-full border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <div className="text-sm text-slate-500 flex items-center gap-2">
                        <Database size={14} className="text-slate-400" />
                        Count: <span className="font-bold text-slate-700">{filteredParts.length.toLocaleString()}</span>
                    </div>
                </div>

                <div className="overflow-auto flex-1">
                    <table className="w-full text-xs text-left whitespace-nowrap">
                        <thead className="bg-slate-50 text-slate-500 font-medium sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="px-3 py-3 bg-slate-50 border-b border-slate-200 text-center w-[40px] sticky left-0 z-20">
                                    <input
                                        type="checkbox"
                                        className="rounded border-slate-300"
                                        checked={filteredParts.length > 0 && selectedIds.size === filteredParts.length}
                                        onChange={handleSelectAll}
                                    />
                                </th>
                                <th className="px-3 py-3 bg-slate-50 border-b border-slate-200 sticky left-[40px] z-20">Actions</th>
                                {CSV_ORDER_KEYS.map(key => (
                                    <th key={key} className="px-3 py-3 bg-slate-50 border-b border-slate-200 font-bold text-slate-700">
                                        {key}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {currentItems.map(part => (
                                <tr key={part.id || Math.random()} className="hover:bg-slate-50">
                                    <td className="px-3 py-2 border-r border-slate-100 sticky left-0 bg-white hover:bg-slate-50 text-center z-10">
                                        <input
                                            type="checkbox"
                                            className="rounded border-slate-300"
                                            checked={selectedIds.has(part.id)}
                                            onChange={() => handleSelectRow(part.id)}
                                        />
                                    </td>
                                    <td className="px-3 py-2 flex items-center gap-2 sticky left-[40px] bg-white hover:bg-slate-50 border-r border-slate-100 z-10">
                                        {canEdit ? (
                                            <button onClick={() => handleEditPart(part as RawMaterialPart)} className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50">
                                                <Edit2 size={14} />
                                            </button>
                                        ) : (
                                            <span className="text-slate-300 p-1"><Edit2 size={14} /></span>
                                        )}
                                        {canDelete && (
                                            <button onClick={() => initiateDelete(part.id)} className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50">
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </td>

                                    {/* DYNAMIC ROW RENDERING IN EXACT ORDER */}
                                    {CSV_ORDER_KEYS.map(key => {
                                        let displayVal = (part as any)[key];
                                        if (typeof displayVal === 'boolean') displayVal = displayVal ? 'Y' : 'N';
                                        return (
                                            <td key={key} className="px-3 py-2 border-r border-slate-50 last:border-0 max-w-[200px] truncate" title={String(displayVal)}>
                                                {displayVal}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center rounded-b-xl border">
                    <span className="text-xs text-slate-500">
                        {filteredParts.length > 0 ?
                            `Showing ${(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, filteredParts.length)} of ${filteredParts.length}` :
                            'No records'}
                    </span>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => handlePageChange(currentPage - 1)}
                            disabled={currentPage === 1}
                            className="p-2 rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <span className="text-sm font-medium text-slate-700 px-2 min-w-[80px] text-center">
                            Page {currentPage} of {totalPages || 1}
                        </span>
                        <button
                            onClick={() => handlePageChange(currentPage + 1)}
                            disabled={currentPage === totalPages || totalPages === 0}
                            className="p-2 rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>

                {deleteModal.isOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                        <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
                            <div className="bg-red-50 p-6 flex flex-col items-center text-center border-b border-red-100">
                                <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-3">
                                    <AlertTriangle size={24} />
                                </div>
                                <h3 className="text-lg font-bold text-red-900">Confirm Deletion</h3>
                            </div>
                            <div className="p-6 flex gap-3">
                                <button onClick={() => setDeleteModal({ isOpen: false, id: null })} className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium">Cancel</button>
                                <button onClick={confirmDelete} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium shadow-sm">Confirm</button>
                            </div>
                        </div>
                    </div>
                )}

                {bulkDeleteModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                        <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
                            <div className="bg-red-50 p-6 flex flex-col items-center text-center border-b border-red-100">
                                <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-3">
                                    <AlertTriangle size={24} />
                                </div>
                                <h3 className="text-lg font-bold text-red-900">Bulk Delete</h3>
                                <p className="text-sm text-red-700 mt-2">
                                    Are you sure you want to delete {selectedIds.size} records? This action cannot be undone.
                                </p>
                            </div>
                            <div className="p-6 flex gap-3">
                                <button onClick={() => setBulkDeleteModal(false)} className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium">Cancel</button>
                                <button onClick={confirmBulkDelete} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium shadow-sm">Delete All</button>
                            </div>
                        </div>
                    </div>
                )}

                {isPartModalOpen && canEdit && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                        <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200">
                            <div className="flex justify-between items-center p-6 border-b border-slate-100">
                                <h2 className="text-xl font-bold text-slate-800">
                                    {currentPart.id ? 'Edit Item' : 'Add New Item'}
                                </h2>
                                <button onClick={() => setIsPartModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                    <X size={24} />
                                </button>
                            </div>

                            <form onSubmit={handleSavePart} className="flex-1 overflow-y-auto p-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {/* GENERATE FORM FIELDS DYNAMICALLY based on CSV_ORDER_KEYS */}
                                    {CSV_ORDER_KEYS.map(key => (
                                        <div key={key} className={key.includes('DESCRIPTION') || key.includes('DESCRIPCION') ? 'col-span-2' : ''}>
                                            <label className="block">
                                                <span className="text-xs font-bold text-slate-500 uppercase">{key.replace(/_/g, ' ')}</span>
                                                <input
                                                    name={key}
                                                    value={(currentPart as any)[key]}
                                                    onChange={handlePartInputChange}
                                                    type={['IGI_DUTY', 'NETWEIGHT'].includes(key) ? 'number' : 'text'}
                                                    step={['IGI_DUTY', 'NETWEIGHT'].includes(key) ? '0.001' : undefined}
                                                    className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2 text-sm"
                                                />
                                            </label>
                                        </div>
                                    ))}
                                </div>
                            </form>

                            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 rounded-b-xl">
                                <button onClick={() => setIsPartModalOpen(false)} className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium">Cancel</button>
                                <button onClick={handleSavePart} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm flex items-center gap-2">
                                    <Save size={18} /> Save
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                {/* DUPLICATE RESOLUTION MODAL */}
                {duplicateModal.isOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                            <div className="bg-amber-50 p-6 flex flex-col items-center text-center border-b border-amber-100">
                                <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-3">
                                    <AlertTriangle size={24} />
                                </div>
                                <h3 className="text-lg font-bold text-amber-900">Duplicates Detected</h3>
                                <p className="text-sm text-amber-800 mt-2">
                                    We found <span className="font-bold">{duplicateModal.conflictingItems.length}</span> items that already exist in the database (matching PART_NUMBER).
                                </p>
                                <p className="text-xs text-amber-600 mt-1">
                                    Also found {duplicateModal.newItems.length} new items.
                                </p>
                            </div>
                            <div className="p-6 flex flex-col gap-3">
                                <button
                                    onClick={() => handleResolveDuplicates('replace')}
                                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm"
                                >
                                    Overwrite Existing & Add New
                                </button>
                                <button
                                    onClick={() => handleResolveDuplicates('skip')}
                                    className="w-full px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium"
                                >
                                    Skip Duplicates (Add New Only)
                                </button>
                                <button
                                    onClick={() => setDuplicateModal({ isOpen: false, newItems: [], conflictingItems: [], existingMap: {} })}
                                    className="w-full px-4 py-2 text-slate-400 hover:text-slate-600 text-sm font-medium"
                                >
                                    Cancel Import
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};