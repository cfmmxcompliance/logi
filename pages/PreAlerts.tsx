import React, { useState, useEffect, useRef } from 'react';
import { storageService } from '../services/storageService.ts';
import { geminiService } from '../services/geminiService.ts';
import { PreAlertRecord, UserRole } from '../types.ts';
import { Plus, Search, FileDown, Bell, FileSpreadsheet, Edit2, X, Save, Trash2, AlertTriangle, Upload, FileText, CheckCircle, Plane, Anchor, Container, RefreshCw } from 'lucide-react';
import { parseCSV } from '../utils/csvHelpers.ts';
import { ProcessingModal, ProcessingState, INITIAL_PROCESSING_STATE } from '../components/ProcessingModal.tsx';
import { useAuth } from '../context/AuthContext.tsx';

// Initialize Empty State
const preAlertEmptyState: PreAlertRecord = {
    id: '',
    model: '',
    shippingMode: 'SEA',
    bookingAbw: '',
    etd: '',
    atd: '',
    departureCity: '',
    eta: '',
    ata: '',
    ataFactory: '',
    arrivalCity: '',
    invoiceNo: '',
    processed: false
};

// Keys for form generation (and CSV)
const PREALERT_KEYS: (keyof PreAlertRecord)[] = [
    'model', 'shippingMode', 'bookingAbw', 'etd', 'atd', 'departureCity', 'eta', 'ata', 'ataFactory', 'arrivalCity', 'invoiceNo'
];

// Batch Review Interface
interface BatchExtractionResult {
    file: File;
    preAlert: PreAlertRecord;
    containers: { containerNo: string, size: string }[];
    expectedCount?: number;
    status: 'success' | 'warning' | 'error';
    message?: string;
}

interface ExtractionReview {
    results: BatchExtractionResult[];
}

