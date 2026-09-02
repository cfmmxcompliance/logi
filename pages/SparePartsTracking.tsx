import React, { useState, useEffect, useRef } from 'react';
import { storageService } from '../services/storageService.ts';
import { SparePartsTrackingRecord, UserRole } from '../types.ts';
import { Plus, Search, FileDown, Container, Edit2, Trash2, X, Save, AlertTriangle, FileSpreadsheet, Anchor, Plane } from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { parseCSV } from '../utils/csvHelpers.ts';
import { ProcessingModal, ProcessingState, INITIAL_PROCESSING_STATE } from '../components/ProcessingModal.tsx';
import { useLanguage } from '../context/LanguageContext.tsx';

// Initialize Empty State
const sparePartsEmptyState: SparePartsTrackingRecord = {
    id: '',
    projectSection: '',
    shipmentBatch: '',
    personInCharge: '',
    unloadingLocation: '',
    unloadingParty: '',
    unloadingTools: '',
    status: '',
    containerSize: '',
    containerQty: 0,
    containerNo: '',
    blNo: '',
    etd: '',
    atd: '',
    etaPort: ''
};

// Keys for form generation
const SPARE_PARTS_KEYS: (keyof SparePartsTrackingRecord)[] = [
    'projectSection', 'shipmentBatch', 'personInCharge', 'unloadingLocation',
    'unloadingParty', 'unloadingTools', 'status', 'containerSize', 'containerQty',
    'containerNo', 'blNo', 'etd', 'atd', 'etaPort', 'assignedSpecialist'
];

export const SparePartsTracking = () => {
    const { hasRole } = useAuth();
    const isAdmin = hasRole([UserRole.ADMIN]);
    const { t, language } = useLanguage();

    const [records, setRecords] = useState<SparePartsTrackingRecord[]>([]);
    const [filter, setFilter] = useState('');
    const [activeTab, setActiveTab] = useState<'ALL' | 'SEA' | 'AIR'>('ALL');
    const [isLoading, setIsLoading] = useState(false);

    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [dateFilterType, setDateFilterType] = useState<'etd' | 'etaPort' | 'atd'>('etd');

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentRecord, setCurrentRecord] = useState<SparePartsTrackingRecord>(sparePartsEmptyState);
    const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean, id: string | null }>({ isOpen: false, id: null });
    const [bulkDeleteModal, setBulkDeleteModal] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Processing State
    const [procState, setProcState] = useState<ProcessingState>(INITIAL_PROCESSING_STATE);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const existing = storageService.getSparePartsTracking();
        if (existing.length > 0) {
            setRecords(existing);
        } else {
            setIsLoading(true);
            storageService.loadSparePartsTracking().then(() => {
                setRecords([...storageService.getSparePartsTracking()]);
                setIsLoading(false);
            }).catch(() => setIsLoading(false));
        }
        const unsub = storageService.subscribe(() => {
            setRecords([...storageService.getSparePartsTracking()]);
        });
        return unsub;
    }, []);

    const isAir = (r: SparePartsTrackingRecord) => {
        // Heuristic to determine if it is Air Freight in SpareParts table
        return (
            r.containerSize?.toLowerCase() === 'air' ||
            r.containerNo?.includes('AIR CARGO')
        );
    };

    const filteredRecords = records.filter(r => {
        // 1. Tab Filter
        if (activeTab === 'AIR' && !isAir(r)) return false;
        if (activeTab === 'SEA' && isAir(r)) return false;

        // 2. Date Range Filter
        if (startDate || endDate) {
            const recordDateStr = r[dateFilterType];
            if (!recordDateStr) return false;
            if (startDate && recordDateStr < startDate) return false;
            if (endDate && recordDateStr > endDate) return false;
        }

        // 3. Search Filter
        if (!filter) return true;
        const searchTerms = filter.toLowerCase().split(',').map(t => t.trim()).filter(t => t);
        // Safe filter avoiding circular references
        return searchTerms.some(term =>
            Object.values(r).some(val =>
                val && typeof val !== 'object' && String(val).toLowerCase().includes(term)
            )
        );
    });

    const handleEdit = (r: SparePartsTrackingRecord) => {
        setCurrentRecord(r);
        setIsModalOpen(true);
    };

    const handleCreate = () => {
        setCurrentRecord(sparePartsEmptyState);
        setIsModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        await storageService.updateSparePartsTracking(currentRecord);
        setIsModalOpen(false);
    };

    const initiateDelete = (id: string) => {
        setDeleteModal({ isOpen: true, id });
    };

    const confirmDelete = async () => {
        if (!isAdmin || !deleteModal.id) return;
        try {
            await storageService.deleteSparePartsTracking(deleteModal.id);
            setDeleteModal({ isOpen: false, id: null });
        } catch (e) {
            alert('Error eliminando el registro.');
        }
    };

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

    const confirmBulkDelete = async () => {
        if (!isAdmin) return;
        try {
            await storageService.deleteSparePartsTrackings(Array.from(selectedIds));
            setSelectedIds(new Set());
            setBulkDeleteModal(false);
        } catch (e) {
            alert('Error eliminando registros.');
        }
    };

    const handleExportFiltered = () => {
        if (filteredRecords.length === 0) {
            alert("No hay datos para exportar con los filtros actuales.");
            return;
        }

        // 1. Headers
        const headerRow = SPARE_PARTS_KEYS.join(',');

        // 2. Data Rows
        const dataRows = filteredRecords.map(record => {
            return SPARE_PARTS_KEYS.map(key => {
                let val = (record as any)[key];

                if (val === null || val === undefined) return '';

                // Escape CSV special characters
                const strVal = String(val);
                if (strVal.includes(',') || strVal.includes('"') || strVal.includes('\n')) {
                    return `"${strVal.replace(/"/g, '""')}"`;
                }
                return strVal;
            }).join(',');
        });

        const csvContent = '\uFEFF' + [headerRow, ...dataRows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

        const timestamp = new Date().toISOString().slice(0, 10);
        const filename = `spareParts_tracking_export_${filter ? 'filtered_' : 'all_'}${timestamp}.csv`;

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

    const handleDownloadTemplate = () => {
        const headerRow = SPARE_PARTS_KEYS.join(',');
        const exampleRow = SPARE_PARTS_KEYS.map(key => {
            if (key === 'containerQty') return '1';
            if (key.toLowerCase().includes('date') || key.includes('etd') || key.includes('atd')) return '2024-01-01';
            return `Sample ${key}`;
        }).join(',');
        const csvContent = headerRow + '\n' + exampleRow;
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'spareParts_tracking_template.csv';
        link.click();
    };

    const handleBulkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setProcState({
            isOpen: true,
            status: 'loading',
            title: 'Reading File',
            message: 'Parsing CSV...',
            progress: 10
        });

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const text = evt.target?.result as string;
                if (!text) throw new Error("Empty file");

                const rows = parseCSV(text);
                if (rows.length < 2) throw new Error("Invalid CSV format");

                const headers = rows[0].map(h => h.trim());
                const mapIndices: Record<string, number> = {};

                SPARE_PARTS_KEYS.forEach(key => {
                    const idx = headers.findIndex(h => h.toLowerCase() === key.toLowerCase());
                    if (idx !== -1) mapIndices[key] = idx;
                });

                setProcState(prev => ({ ...prev, progress: 30, message: 'Processing rows...' }));

                const newRecords: SparePartsTrackingRecord[] = [];
                for (let i = 1; i < rows.length; i++) {
                    const row = rows[i];
                    if (row.length < 2) continue;

                    const newItem: any = { ...sparePartsEmptyState };
                    let hasData = false;

                    SPARE_PARTS_KEYS.forEach(key => {
                        const idx = mapIndices[key];
                        if (idx !== undefined && row[idx]) {
                            if (key === 'containerQty') newItem[key] = parseFloat(row[idx]) || 0;
                            else newItem[key] = row[idx].trim();
                            hasData = true;
                        }
                    });

                    if (hasData) newRecords.push(newItem);
                }

                if (newRecords.length === 0) throw new Error("No valid data found");

                setProcState(prev => ({ ...prev, progress: 60, message: 'Saving...' }));

                await storageService.upsertSparePartsTracking(newRecords, (p) => {
                    setProcState(prev => ({ ...prev, progress: 60 + (p * 0.4) }));
                });

                setProcState({
                    isOpen: true,
                    status: 'success',
                    title: 'Success',
                    message: `Imported ${newRecords.length} records.`,
                    progress: 100
                });
                setTimeout(() => setProcState(INITIAL_PROCESSING_STATE), 2000);

            } catch (err: any) {
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
        };
        reader.readAsText(file);
    };

    const Th = ({ children, className }: { children?: React.ReactNode, className?: string }) => (
        <th className={`px-3 py-3 border-b border-r border-slate-200 bg-slate-50 text-slate-700 font-bold whitespace-pre-wrap ${className}`}>
            {children}
        </th>
    );

    const Td = ({ children, className }: { children?: React.ReactNode, className?: string }) => (
        <td className={`px-3 py-2 border-r border-slate-100 ${className}`}>
            {children || '-'}
        </td>
    );

    return (
        <div className="space-y-6">
            <ProcessingModal state={procState} onClose={() => setProcState(INITIAL_PROCESSING_STATE)} />

            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Container className="text-blue-600" />
                        SpareParts
                    </h1>
                    <p className="text-slate-500 text-sm">Monitor spareParts containers and delivery status.</p>
                </div>
                <div className="flex gap-2">
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleBulkUpload}
                        onClick={(e) => (e.currentTarget.value = '')}
                        accept=".csv"
                        className="hidden"
                    />
                    {selectedIds.size > 0 && isAdmin && (
                        <button
                            onClick={() => setBulkDeleteModal(true)}
                            className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm hover:bg-red-100 transition-all font-medium"
                        >
                            <Trash2 size={18} /> Delete Selected ({selectedIds.size})
                        </button>
                    )}
                    {/* Export Button */}
                    <button
                        onClick={handleExportFiltered}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg hover:bg-emerald-100 shadow-sm transition-colors"
                        title="Export current table results to CSV"
                    >
                        <FileDown size={18} /> Export CSV
                    </button>
                    <button
                        onClick={handleDownloadTemplate}
                        className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm hover:bg-slate-50 transition-all"
                    >
                        <FileSpreadsheet size={18} /> Template
                    </button>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm hover:bg-slate-50 transition-all"
                    >
                        <FileDown size={18} /> Import CSV
                    </button>
                    <button
                        onClick={handleCreate}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition-all"
                    >
                        <Plus size={18} /> Add Record
                    </button>
                </div>
            </div>

            {/* Tabs and Filters */}
            <div className="flex flex-col md:flex-row gap-4">
                <div className="bg-white rounded-lg p-1 border border-slate-200 shadow-sm inline-flex">
                    <button
                        onClick={() => setActiveTab('ALL')}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'ALL' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                    >
                        Todas
                    </button>
                    <button
                        onClick={() => setActiveTab('SEA')}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${activeTab === 'SEA' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                    >
                        <Anchor size={14} /> Marítimo
                    </button>
                    <button
                        onClick={() => setActiveTab('AIR')}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${activeTab === 'AIR' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                    >
                        <Plane size={14} /> Aéreo (DHL/FedEx)
                    </button>
                </div>

                <div className="bg-white p-2 rounded-xl shadow-sm border border-slate-200 flex-1 flex flex-wrap gap-2 items-center">
                    <div className="relative flex-1 min-w-[200px]">
                        <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="Search Project, Container, Batch..."
                            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                        />
                    </div>
                    
                    {/* Date Range Filters */}
                    <div className="flex items-center gap-2 border-l pl-2 ml-2 border-slate-200">
                        <select
                            value={dateFilterType}
                            onChange={(e) => setDateFilterType(e.target.value as any)}
                            className="px-2 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium text-slate-700 bg-slate-50"
                        >
                            <option value="etd">ETD</option>
                            <option value="etaPort">ETA</option>
                            <option value="atd">ATD</option>
                        </select>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-slate-600"
                            title="Fecha Inicial"
                        />
                        <span className="text-slate-400 text-sm">-</span>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-slate-600"
                            title="Fecha Final"
                        />
                    </div>
                </div>
            </div>

            {/* SpareParts Table - Horizontal Scroll */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[calc(100vh-300px)]">
                <div className="overflow-auto flex-1">
                    <table className="w-full text-xs text-left border-collapse">
                        <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                            <tr>
                                <Th className="sticky left-0 z-20 w-[40px] bg-slate-50 text-center">
                                    <input
                                        type="checkbox"
                                        className="rounded border-slate-300"
                                        checked={filteredRecords.length > 0 && selectedIds.size === filteredRecords.length}
                                        onChange={handleSelectAll}
                                    />
                                </Th>
                                <Th className="sticky left-[40px] z-20 w-16 bg-slate-50">{t('eq.action')}</Th>
                                <Th className="sticky left-[104px] z-20 w-32">
                                    {t('eq.proj')}
                                    {language === 'es' && <><br /><span className="text-[10px] text-slate-500 font-normal">项目板块</span></>}
                                </Th>
                                <Th className="min-w-[150px]">
                                    {t('eq.batch')}
                                    {language === 'es' && <><br /><span className="text-[10px] text-slate-500 font-normal">发运批次</span></>}
                                </Th>
                                <Th>
                                    {t('eq.pic')}
                                    {language === 'es' && <><br /><span className="text-[10px] text-slate-500 font-normal">负责人</span></>}
                                </Th>
                                <Th>{t('eq.loc')}</Th>
                                <Th>{t('eq.party')}</Th>
                                <Th>{t('eq.tools')}</Th>
                                <Th>
                                    {t('eq.status')}
                                    {language === 'es' && <><br /><span className="text-[10px] text-slate-500 font-normal">状态</span></>}
                                </Th>
                                <Th>
                                    {t('eq.size')}
                                    {language === 'es' && <><br /><span className="text-[10px] text-slate-500 font-normal">设备柜型</span></>}
                                </Th>
                                <Th>
                                    {t('eq.qty')}
                                    {language === 'es' && <><br /><span className="text-[10px] text-slate-500 font-normal">数量</span></>}
                                </Th>
                                <Th>
                                    {t('eq.container')}
                                    {language === 'es' && <><br /><span className="text-[10px] text-slate-500 font-normal">集装箱号</span></>}
                                </Th>
                                <Th>
                                    {t('eq.bl')}
                                    {language === 'es' && <><br /><span className="text-[10px] text-slate-500 font-normal">提单号</span></>}
                                </Th>
                                <Th>
                                    {t('eq.etd')}
                                    {language === 'es' && <><br /><span className="text-[10px] text-slate-500 font-normal">预计出运时间</span></>}
                                </Th>
                                <Th>
                                    {t('eq.atd')}
                                    {language === 'es' && <><br /><span className="text-[10px] text-slate-500 font-normal">实际出运时间</span></>}
                                </Th>
                                <Th className="border-r-0">
                                    {t('eq.eta')}
                                    {language === 'es' && <><br /><span className="text-[10px] text-slate-500 font-normal">抵达港口</span></>}
                                </Th>
                                <Th>Especialista</Th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 whitespace-nowrap">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={16} className="py-20 text-center text-slate-400">
                                        <div className="inline-block w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-3" />
                                        <p className="text-sm font-medium">Cargando registros de Spare Parts...</p>
                                    </td>
                                </tr>
                            ) : filteredRecords.map((r) => (
                                <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-3 py-2 border-r border-slate-100 sticky left-0 bg-white hover:bg-slate-50 text-center z-10">
                                        <input
                                            type="checkbox"
                                            className="rounded border-slate-300"
                                            checked={selectedIds.has(r.id)}
                                            onChange={() => handleSelectRow(r.id)}
                                        />
                                    </td>
                                    <td className="px-3 py-2 border-r border-slate-100 sticky left-[40px] bg-white hover:bg-slate-50 flex items-center gap-2 z-10">
                                        <button onClick={() => handleEdit(r)} className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50"><Edit2 size={14} /></button>
                                        {isAdmin && (
                                            <button onClick={() => initiateDelete(r.id)} className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50">
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </td>
                                    <td className="px-3 py-2 border-r border-slate-100 sticky left-[104px] bg-white hover:bg-slate-50 font-bold text-slate-800">{r.projectSection}</td>
                                    <Td className="font-medium text-blue-600">{r.shipmentBatch}</Td>
                                    <Td>{r.personInCharge}</Td>
                                    <Td>{r.unloadingLocation}</Td>
                                    <Td>{r.unloadingParty}</Td>
                                    <Td>{r.unloadingTools}</Td>
                                    <Td>
                                        <span className="px-2 py-1 bg-slate-100 rounded-full text-[10px] font-bold uppercase text-slate-600">
                                            {r.status}
                                        </span>
                                    </Td>
                                    <Td>
                                        {isAir(r) ?
                                            <span className="flex items-center gap-1 text-purple-600 font-bold text-[10px]"><Plane size={10} /> {r.containerSize || 'Air'}</span> :
                                            <span>{r.containerSize}</span>
                                        }
                                    </Td>
                                    <Td>{r.containerQty}</Td>
                                    <Td className="font-mono">{r.containerNo}</Td>
                                    <Td className="font-bold">{r.blNo}</Td>
                                    <Td>{r.etd}</Td>
                                    <Td>{r.atd}</Td>
                                    <Td className="border-r-0">{r.etaPort}</Td>
                                    <Td>{r.assignedSpecialist}</Td>
                                </tr>
                            ))}
                            {!isLoading && filteredRecords.length === 0 && (
                                <tr>
                                    <td colSpan={15} className="p-12 text-center text-slate-400">
                                        <Container className="mx-auto mb-2 opacity-50" size={32} />
                                        No spareParts records found in this section.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
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

            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200">
                        <div className="flex justify-between items-center p-6 border-b border-slate-100">
                            <h2 className="text-xl font-bold text-slate-800">
                                {currentRecord.id ? 'Edit Record' : 'New Record'}
                            </h2>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={24} /></button>
                        </div>
                        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {SPARE_PARTS_KEYS.map(key => (
                                    <label key={key} className="block">
                                        <span className="text-xs font-bold text-slate-500 uppercase">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                                        <input
                                            className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2 text-sm"
                                            type={key === 'containerQty' ? 'number' : 'text'}
                                            value={(currentRecord as any)[key]}
                                            onChange={e => setCurrentRecord({ ...currentRecord, [key]: key === 'containerQty' ? parseFloat(e.target.value) : e.target.value })}
                                        />
                                    </label>
                                ))}
                            </div>
                        </form>
                        <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 rounded-b-xl">
                            <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium">Cancel</button>
                            <button onClick={handleSave} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm flex items-center gap-2">
                                <Save size={18} /> Save
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};