export const PreAlerts = () => {
    const { hasRole } = useAuth();
    const isAdmin = hasRole([UserRole.ADMIN]);

    const [records, setRecords] = useState<PreAlertRecord[]>([]);
    const [filter, setFilter] = useState('');
    const [activeTab, setActiveTab] = useState<'ALL' | 'SEA' | 'AIR'>('ALL');

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentRecord, setCurrentRecord] = useState<PreAlertRecord>(preAlertEmptyState);
    const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean, id: string | null }>({ isOpen: false, id: null });
    const [bulkDeleteModal, setBulkDeleteModal] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Processing & Review State
    const [procState, setProcState] = useState<ProcessingState>(INITIAL_PROCESSING_STATE);
    const [extractionReview, setExtractionReview] = useState<ExtractionReview | null>(null);
    const [includeEquipment, setIncludeEquipment] = useState(true);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const docInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setRecords(storageService.getPreAlerts());
        const unsub = storageService.subscribe(() => {
            setRecords([...storageService.getPreAlerts()]);
        });
        return unsub;
    }, []);

    const filteredRecords = records.filter(r => {
        // 1. Filter by Tab (Mode)
        if (activeTab !== 'ALL' && r.shippingMode !== activeTab) return false;

        // 2. Filter by Search Text
        if (!filter) return true;
        const lowerFilter = filter.toLowerCase();
        return Object.values(r).some(val =>
            val && typeof val !== 'object' && String(val).toLowerCase().includes(lowerFilter)
        );
    });

    const handleEdit = (r: PreAlertRecord) => {
        setCurrentRecord(r);
        setIsModalOpen(true);
    };

    const handleCreate = () => {
        setCurrentRecord(preAlertEmptyState);
        setIsModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();

        // Duplicate Check for Manual Entry
        // Only check if we are creating a NEW record (id is empty) or if the booking number changed
        if (!currentRecord.id && currentRecord.bookingAbw) {
            const existing = await storageService.checkPreAlertExists(currentRecord.bookingAbw);
            if (existing) {
                const confirmReplace = window.confirm(
                    `⚠️ DUPLICATE WARNING ⚠️\n\nA record with Booking/AWB "${currentRecord.bookingAbw}" already exists.\n\nDo you want to OVERWRITE it?`
                );
                if (!confirmReplace) return;
            }
        }

        if (currentRecord.id) {
            await storageService.updatePreAlert(currentRecord);
        } else {
            // Logic Change: Instead of saving directly, open the Review/Distribution Modal
            setExtractionReview({
                results: [{
                    file: new File([], 'Manual Entry'),
                    preAlert: currentRecord,
                    containers: currentRecord.linkedContainers?.map(c => ({ containerNo: c, size: '40HC' })) || [],
                    expectedCount: currentRecord.linkedContainers?.length || 0,
                    status: 'success',
                    message: 'Manual Entry'
                }]
            });
        }
        setIsModalOpen(false);
        setRecords(storageService.getPreAlerts());
    };

    const initiateDelete = (id: string) => {
        setDeleteModal({ isOpen: true, id });
    };

    const confirmDelete = async () => {
        if (!isAdmin || !deleteModal.id) return;

        const record = records.find(r => r.id === deleteModal.id);
        if (!record) return;

        // Upgrade: Always perform specific cascade delete if BL exists
        // Or confirm with user? User asked for "not nightmare", so assume "Delete Everywhere" is the new default for Pre-Alerts.
        // Actually, let's make the modal text clearer, but use the new powerful function.

        try {
            setProcState({
                isOpen: true,
                status: 'loading',
                title: 'GLOBAL DELETE',
                message: `Wiping BL ${record.bookingAbw} from ENTIRE system (Tracking, Customs, Equipment)...`,
                progress: 20
            });

            if (record.bookingAbw) {
                // New Power Delete
                await storageService.deleteEntireShipment(record.bookingAbw);
            } else {
                // Fallback for manual records without BL
                await storageService.deletePreAlert(deleteModal.id);
            }

            setProcState({
                isOpen: true,
                status: 'success',
                title: 'Deleted Everywhere',
                message: 'All linked records have been removed.',
                progress: 100
            });
            setDeleteModal({ isOpen: false, id: null });
            setTimeout(() => setProcState(INITIAL_PROCESSING_STATE), 1500);

            // Force refresh list
            setRecords(storageService.getPreAlerts());

        } catch (e) {
            console.error(e);
            alert('Error eliminando el registro.');
            setProcState(INITIAL_PROCESSING_STATE);
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
            setProcState({
                isOpen: true,
                status: 'loading',
                title: 'Bulk Deleting',
                message: `Deleting ${selectedIds.size} records and cleaning up...`,
                progress: 30
            });

            // We iterate and delete one by one as per storageService logic (for safety/cascade)
            await storageService.deletePreAlerts(Array.from(selectedIds));

            setProcState({
                isOpen: true,
                status: 'success',
                title: 'Bulk Delete Complete',
                message: 'Selected records deleted.',
                progress: 100
            });

            setSelectedIds(new Set());
            setBulkDeleteModal(false);
            setTimeout(() => setProcState(INITIAL_PROCESSING_STATE), 1500);
        } catch (e) {
            alert('Error eliminando registros.');
            setProcState(INITIAL_PROCESSING_STATE);
        }
    };

    const handleSyncDates = async (record: PreAlertRecord) => {
        if (!window.confirm("¿Sincronizar fechas?\n\nEsto actualizará las fechas (ETD, ATD, ETA, ATA, ATA Factory) en los registros correspondientes de Tracking, Equipment y Customs.")) {
            return;
        }
        setProcState({
            isOpen: true,
            status: 'loading',
            title: 'Syncing Dates',
            message: 'Updating related modules...',
            progress: 50
        });
        try {
            await storageService.syncPreAlertDates(record);
            setProcState({
                isOpen: true,
                status: 'success',
                title: 'Synced',
                message: 'Dates updated successfully.',
                progress: 100
            });
            setTimeout(() => setProcState(INITIAL_PROCESSING_STATE), 1500);
        } catch (e: any) {
            setProcState({
                isOpen: true,
                status: 'error',
                title: 'Sync Failed',
                message: e.message || "Unknown error",
                progress: 0
            });
        }
    };

    const handleExportFiltered = () => {
        if (filteredRecords.length === 0) {
            alert("No hay datos para exportar con los filtros actuales.");
            return;
        }

        // 1. Headers
        const headerRow = PREALERT_KEYS.join(',');

        // 2. Data Rows
        const dataRows = filteredRecords.map(record => {
            return PREALERT_KEYS.map(key => {
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
        const filename = `pre_alerts_export_${filter ? 'filtered_' : 'all_'}${timestamp}.csv`;

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
        const headerRow = PREALERT_KEYS.join(',');
        const exampleRow = "CFORCE 600,SEA,COSU12345678,2024-05-01,2024-05-02,Shanghai,2024-06-15,,,Manzanillo,INV-2024-001";
        const csvContent = headerRow + '\n' + exampleRow;
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'pre_alert_template.csv';
        link.click();
    };

    // CSV Import Logic
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

                PREALERT_KEYS.forEach(key => {
                    const idx = headers.findIndex(h => h.toLowerCase() === key.toLowerCase());
                    if (idx !== -1) mapIndices[key] = idx;
                });

                setProcState(prev => ({ ...prev, progress: 30, message: 'Processing rows...' }));

                const newRecords: PreAlertRecord[] = [];
                for (let i = 1; i < rows.length; i++) {
                    const row = rows[i];
                    if (row.length < 2) continue;

                    const newItem: any = { ...preAlertEmptyState };
                    let hasData = false;

                    PREALERT_KEYS.forEach(key => {
                        const idx = mapIndices[key];
                        if (idx !== undefined && row[idx]) {
                            newItem[key] = row[idx].trim();
                            hasData = true;
                        }
                    });

                    if (hasData) newRecords.push(newItem);
                }

                setProcState(prev => ({ ...prev, progress: 60, message: 'Saving...' }));

                await storageService.upsertPreAlerts(newRecords, (p) => {
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

    // AI Document Upload Logic (BL / AWB) - STEP 1: Analysis (Batch Support)
    const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        setProcState({
            isOpen: true,
            status: 'loading',
            title: `Analyzing ${files.length} Documents`,
            message: 'Extracting data with AI (Gemini)...',
            progress: 0
        });

        const batchResults: BatchExtractionResult[] = [];
        let completed = 0;

        for (const file of files) {
            // 4MB limit check
            if (file.size > 4 * 1024 * 1024) {
                batchResults.push({
                    file,
                    preAlert: {} as any,
                    containers: [],
                    status: 'error',
                    message: 'File too large (>4MB)'
                });
                completed++;
                continue;
            }

            try {
                // Read File
                const base64 = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });

                // Extract
                const extracted = await geminiService.parseShippingDocument(base64, file.type || 'image/jpeg');

                // Prepare Data
                const newPreAlert: PreAlertRecord = {
                    id: '',
                    model: extracted.model || 'Unknown Model (Update manually)',
                    shippingMode: extracted.docType === 'AWB' ? 'AIR' : 'SEA',
                    bookingAbw: extracted.bookingNo,
                    etd: extracted.etd,
                    departureCity: extracted.departurePort,
                    eta: extracted.eta,
                    arrivalCity: extracted.arrivalPort,
                    invoiceNo: extracted.invoiceNo || extracted.poNumber || '',
                    processed: true,
                    linkedContainers: extracted.containers.map(c => c.containerNo)
                };

                // Validate Count
                const containerCount = extracted.containers.length;
                const expected = extracted.expectedContainerCount;
                let status: 'success' | 'warning' = 'success';
                let message = 'Extraction Successful';

                if (expected && containerCount !== expected) {
                    status = 'warning';
                    message = `Mismatch: Found ${containerCount}, Expected ${expected}`;
                }

                batchResults.push({
                    file,
                    preAlert: newPreAlert,
                    containers: extracted.containers,
                    expectedCount: expected,
                    status,
                    message
                });

            } catch (err: any) {
                batchResults.push({
                    file,
                    preAlert: {} as any,
                    containers: [],
                    status: 'error',
                    message: err.message || "Extraction Failed"
                });
            }

            completed++;
            setProcState(prev => ({
                ...prev,
                progress: (completed / files.length) * 100,
                message: `Processed ${completed} of ${files.length} documents...`
            }));
        }

        // Finish
        setProcState(INITIAL_PROCESSING_STATE);

        // Open Batch Notification if there are valid results or warnings
        setExtractionReview({ results: batchResults });
        setIncludeEquipment(true);

        if (docInputRef.current) docInputRef.current.value = '';
    };

    // Edit Extraction State
    const [editingExtraction, setEditingExtraction] = useState<{ index: number, text: string } | null>(null);

    const handleUpdateContainers = () => {
        if (!editingExtraction || !extractionReview) return;

        // Parse text (comma or newline separated)
        const containers = editingExtraction.text
            .split(/[\n,]/)
            .map(s => s.trim())
            .filter(s => s.length > 0)
            .map(s => ({ containerNo: s, size: '40HC' })); // Default size

        const newResults = [...extractionReview.results];
        newResults[editingExtraction.index].containers = containers;
        newResults[editingExtraction.index].status = containers.length > 0 ? 'success' : 'warning';
        newResults[editingExtraction.index].message = 'Manually updated';

        setExtractionReview({ ...extractionReview, results: newResults });
        setEditingExtraction(null);
    };

    // Step 2: Confirmation & Save (Batch)
    const handleConfirmExtraction = async () => {
        if (!extractionReview || extractionReview.results.length === 0) return;

        const validResults = extractionReview.results.filter(r => r.status !== 'error');
        if (validResults.length === 0) {
            setExtractionReview(null);
            return;
        }

        setExtractionReview(null);
        setProcState({
            isOpen: true,
            status: 'loading',
            title: 'Saving Records',
            message: `Saving ${validResults.length} documents...`,
            progress: 20
        });

        try {
            let processed = 0;
            for (const res of validResults) {
                await storageService.processPreAlertExtraction(
                    res.preAlert,
                    res.containers,
                    includeEquipment
                );
                processed++;
                setProcState(prev => ({ ...prev, progress: 20 + (processed / validResults.length) * 80 }));
            }

            setProcState({
                isOpen: true,
                status: 'success',
                title: 'Batch Complete',
                message: `Successfully processed ${processed} shipments.`,
                progress: 100
            });

            setTimeout(() => setProcState(INITIAL_PROCESSING_STATE), 2000);

        } catch (err: any) {
            setProcState({
                isOpen: true,
                status: 'error',
                title: 'Save Failed',
                message: err.message,
                progress: 0
            });
        }
    };

    // Format Submission State
    const [isSubmitFormatOpen, setIsSubmitFormatOpen] = useState(false);
    const [formatSub, setFormatSub] = useState({ file: null as File | null, provider: '', comments: '' });

    const handleSubmitFormat = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formatSub.file) return;

        setProcState({
            isOpen: true,
            status: 'loading',
            title: 'Uploading Format',
            message: 'Sending document for analysis...',
            progress: 30
        });

        try {
            await storageService.uploadTrainingDocument(formatSub.file, formatSub.provider, formatSub.comments);
            setProcState({
                isOpen: true,
                status: 'success',
                title: 'Submission Received',
                message: 'Thank you! We will analyze this format.',
                progress: 100
            });
            setTimeout(() => {
                setProcState(INITIAL_PROCESSING_STATE);
                setIsSubmitFormatOpen(false);
                setFormatSub({ file: null, provider: '', comments: '' });
            }, 2000);
        } catch (error) {
            setProcState({
                isOpen: true,
                status: 'error',
                title: 'Upload Failed',
                message: 'Could not upload document.',
                progress: 0
            });
        }
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

            {/* Format Submission Modal */}
            {isSubmitFormatOpen && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
                        <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
                            <div className="bg-purple-100 p-2 rounded-full text-purple-600">
                                <Upload size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-800">Submit New Format</h3>
                                <p className="text-sm text-slate-500">Help us learn new document layouts.</p>
                            </div>
                        </div>
                        <form onSubmit={handleSubmitFormat} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Document File (PDF/Image)</label>
                                <input
                                    type="file"
                                    accept=".pdf,image/*"
                                    onChange={e => setFormatSub({ ...formatSub, file: e.target.files?.[0] || null })}
                                    className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Provider / Courier Name</label>
                                <input
                                    type="text"
                                    placeholder="e.g. FedEx, DHL, Maersk"
                                    value={formatSub.provider}
                                    onChange={e => setFormatSub({ ...formatSub, provider: e.target.value })}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-purple-500 focus:border-purple-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Comments (Optional)</label>
                                <textarea
                                    placeholder="e.g., The 'Total Weight' column is missing, or the container table is not being parsed correctly."
                                    value={formatSub.comments}
                                    onChange={e => setFormatSub({ ...formatSub, comments: e.target.value })}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-purple-500 focus:border-purple-500"
                                    rows={3}
                                />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setIsSubmitFormatOpen(false)} className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-medium">Cancel</button>
                                <button type="submit" disabled={!formatSub.file} className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">Submit</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Review Extraction Modal (Batch) */}
            {extractionReview && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="bg-blue-100 p-2 rounded-full text-blue-600">
                                    <CheckCircle size={24} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-slate-800">Review Batch Extraction</h3>
                                    <p className="text-sm text-slate-500">
                                        Found {extractionReview.results.length} documents. Please review warnings.
                                    </p>
                                </div>
                            </div>
                            <div className="text-right">
                                <span className="block text-2xl font-bold text-slate-800">
                                    {extractionReview.results.filter(r => r.status !== 'error').length}
                                </span>
                                <span className="text-xs text-slate-500 uppercase font-bold">Valid Files</span>
                            </div>
                        </div>

                        <div className="flex-1 overflow-auto p-0">
                            <table className="w-full text-left text-sm border-collapse">
                                <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm text-xs uppercase text-slate-500 font-bold">
                                    <tr>
                                        <th className="px-4 py-3 border-b">Status</th>
                                        <th className="px-4 py-3 border-b">File</th>
                                        <th className="px-4 py-3 border-b">Booking / AWB</th>
                                        <th className="px-4 py-3 border-b text-center">Containers (Found/Expected)</th>
                                        <th className="px-4 py-3 border-b">Message</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {extractionReview.results.map((res, idx) => (
                                        <tr key={idx} className={res.status === 'error' ? 'bg-red-50' : res.status === 'warning' ? 'bg-yellow-50' : 'hover:bg-slate-50'}>
                                            <td className="px-4 py-3">
                                                {res.status === 'success' && <CheckCircle size={18} className="text-green-500" />}
                                                {res.status === 'warning' && <AlertTriangle size={18} className="text-yellow-600" />}
                                                {res.status === 'error' && <X size={18} className="text-red-500" />}
                                            </td>
                                            <td className="px-4 py-3 font-medium text-slate-700 truncate max-w-[150px]" title={res.file.name}>
                                                {res.file.name}
                                            </td>
                                            <td className="px-4 py-3 font-mono text-slate-600">
                                                {res.preAlert.bookingAbw || '-'}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    <span className={`font-bold ${res.status === 'warning' ? 'text-red-600' : 'text-slate-700'}`}>
                                                        {res.containers.length}
                                                    </span>
                                                    <span className="text-slate-400">/</span>
                                                    <span className="text-slate-500">{res.expectedCount || '?'}</span>
                                                    <button
                                                        onClick={() => setEditingExtraction({
                                                            index: idx,
                                                            text: res.containers.map(c => c.containerNo).join('\n')
                                                        })}
                                                        className="p-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                                                        title="Edit Container List"
                                                    >
                                                        <Edit2 size={12} />
                                                    </button>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-slate-600 text-xs">
                                                {res.message}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Edit Extraction Modal */}
                        {editingExtraction && (
                            <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                                <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
                                    <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                                        <h3 className="font-bold text-slate-800">Edit Containers</h3>
                                        <button onClick={() => setEditingExtraction(null)}><X size={20} className="text-slate-400" /></button>
                                    </div>
                                    <div className="p-4">
                                        <label className="block text-sm font-medium text-slate-700 mb-2">
                                            Paste Container Numbers (One per line)
                                        </label>
                                        <textarea
                                            className="w-full h-48 rounded-lg border-slate-300 focus:border-blue-500 focus:ring-blue-500 font-mono text-sm p-3"
                                            value={editingExtraction.text}
                                            onChange={(e) => setEditingExtraction({ ...editingExtraction, text: e.target.value })}
                                            placeholder="CONT1234567&#10;CONT7654321..."
                                        />
                                    </div>
                                    <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                                        <button onClick={() => setEditingExtraction(null)} className="px-3 py-2 text-slate-600 hover:text-slate-800 font-medium">Cancel</button>
                                        <button onClick={handleUpdateContainers} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm">
                                            Applies {editingExtraction.text.split(/[\n,]/).filter(s => s.trim().length > 0).length} Containers
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="p-4 bg-yellow-50 border-t border-yellow-100 mx-6 mt-4 rounded-lg">
                            <label className="flex items-start gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="mt-1 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                                    checked={includeEquipment}
                                    onChange={(e) => setIncludeEquipment(e.target.checked)}
                                />
                                <div>
                                    <span className="font-bold text-slate-800 text-sm">Generar Equipment Tracking?</span>
                                    <p className="text-xs text-slate-600 mt-1">
                                        Si se marca, se crearán registros en Equipment Tracking para TODOS los archivos válidos.
                                    </p>
                                </div>
                            </label>
                        </div>

                        <div className="p-6 bg-white border-t border-slate-100 flex gap-3 mt-auto">
                            <button
                                onClick={() => setExtractionReview(null)}
                                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors"
                            >
                                Discard All
                            </button>
                            <button
                                onClick={handleConfirmExtraction}
                                disabled={extractionReview.results.filter(r => r.status !== 'error').length === 0}
                                className="flex-[2] px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Save size={18} />
                                Save {extractionReview.results.filter(r => r.status !== 'error').length} Valid Records
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Bell className="text-blue-600" />
                        Pre-Alertas
                    </h1>
                    <p className="text-slate-500 text-sm">Central ingestion for Maritime (BL) and Air (AWB) shipments.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {selectedIds.size > 0 && isAdmin && (
                        <button
                            onClick={() => setBulkDeleteModal(true)}
                            className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm hover:bg-red-100 transition-all font-medium"
                        >
                            <Trash2 size={18} /> Delete Selected ({selectedIds.size})
                        </button>
                    )}

                    <button
                        onClick={() => setIsSubmitFormatOpen(true)}
                        className="text-purple-600 hover:bg-purple-50 px-3 py-2 rounded-lg text-sm font-medium border border-transparent hover:border-purple-200 transition-all flex items-center gap-1"
                    >
                        Submit New Format
                    </button>
                    <div className="w-px bg-slate-300 mx-1"></div>
                    <input
                        type="file"
                        ref={docInputRef}
                        onChange={handleDocUpload}
                        onClick={(e) => (e.currentTarget.value = '')}
                        accept="image/*,.pdf"
                        multiple // ENABLE BATCH
                        className="hidden"
                    />
                    <button
                        onClick={() => docInputRef.current?.click()}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition-all"
                        title="Upload BL or AWB to automatically populate all tables"
                    >
                        <FileText size={18} /> Process BL/AWB (AI)
                    </button>
                    <div className="w-px bg-slate-300 mx-1"></div>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleBulkUpload}
                        onClick={(e) => (e.currentTarget.value = '')}
                        accept=".csv"
                        className="hidden"
                    />
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

                <div className="bg-white p-2 rounded-xl shadow-sm border border-slate-200 flex-1">
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="Search Booking, Model, Invoice..."
                            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* Table */}
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
                                <Th className="sticky left-[40px] z-20 w-16 bg-slate-50">Action</Th>
                                <Th className="sticky left-[104px] z-20">Booking / AWB</Th>
                                <Th>Mode</Th>
                                <Th>Model</Th>
                                <Th>ETD</Th>
                                <Th>Departure City</Th>
                                <Th>ETA</Th>
                                <Th>Arrival City</Th>
                                <Th>Invoice No</Th>
                                <Th className="border-r-0">Status</Th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 whitespace-nowrap">
                            {filteredRecords.map((r) => (
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
                                        <button onClick={() => handleSyncDates(r)} className="text-emerald-600 hover:text-emerald-800 p-1 rounded hover:bg-emerald-50" title="Sync dates to Tracking/Customs">
                                            <RefreshCw size={14} />
                                        </button>
                                        {isAdmin && (
                                            <button onClick={() => initiateDelete(r.id)} className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50">
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </td>
                                    <td className="px-3 py-2 border-r border-slate-100 sticky left-[104px] bg-white hover:bg-slate-50 font-bold text-blue-600">{r.bookingAbw}</td>
                                    <Td>
                                        {r.shippingMode === 'AIR' ?
                                            <span className="flex items-center gap-1 text-purple-600 font-bold"><Plane size={12} /> Air</span> :
                                            <span className="flex items-center gap-1 text-blue-600"><Anchor size={12} /> Sea</span>
                                        }
                                    </Td>
                                    <Td>{r.model}</Td>
                                    <Td>{r.etd}</Td>
                                    <Td>{r.departureCity}</Td>
                                    <Td>{r.eta}</Td>
                                    <Td>{r.arrivalCity}</Td>
                                    <Td>{r.invoiceNo}</Td>
                                    <Td className="border-r-0">
                                        {r.processed ?
                                            <span className="flex items-center gap-1 text-emerald-600 font-medium"><CheckCircle size={12} /> Processed</span> :
                                            <span className="text-slate-400">Draft</span>
                                        }
                                    </Td>
                                </tr>
                            ))}
                            {filteredRecords.length === 0 && (
                                <tr>
                                    <td colSpan={10} className="p-12 text-center text-slate-400">
                                        <Bell className="mx-auto mb-2 opacity-50" size={32} />
                                        No Pre-Alerts found in this section.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            {/* Delete Modal                */}
            {deleteModal.isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
                        <div className="p-6 text-center">
                            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                <AlertTriangle size={32} />
                            </div>
                            <h3 className="text-xl font-bold text-slate-800 mb-2">Delete Entire Shipment?</h3>
                            <p className="text-slate-600 mb-6">
                                Warning: This will delete the Pre-Alert <strong>AND ALL linked records</strong> in:
                                <br />
                                <span className="text-xs font-mono bg-red-50 text-red-700 px-1 rounded block mt-2">
                                    • Vessel Tracking<br />
                                    • Customs Clearance<br />
                                    • Equipment Tracking
                                </span>
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setDeleteModal({ isOpen: false, id: null })}
                                    className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 font-medium hover:bg-slate-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmDelete}
                                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium shadow-sm transition-colors"
                                >
                                    Yes, Delete All
                                </button>
                            </div>
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
                                Are you sure you want to delete {selectedIds.size} records?
                                <br />
                                <span className="font-bold">Warning:</span> Cascading delete will remove associated records in other modules.
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
                                {currentRecord.id ? 'Edit Pre-Alert' : 'New Pre-Alert'}
                            </h2>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={24} /></button>
                        </div>
                        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {PREALERT_KEYS.map(key => (
                                    <label key={key} className="block">
                                        <span className="text-xs font-bold text-slate-500 uppercase">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                                        {key === 'shippingMode' ? (
                                            <select
                                                className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2 text-sm"
                                                value={(currentRecord as any)[key]}
                                                onChange={e => setCurrentRecord({ ...currentRecord, [key]: e.target.value as any })}
                                            >
                                                <option value="SEA">Sea</option>
                                                <option value="AIR">Air</option>
                                            </select>
                                        ) : (
                                            <input
                                                className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2 text-sm"
                                                type="text"
                                                value={(currentRecord as any)[key] || ''}
                                                placeholder={key.includes('Date') || key === 'etd' || key === 'eta' || key === 'atd' || key === 'ata' ? 'YYYY-MM-DD' : ''}
                                                onChange={e => setCurrentRecord({ ...currentRecord, [key]: e.target.value })}
                                            />
                                        )}
                                    </label>
                                ))}
                            </div>


                        </form>
                        <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 rounded-b-xl">
                            <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium">Cancel</button>
                            <button onClick={handleSave} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm flex items-center gap-2">
                                <Save size={18} /> Review & Save
                            </button>
                        </div>
                    </div>
                </div >
            )}
        </div >
    );
};