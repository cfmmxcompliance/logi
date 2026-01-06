
import React, { useState, useEffect, useMemo } from 'react';
import { storageService } from '../services/storageService.ts';
import { CostRecord, Supplier, Shipment } from '../types.ts';
import { Search, DollarSign, Calendar, CheckCircle, AlertCircle, XCircle, Filter, Download, ArrowUpRight, ArrowDownLeft, Upload, FileText, Trash2, Plus, Database, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { ValidationResultModal } from '../components/ValidationResultModal';
import { parseCFDI } from '../utils/cfdiParser';
import { extractTextFromPdf } from '../utils/pdfParser';
import { extractBlAndContainer } from '../utils/extractionLogic';
import { parseCSV } from '../utils/csvParser';
import { initGoogleDrive, uploadFileToDrive, trashFile, ensureAuth } from '../services/googleDriveService.ts';
import { ConfirmationModal } from '../components/ConfirmationModal';
import { ProcessingModal, ProcessingState, INITIAL_PROCESSING_STATE } from '../components/ProcessingModal';
import { ExtractionReviewModal } from '../components/ExtractionReviewModal';
import { useNotification } from '../context/NotificationContext';

// Optimized StatusBadge outside component to avoid re-creation
const StatusBadge = ({ status }: { status?: string }) => {
    const configs = {
        Paid: { bg: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle size={12} />, label: 'Paid' },
        Scheduled: { bg: 'bg-blue-100 text-blue-700', icon: <Calendar size={12} />, label: 'Scheduled' },
        Pending: { bg: 'bg-amber-100 text-amber-700', icon: <AlertCircle size={12} />, label: 'Pending' }
    };

    const config = configs[status as keyof typeof configs] || configs.Pending;

    return (
        <span className={`${config.bg} px-2 py-0.5 rounded-full text-xs font-bold flex items-center gap-1 w-fit`}>
            {config.icon} {config.label}
        </span>
    );
};

export const Controller = () => {
    const { user } = useAuth();
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const csvInputRef = React.useRef<HTMLInputElement>(null);
    const [selectedCostId, setSelectedCostId] = useState<string | null>(null);
    const { showNotification } = useNotification();

    // Custom Modals State
    const [confirmModal, setConfirmModal] = useState({
        isOpen: false,
        title: '',
        message: '',
        type: 'warning' as 'danger' | 'warning' | 'info',
        onConfirm: () => { }
    });

    const [processingState, setProcessingState] = useState<ProcessingState>(INITIAL_PROCESSING_STATE);
    const [isUploading, setIsUploading] = useState(false); // Kept for UI button state

    // State
    const [costs, setCosts] = useState<CostRecord[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [shipments, setShipments] = useState<Shipment[]>([]);

    const [filterPartner, setFilterPartner] = useState('');
    const [filterType, setFilterType] = useState<string>('all');
    const [dateRange, setDateRange] = useState({ start: '', end: '' });

    // BPM Modal State
    const [showBpmModal, setShowBpmModal] = useState(false);
    const [bpmInput, setBpmInput] = useState('');
    const [paymentDateInput, setPaymentDateInput] = useState(''); // New Payment Date State

    // Edit Modal State
    const [editingCost, setEditingCost] = useState<CostRecord | null>(null);

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    // Validation Modal State
    const [validationModal, setValidationModal] = useState({
        isOpen: false,
        successCount: 0,
        totalFiles: 0,
        errors: [] as string[]
    });

    // Review Modal State
    const [reviewModalState, setReviewModalState] = useState<{ isOpen: boolean, items: CostRecord[] }>({ isOpen: false, items: [] });

    // Manual Linking State
    const [showLinkModal, setShowLinkModal] = useState(false);
    const [linkTargetId, setLinkTargetId] = useState<string | null>(null);
    const [linkSearchTerm, setLinkSearchTerm] = useState('');

    // Selection State
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const toggleSelection = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const toggleAll = () => {
        if (selectedIds.size === expenseRows.length) setSelectedIds(new Set());
        else setSelectedIds(new Set(expenseRows.map(r => r.id)));
    };

    // Load Data
    const loadData = () => {
        setCosts(storageService.getCosts());
        setSuppliers(storageService.getSuppliers());
        setShipments(storageService.getShipments());
    };

    useEffect(() => {
        loadData();
        const unsub = storageService.subscribe(loadData);
        initGoogleDrive().catch(err => console.error("Drive Init Error", err));
        return unsub;
    }, []);

    // Derived Data: Optimized O(n) calculation
    const expenseRows = useMemo(() => {
        if (!costs) return [];

        // 1. Create Lookup Maps
        const costsByShipment: Record<string, CostRecord[]> = {};
        const unlinkedrows: any[] = [];
        const supplierMap = new Map(suppliers.map(s => [s.rfc, s.name]));

        // 2. Group Costs efficiently
        costs.forEach(cost => {
            if (cost.shipmentId && shipments.some(s => s.id === cost.shipmentId)) {
                if (!costsByShipment[cost.shipmentId]) costsByShipment[cost.shipmentId] = [];
                costsByShipment[cost.shipmentId].push(cost);
            } else {
                // Map unlinked rows immediately with provider resolution
                const providerName = supplierMap.get(cost.provider) || cost.provider || 'Unknown';
                unlinkedrows.push({
                    id: cost.id,
                    shipmentId: '',
                    blNo: cost.extractedBl ? `${cost.extractedBl} (Unlinked)` : 'Unlinked',
                    container: cost.linkedContainer || '-',
                    invoiceNo: cost.invoiceNo || '-',
                    invoiceDate: cost.date,
                    amount: cost.amount,
                    currency: cost.currency,
                    uuid: cost.uuid || '-',
                    comments: cost.comments || 'Unlinked Expense',
                    bpm: cost.bpm || '-',
                    provider: providerName,
                    aaRef: cost.aaRef || '-',
                    status: cost.status,
                    type: (cost.type === 'Freight' ? 'INLAND' : cost.type) || 'INLAND',
                    submitDate: cost.submitDate,
                    paymentDate: cost.paymentDate,
                    xmlFile: cost.xmlFile,
                    pdfFile: cost.pdfFile,
                    xmlUrl: cost.xmlUrl,
                    pdfUrl: cost.pdfUrl,
                    isVirtual: false,
                    extractedBl: cost.extractedBl,
                    extractedContainer: cost.linkedContainer
                });
            }
        });

        // 3. Map Shipments
        const mappedShipmentRows = shipments.flatMap(shipment => {
            const shipmentCosts = costsByShipment[shipment.id] || [];

            if (shipmentCosts.length > 0) {
                return shipmentCosts.map(cost => {
                    const providerName = supplierMap.get(cost.provider) || cost.provider;
                    return {
                        ...cost,
                        id: cost.id,
                        shipmentId: shipment.id,
                        blNo: shipment.blNo,
                        invoiceDate: cost.date,
                        comments: cost.comments, // Explicit Mapping
                        container: cost.linkedContainer || shipment.containers?.join(', ') || '',
                        provider: providerName,
                        aaRef: cost.aaRef || '-',
                        bpm: cost.bpm || shipment.bpmShipmentNo, // Cost beats Shipment BPM
                        isVirtual: false,
                        type: (cost.type === 'Freight' ? 'INLAND' : cost.type) || 'INLAND', // Normalize Legacy Freight
                        // Preserve original fields for matching logic
                        extractedBl: cost.extractedBl,
                        extractedContainer: cost.linkedContainer,
                        shipmentBl: shipment.blNo,
                        shipmentContainers: shipment.containers
                    } as any;
                });
            } else {
                // Virtual Row
                const defaultProvider = shipment.forwarder || 'Unknown';
                return [{
                    id: `temp_${shipment.id}`,
                    shipmentId: shipment.id,
                    blNo: shipment.blNo,
                    container: shipment.containers?.join(', ') || '',
                    invoiceNo: '-',
                    invoiceDate: shipment.etd || 'N/A',
                    amount: shipment.costs || 0,
                    currency: 'USD',
                    uuid: '-',
                    comments: 'Pending Freight Entry',
                    bpm: shipment.bpmShipmentNo,
                    provider: defaultProvider,
                    status: 'Pending',
                    type: 'INLAND', // Default Virtual Row Type
                    paymentDate: undefined,
                    isVirtual: true,
                    shipmentBl: shipment.blNo,
                    shipmentContainers: shipment.containers
                }];
            }
        });

        const allRows = [...mappedShipmentRows, ...unlinkedrows];

        // 4. Filtering
        const filtered = allRows.filter(item => {
            if (filterPartner) {
                const searchTerms = filterPartner.toLowerCase().split(',').map(t => t.trim()).filter(t => t);
                const searchableText = `
                    ${item.provider} 
                    ${item.invoiceNo} 
                    ${item.uuid} 
                    ${item.blNo} 
                    ${item.container} 
                    ${item.bpm} 
                    ${item.amount}
                    ${item.comments}
                `.toLowerCase();
                if (!searchTerms.some(term => searchableText.includes(term))) return false;
            }


            if (filterType !== 'all' && item.type !== filterType) return false;
            if (dateRange.start && item.invoiceDate < dateRange.start) return false;
            if (dateRange.end && item.invoiceDate > dateRange.end) return false;
            return true;
        });

        return filtered;
    }, [shipments, costs, suppliers, filterPartner, filterType, dateRange]);

    const handleUpdateStatus = async (item: any, newStatus: 'Paid' | 'Pending') => {
        if (item.isVirtual) {
            const newRecord: CostRecord = {
                id: crypto.randomUUID(),
                shipmentId: item.shipmentId,
                type: 'Freight',
                amount: item.amount,
                currency: 'USD',
                provider: item.provider,
                description: 'Freight Cost',
                date: item.invoiceDate,
                status: newStatus,
                paymentDate: newStatus === 'Paid' ? new Date().toISOString().split('T')[0] : undefined,
                invoiceNo: '',
                uuid: '',
                comments: '',
            };
            setCosts(prev => [...prev, newRecord]);
            await storageService.updateCost(newRecord);
        } else {
            const cost = costs.find(c => c.id === item.id);
            if (!cost) return;
            const updated = {
                ...cost,
                status: newStatus,
                paymentDate: newStatus === 'Paid' ? new Date().toISOString().split('T')[0] : undefined
            };
            setCosts(prev => prev.map(c => c.id === item.id ? updated : c));
            await storageService.updateCost(updated);
        }
    };

    const handleUploadClick = (costId: string) => {
        setSelectedCostId(costId);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
            fileInputRef.current.click();
        }
    };

    const handleDownloadTemplate = () => {
        const headers = ['BL (Optional)', 'Container (Optional)', 'Invoice No', 'Date (YYYY-MM-DD)', 'Amount', 'Currency', 'UUID', 'Provider', 'Comments'];
        const csvContent = headers.join(',');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', 'Expenses_Template.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const text = await file.text();
        const rows = parseCSV(text);

        let importedCount = 0;
        const newRecords: CostRecord[] = [];

        // Skip header (i=1)
        for (let i = 1; i < rows.length; i++) {
            const values = rows[i];
            if (values.length < 5) continue;

            const bl = values[0];
            const invoice = values[2];
            const amountStr = values[4];
            const amount = parseFloat(amountStr?.replace(/[^0-9.-]+/g, "") || "0");

            if (!amount && !invoice) continue;

            const newRecord: CostRecord = {
                id: crypto.randomUUID(),
                shipmentId: '',
                type: 'Other',
                amount: amount,
                currency: (values[5] as any) === 'MXN' ? 'MXN' : 'USD',
                provider: values[7] || 'Unknown',
                description: 'Imported via CSV',
                date: values[3] || new Date().toISOString().split('T')[0],
                status: 'Pending',
                extractedBl: bl,
                linkedContainer: values[1],
                invoiceNo: invoice,
                uuid: values[6],
                comments: values[8] || 'CSV Import'
            };

            await storageService.updateCost(newRecord);
            newRecords.push(newRecord);
            importedCount++;
        }

        if (newRecords.length > 0) {
            setCosts(prev => [...prev, ...newRecords]);
            showNotification('Success', `Successfully imported ${importedCount} records.`, 'success');
            e.target.value = '';
        } else {
            showNotification('Warning', "No valid records found in CSV.", 'warning');
        }
    };

    const handleExport = () => {
        // 1. Determine Filename based on Filter
        let filenamePrefix = 'Finance_Report';
        switch (filterType) {
            case 'PREPAYMENTS': filenamePrefix = 'Prepayments'; break;
            case 'INLAND': filenamePrefix = 'Inland'; break;
            case 'BROKER': filenamePrefix = 'AA'; break;
            case 'AIR': filenamePrefix = 'Air'; break;
            default: filenamePrefix = 'Finance_Report';
        }

        const dateStr = new Date().toISOString().split('T')[0];
        const fullFilename = `${filenamePrefix}_${dateStr}.csv`;

        let headers: string[] = [];
        let csvContent = '';

        if (filterType === 'PREPAYMENTS') {
            // Custom Layout for Prepayments
            headers = ['BL', 'USD', 'CONCEPTO', 'BPM', 'MXP', 'CONCEPTO', 'REMITENTE', 'BPM', 'FECHA DE SOLICITUD', 'FECHA DE PAGO'];
            csvContent = [
                headers.join(','),
                ...expenseRows.map(row => {
                    const isUSD = row.currency === 'USD';
                    const isMXN = row.currency === 'MXN';

                    return [
                        row.blNo || '',
                        isUSD ? (row.amount || 0) : '',
                        isUSD ? `"${row.comments || ''}"` : '',
                        isUSD ? (row.bpm || '') : '',
                        isMXN ? (row.amount || 0) : '',
                        isMXN ? `"${row.comments || ''}"` : '',
                        `"${row.provider || ''}"`, // Remitente
                        isMXN ? (row.bpm || '') : '',
                        row.submitDate || row.invoiceDate || '', // SubmitDate (Priority) -> InvoiceDate (Fallback)
                        row.paymentDate || '' // PaymentDate (Explicit)
                    ].join(',');
                })
            ].join('\n');
        } else if (filterType === 'BROKER') {
            // Custom Layout for Broker
            headers = ['BPM', 'AAINVOICE', 'BL', 'AA REFERENCE', 'AA', 'AMOUNT', 'CURRENCY'];
            csvContent = [
                headers.join(','),
                ...expenseRows.map(row => [
                    row.bpm || '',
                    row.invoiceNo || '',
                    row.blNo || '',
                    `"${row.aaRef || ''}"`,
                    `"${row.provider || ''}"`,
                    row.amount || 0,
                    row.currency || 'USD' // Assuming USD default if missing, or generic logic
                ].join(','))
            ].join('\n');
        } else if (filterType === 'INLAND') {
            // Custom Layout for INLAND (Clean, no Currency)
            headers = ['BL', 'Container', 'Invoice', 'Date', 'Amount', 'UUID', 'Comments', 'BPM', 'Supplier'];
            csvContent = [
                headers.join(','),
                ...expenseRows.map(row => [
                    row.blNo || '',
                    `"${row.container || ''}"`,
                    row.invoiceNo || '',
                    row.invoiceDate || '',
                    row.amount || 0,
                    // Skipped Currency
                    row.uuid || '',
                    `"${row.comments || ''}"`,
                    row.bpm || '',
                    `"${row.provider || ''}"`
                ].join(','))
            ].join('\n');
        } else {
            // Standard Layout for Others (Air, All)
            headers = ['BL', 'Container', 'Invoice', 'Date', 'Amount', 'Currency', 'UUID', 'Comments', 'BPM', 'Supplier', 'AA Ref', 'Submit Date', 'Payment Date', 'Status'];
            csvContent = [
                headers.join(','),
                ...expenseRows.map(row => [
                    row.blNo || '',
                    `"${row.container || ''}"`,
                    row.invoiceNo || '',
                    row.invoiceDate || '',
                    row.amount || 0,
                    row.currency || 'USD',
                    row.uuid || '',
                    `"${row.comments || ''}"`,
                    row.bpm || '',
                    `"${row.provider || ''}"`,
                    `"${row.aaRef || ''}"`,
                    row.submitDate || '',
                    row.paymentDate || '',
                    row.status || ''
                ].join(','))
            ].join('\n');
        }

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', fullFilename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showNotification('Export Ready', `Report '${fullFilename}' downloaded successfully.`, 'success');
    };


    // Helper for Base64 conversion
    const fileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = error => reject(error);
        });
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files: File[] = Array.from(e.target.files || []);
        if (files.length === 0) return;

        // Reset & Start Processing Modal
        setProcessingState({
            isOpen: true,
            status: 'loading',
            title: 'Processing Invoices',
            message: 'Initializing...',
            progress: 0
        });
        setIsUploading(true);

        const xmlFiles = files.filter(f => f.name.toLowerCase().endsWith('.xml'));
        const pdfFiles = files.filter(f => f.name.toLowerCase().endsWith('.pdf'));

        if (xmlFiles.length === 0) {
            setProcessingState(prev => ({ ...prev, isOpen: false }));
            setValidationModal({
                isOpen: true,
                successCount: 0,
                totalFiles: pdfFiles.length,
                errors: ["Please upload the XML file (required) to process the invoice."]
            });
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }

        let successCount = 0;
        let errorDetails: string[] = [];
        const newRecords: CostRecord[] = [];
        const totalFiles = xmlFiles.length;

        // --- PROCESSING LOOP ---
        for (let i = 0; i < totalFiles; i++) {
            const xmlFile = xmlFiles[i];

            // Update Progress
            setProcessingState(prev => ({
                ...prev,
                message: `Processing ${i + 1} of ${totalFiles}: ${xmlFile.name}`,
                progress: ((i) / totalFiles) * 100
            }));

            try {
                // 1. Parsing
                console.log(`Processing XML: ${xmlFile.name}`);
                const xmlResult = await parseCFDI(xmlFile);

                // 2. Find PDF
                const basename = xmlFile.name.substring(0, xmlFile.name.lastIndexOf('.'));
                const pdfFile = pdfFiles.find(f => f.name.toLowerCase().includes(basename.toLowerCase()));

                // 3. Extraction with Robust Fallback
                let extractedBl = (xmlResult.extractedBl || '').trim();
                let extractedContainer = xmlResult.extractedContainer || '';

                if (pdfFile && !extractedBl) {
                    setProcessingState(prev => ({ ...prev, message: `Scanning PDF for ${xmlFile.name}...` }));
                    console.log(`Parsing PDF for ${xmlFile.name}...`);
                    try {
                        const text = await extractTextFromPdf(pdfFile);
                        const extraction = extractBlAndContainer(text);

                        if (extraction.extractedBl) extractedBl = extraction.extractedBl;
                        if (extraction.extractedContainer) extractedContainer = extraction.extractedContainer;

                        // Filename heuristic
                        if (!extractedBl) {
                            const match = pdfFile.name.match(/[A-Z]{4}[0-9]{7,12}/i);
                            if (match) extractedBl = match[0].toUpperCase();
                        }
                    } catch (pdfErr) {
                        console.warn(`PDF Parsing failed for ${pdfFile.name}`, pdfErr);
                    }
                }

                // 3b. Generate URLs (Base64 for persistence)
                const xmlUrlRaw = await fileToBase64(xmlFile);
                const pdfUrlRaw = pdfFile ? await fileToBase64(pdfFile) : '';

                // 4. Linkage
                const cleanBl = extractedBl.replace(/[^A-Z0-9]/gi, '');
                const targetShipment = shipments.find(s =>
                    cleanBl && s.blNo && s.blNo.replace(/[^A-Z0-9]/gi, '').includes(cleanBl)
                );

                console.log(`BL Found: ${extractedBl} -> Linked: ${targetShipment ? targetShipment.blNo : 'No'}`);

                // 5. Construct Record
                const existingCost = costs.find(c => c.uuid === xmlResult.uuid && c.uuid && c.uuid !== '-');
                const validId = existingCost?.id || crypto.randomUUID();

                const finalRecord: CostRecord = {
                    id: validId,
                    shipmentId: targetShipment?.id || existingCost?.shipmentId || '',
                    type: existingCost?.type || 'INLAND',
                    amount: xmlResult.amount,
                    currency: xmlResult.currency as any,
                    provider: xmlResult.senderName,
                    description: existingCost?.description || xmlResult.description || 'Freight Cost',
                    date: xmlResult.date,
                    status: existingCost?.status || 'Pending',

                    // Metadata
                    invoiceNo: xmlResult.invoiceNo,
                    uuid: xmlResult.uuid,
                    // Use XML Description for Comments (User Request)
                    comments: xmlResult.description || (targetShipment ? `Linked to ${targetShipment.blNo}` : 'Unlinked - Manual Action Required'),

                    // Linkage Data
                    extractedBl: extractedBl || (targetShipment ? targetShipment.blNo : ''),
                    linkedContainer: extractedContainer,

                    // Files
                    xmlFile: xmlFile.name,
                    pdfFile: pdfFile?.name || (existingCost?.pdfFile || ''),
                    // PRIORITIZE NEW UPLOAD: If we parsed a file, use its URL. Only fallback if no new file (unreachable here usually as we iterate xmlFiles)
                    xmlUrl: xmlUrlRaw || existingCost?.xmlUrl || '',
                    pdfUrl: pdfUrlRaw || existingCost?.pdfUrl || '',
                    xmlDriveId: existingCost?.xmlDriveId || '',
                    pdfDriveId: existingCost?.pdfDriveId || ''
                };

                // 6. Persistence
                // REMOVED: await storageService.updateCost(finalRecord);

                // Add to Pending Queue instead of Saving
                newRecords.push(finalRecord);

            } catch (err: any) {
                console.error("Critical Error processing file", err);
                errorDetails.push(`${xmlFile.name}: ${err.message}`);
            }
        }

        setIsUploading(false);
        setProcessingState(prev => ({ ...prev, isOpen: false }));
        if (fileInputRef.current) fileInputRef.current.value = '';

        // If we have records, show Review Modal
        if (newRecords.length > 0) {
            setReviewModalState({ isOpen: true, items: newRecords });
        } else if (errorDetails.length > 0) {
            setValidationModal({
                isOpen: true,
                successCount: 0,
                totalFiles: xmlFiles.length,
                errors: errorDetails
            });
        }
    };

    const handleReviewSave = async (reviewedItems: CostRecord[]) => {
        setReviewModalState({ isOpen: false, items: [] });

        // Restart Processing Modal for Saving
        setProcessingState({
            isOpen: true,
            status: 'loading',
            title: 'Saving Records',
            message: 'Persisting data to database...',
            progress: 0
        });

        let successCount = 0;
        const errorDetails: string[] = [];
        const savedRecords: CostRecord[] = [];

        for (let i = 0; i < reviewedItems.length; i++) {
            const item = reviewedItems[i];
            setProcessingState(prev => ({
                ...prev,
                message: `Saving ${i + 1} of ${reviewedItems.length}: ${item.invoiceNo}`,
                progress: ((i) / reviewedItems.length) * 100
            }));

            try {
                // 1. Re-link logic if user changed BL manually
                if (item.extractedBl) {
                    const cleanBl = item.extractedBl.replace(/[^A-Z0-9]/gi, '');
                    const targetShipment = shipments.find(s =>
                        cleanBl && s.blNo && s.blNo.replace(/[^A-Z0-9]/gi, '').includes(cleanBl)
                    );
                    if (targetShipment) {
                        item.shipmentId = targetShipment.id;
                        // Only overwrite comments if it was a default "Linked to..." or "Unlinked..." message, OR if empty.
                        // If it has a real description (from XML), keep it.
                        if (!item.comments || item.comments.startsWith('Linked to') || item.comments.startsWith('Unlinked')) {
                            item.comments = `Linked to ${targetShipment.blNo}`;
                        }
                        item.extractedBl = targetShipment.blNo || item.extractedBl; // Normalize if linked
                    } else {
                        item.shipmentId = '';
                        if (!item.comments || item.comments.startsWith('Linked to') || item.comments.startsWith('Unlinked')) {
                            item.comments = 'Unlinked - Manual Action Required';
                        }
                    }
                }

                await storageService.updateCost(item);
                savedRecords.push(item);
                successCount++;
            } catch (e: any) {
                console.error("Save Error", e);
                errorDetails.push(`Error saving ${item.invoiceNo}: ${e.message}`);
            }
        }

        setProcessingState(prev => ({ ...prev, status: 'success', message: 'All records saved!', progress: 100 }));

        // Optimistic UI Update
        if (savedRecords.length > 0) {
            setCosts(currentCosts => {
                const map = new Map(currentCosts.map(c => [c.id, c]));
                savedRecords.forEach(r => map.set(r.id, r));
                return Array.from(map.values());
            });
        }

        setTimeout(() => {
            setProcessingState(prev => ({ ...prev, isOpen: false }));
            setValidationModal({
                isOpen: true,
                successCount,
                totalFiles: reviewedItems.length,
                errors: errorDetails
            });
            loadData();
        }, 800);
    };

    const handleDelete = (id: string) => {
        setConfirmModal({
            isOpen: true,
            title: 'Delete Record',
            message: 'Are you sure you want to delete this cost record? This action cannot be undone.',
            type: 'danger',
            onConfirm: async () => {
                try {
                    await storageService.deleteCost(id);
                    setCosts(prev => prev.filter(c => c.id !== id));
                    if (selectedIds.has(id)) {
                        const newSet = new Set(selectedIds);
                        newSet.delete(id);
                        setSelectedIds(newSet);
                    }
                    showNotification('Deleted', 'Record deleted successfully.', 'success');
                } catch (e) {
                    console.error("Delete Failed", e);
                    showNotification('Error', 'Failed to delete record.', 'error');
                } finally {
                    setConfirmModal(prev => ({ ...prev, isOpen: false }));
                }
            }
        });
    };

    const handleBulkDelete = () => {
        if (selectedIds.size === 0) return;
        const count = selectedIds.size;

        setConfirmModal({
            isOpen: true,
            title: 'Bulk Delete',
            message: `Are you sure you want to delete ${count} items?`,
            type: 'danger',
            onConfirm: async () => {
                setProcessingState({ isOpen: true, status: 'loading', title: 'Deleting Items', message: 'Processing deletion...', progress: 0 });
                try {
                    const idsToDelete: string[] = Array.from(selectedIds);
                    const results = await Promise.allSettled(idsToDelete.map(id => storageService.deleteCost(id)));

                    const successfulIds = new Set<string>();
                    let failCount = 0;

                    results.forEach((res, index) => {
                        if (res.status === 'fulfilled') successfulIds.add(idsToDelete[index]);
                        else failCount++;
                    });

                    setCosts(prev => prev.filter(c => !successfulIds.has(c.id)));

                    const newSelection = new Set(selectedIds);
                    successfulIds.forEach(id => newSelection.delete(id));
                    setSelectedIds(newSelection);

                    setProcessingState(prev => ({ ...prev, isOpen: false }));
                    setConfirmModal(prev => ({ ...prev, isOpen: false }));

                    if (failCount > 0) {
                        showNotification('Partial Success', `Deleted ${successfulIds.size} items. Failed: ${failCount}`, 'warning');
                    } else {
                        showNotification('Success', `Successfully deleted ${successfulIds.size} items.`, 'success');
                    }
                } catch (error) {
                    console.error("Bulk Delete System Error", error);
                    setProcessingState(prev => ({ ...prev, isOpen: false }));
                    showNotification('Error', 'System error during bulk delete.', 'error');
                }
            }
        });
    };

    const handleApplyBpm = async () => {
        if (!bpmInput.trim() || selectedIds.size === 0) return;

        try {
            const submitDate = new Date().toISOString().split('T')[0]; // Auto-set Submit Date to Today

            for (const id of selectedIds) {
                const row = costs.find(r => r.id === id);
                if (row) {
                    await storageService.updateCost({
                        ...row,
                        bpm: bpmInput.trim(),
                        submitDate: submitDate,         // Set Submit Date
                        paymentDate: paymentDateInput || undefined // Set Payment Date (optional)
                    });
                }
            }
            setSelectedIds(new Set());
            setShowBpmModal(false);
            setBpmInput('');
            setPaymentDateInput(''); // Reset
            loadData();
            showNotification('Success', 'BPM & Dates Assigned successfully!', 'success');
        } catch (err) {
            console.error("Error applying BPM:", err);
            showNotification('Error', 'Failed to update BPM.', 'error');
        }
    };

    // Manual Linking Handlers
    const handleManualLink = (costId: string) => {
        setLinkTargetId(costId);
        setLinkSearchTerm('');
        setShowLinkModal(true);
    };

    const handleLinkSave = async (shipmentId: string) => {
        if (!linkTargetId) return;

        const costToUpdate = costs.find(c => c.id === linkTargetId);
        const selectedShipment = shipments.find(s => s.id === shipmentId);

        if (costToUpdate && selectedShipment) {
            try {
                // Fix: 'mblNo' and 'hblNo' do not exist on Shipment. Use 'blNo'.
                const blToSave = selectedShipment.blNo || "MANUAL-LINK";
                await storageService.updateCost({
                    ...costToUpdate,
                    shipmentId: shipmentId,
                    extractedBl: blToSave
                });

                setShowLinkModal(false);
                setLinkTargetId(null);
                loadData();
                showNotification('Success', 'Linked shipment successfully', 'success');
            } catch (err) {
                console.error("Error linking shipment:", err);
                showNotification('Error', 'Failed to link shipment', 'error');
            }
        }
    };

    return (
        <div className="space-y-6">
            <ConfirmationModal
                isOpen={confirmModal.isOpen}
                title={confirmModal.title}
                message={confirmModal.message}
                type={confirmModal.type}
                onConfirm={confirmModal.onConfirm}
                onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
            />
            <ProcessingModal
                state={processingState}
                onClose={() => setProcessingState(prev => ({ ...prev, isOpen: false }))}
            />
            <ExtractionReviewModal
                isOpen={reviewModalState.isOpen}
                items={reviewModalState.items}
                onSave={handleReviewSave}
                onCancel={() => setReviewModalState({ isOpen: false, items: [] })}
            />

            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".xml,.pdf"
                multiple
                onChange={handleFileChange}
            />
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Inland Freight Control</h1>
                    <p className="text-slate-500 text-sm">Manage partner payments and track expenses.</p>
                </div>
                <div className="flex gap-2">
                    {selectedIds.size > 0 && (
                        <button
                            onClick={handleBulkDelete}
                            className="bg-red-50 text-red-600 border border-red-200 px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm hover:bg-red-100 transition-all font-medium text-sm"
                        >
                            <span className="font-bold">{selectedIds.size}</span> Delete Selected
                        </button>
                    )}
                    <input
                        type="file"
                        ref={csvInputRef}
                        className="hidden"
                        accept=".csv"
                        onChange={handleImportCSV}
                    />
                    {selectedIds.size > 0 && (
                        <button
                            onClick={() => setShowBpmModal(true)}
                            className="bg-indigo-50 text-indigo-600 border border-indigo-200 px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm hover:bg-indigo-100 transition-all font-medium text-sm"
                        >
                            <span className="font-bold">{selectedIds.size}</span> Assign BPM
                        </button>
                    )}
                    <button
                        onClick={handleDownloadTemplate}
                        className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm hover:bg-slate-50 transition-all font-medium text-sm">
                        <FileText size={16} /> Template
                    </button>
                    <button
                        onClick={() => csvInputRef.current?.click()}
                        className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm hover:bg-slate-50 transition-all font-medium text-sm">
                        <Upload size={16} /> Import CSV
                    </button>
                    <button
                        onClick={() => {
                            setSelectedCostId(null);
                            if (fileInputRef.current) fileInputRef.current.click();
                        }}
                        disabled={isUploading}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm hover:bg-blue-700 transition-all font-medium text-sm disabled:opacity-70"
                    >
                        {isUploading ? <span className="animate-spin">⌛</span> : <Upload size={16} />}
                        {isUploading ? 'Uploading...' : 'Upload Invoice'}
                    </button>
                    <button
                        onClick={handleExport}
                        className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm hover:bg-slate-50 transition-all font-medium text-sm">
                        <Download size={16} /> Export Report
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap gap-4 items-center">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                        type="text"
                        placeholder="Search anything (comma separated)..."
                        className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        value={filterPartner}
                        onChange={(e) => setFilterPartner(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Filter size={18} className="text-slate-400" />
                    <select
                        className="border border-slate-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                    >
                        <option value="all">All Types</option>
                        <option value="PREPAYMENTS">PREPAYMENTS</option>
                        <option value="INLAND">INLAND</option>
                        <option value="BROKER">BROKER</option>
                        <option value="AIR">AIR</option>
                        <option value="Freight">Freight (Legacy)</option>
                        <option value="Customs">Customs (Legacy)</option>
                        <option value="Transport">Transport (Legacy)</option>
                        <option value="Handling">Handling (Legacy)</option>
                        <option value="Other">Other (Legacy)</option>
                    </select>
                </div>
                <div className="flex items-center gap-2 border-l border-slate-200 pl-4">
                    <input
                        type="date"
                        className="border border-slate-200 rounded-lg py-2 px-3 text-sm"
                        value={dateRange.start}
                        onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                    />
                    <span className="text-slate-400">-</span>
                    <input
                        type="date"
                        className="border border-slate-200 rounded-lg py-2 px-3 text-sm"
                        value={dateRange.end}
                        onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                    />
                </div>
            </div>

            {/* Expenses Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 whitespace-nowrap">
                            <tr>
                                <th className="px-4 py-3 w-[40px]">
                                    <input
                                        type="checkbox"
                                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                        checked={expenseRows.length > 0 && selectedIds.size === expenseRows.length}
                                        onChange={toggleAll}
                                    />
                                </th>
                                <th className="px-4 py-3 text-center">Actions</th>
                                <th className="px-4 py-3 text-center">Type</th>
                                <th className="px-4 py-3 text-center">Booking</th>
                                <th className="px-4 py-3 text-center">ValCont</th>
                                <th className="px-4 py-3 text-center">ValCot</th>
                                <th className="px-4 py-3 text-center">Variación</th>
                                <th className="px-4 py-3">BL (Invoice)</th>
                                <th className="px-4 py-3">Container (Invoice)</th>
                                <th className="px-4 py-3">Invoice</th>
                                <th className="px-4 py-3">Currency</th>
                                <th className="px-4 py-3">Date</th>
                                <th className="px-4 py-3 text-right">Amount</th>
                                <th className="px-4 py-3">UUID</th>
                                <th className="px-4 py-3">Comments</th>
                                <th className="px-4 py-3">BPM</th>
                                <th className="px-4 py-3">Submit Date</th>
                                <th className="px-4 py-3">Payment Date</th>
                                <th className="px-4 py-3">Supplier</th>
                                <th className="px-4 py-3">AA Ref</th>
                                <th className="px-4 py-3">Annexes</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 whitespace-nowrap">
                            {expenseRows.length > 0 ? expenseRows.map((row: any) => (
                                <tr key={row.id} className={`hover:bg-slate-50 transition-colors ${selectedIds.has(row.id) ? 'bg-blue-50' : ''} ${row.isVirtual ? 'bg-slate-50/50' : ''}`}>
                                    <td className="px-4 py-3">
                                        <input
                                            type="checkbox"
                                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                            checked={selectedIds.has(row.id)}
                                            onChange={() => toggleSelection(row.id)}
                                        />
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center justify-center gap-3">
                                            {/* Edit */}
                                            <button
                                                onClick={() => {
                                                    const record = costs.find(c => c.id === row.id) || { ...row, id: row.id } as CostRecord;
                                                    setEditingCost(record);
                                                }}
                                                className="text-slate-400 hover:text-blue-600 transition-colors"
                                                title="Edit Record"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-pencil"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>
                                            </button>

                                            {/* Delete */}
                                            <button
                                                onClick={() => handleDelete(row.id)}
                                                className="text-slate-400 hover:text-red-500 transition-colors"
                                                title="Delete Record"
                                                disabled={row.isVirtual}
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-trash-2"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" /></svg>
                                            </button>
                                        </div>
                                    </td>
                                    {/* Type Cell */}
                                    <td className="px-4 py-3 text-center text-xs font-bold text-slate-500 bg-slate-50/50 rounded-lg mx-2 border border-slate-100">
                                        {row.type || 'INLAND'}
                                    </td>
                                    {/* Booking Validation (BL Match) */}
                                    <td className="px-4 py-3 text-center">
                                        <div className="flex flex-col items-center gap-1">
                                            {row.extractedBl && row.shipmentBl && row.extractedBl.replace(/[^A-Z0-9]/gi, '') === row.shipmentBl.replace(/[^A-Z0-9]/gi, '') ? (
                                                <div title={`Matched: ${row.extractedBl}`} className="inline-flex justify-center items-center text-emerald-500 bg-emerald-50 rounded-full p-1"><CheckCircle size={14} /></div>
                                            ) : !row.isVirtual ? (
                                                <div title={row.extractedBl ? `Mismatch: Found ${row.extractedBl}, Expected ${row.shipmentBl}` : "BL Not Found in Invoice"} className="inline-flex justify-center items-center text-red-500 bg-red-50 rounded-full p-1"><XCircle size={14} /></div>
                                            ) : (
                                                <span className="text-slate-300 text-[10px]">-</span>
                                            )}
                                            {row.shipmentBl && <span className="text-[10px] font-mono text-slate-500">{row.shipmentBl}</span>}
                                        </div>
                                    </td>

                                    {/* Container Validation */}
                                    <td className="px-4 py-3 text-center">
                                        {row.extractedContainer && row.shipmentContainers && row.shipmentContainers.some((c: string) => {
                                            const cleanC = c.replace(/[^A-Z0-9]/gi, '');
                                            const cleanExt = row.extractedContainer.replace(/[^A-Z0-9]/gi, '');
                                            return cleanC === cleanExt;
                                        }) ? (
                                            <div title={`Matched: ${row.extractedContainer}`} className="inline-flex justify-center items-center text-emerald-500 bg-emerald-50 rounded-full p-1"><CheckCircle size={14} /></div>
                                        ) : !row.isVirtual ? (
                                            <div title={row.extractedContainer ? `Mismatch: ${row.extractedContainer} not in tracking` : "Container Not Found in Invoice"} className="inline-flex justify-center items-center text-red-500 bg-red-50 rounded-full p-1"><XCircle size={14} /></div>
                                        ) : (
                                            <span className="text-slate-300 text-[10px]">-</span>
                                        )}
                                    </td>

                                    {/* ValCot & Variación */}
                                    {(() => {
                                        const supplier = suppliers.find(s => s.name === row.provider);
                                        const quote = supplier?.quotations?.find(q => q.concept === (row.description || row.comments || ''));

                                        const hasQuote = !!quote;
                                        const isMatch = quote && Math.abs(quote.price - row.amount) < 0.1;

                                        const variation = hasQuote ? (quote!.price - row.amount) : null;
                                        const isVariationZero = variation !== null && Math.abs(variation) < 0.1;

                                        return (
                                            <>
                                                <td className="px-4 py-3 text-center">
                                                    {isMatch ? (
                                                        <div className="flex justify-center text-emerald-500"><CheckCircle size={16} /></div>
                                                    ) : (
                                                        <div className="flex justify-center text-red-500" title={hasQuote ? `Expected: ${quote?.price.toLocaleString()}` : "No Quote Found for this Concept/Provider"}>
                                                            <XCircle size={16} />
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-center font-mono text-xs">
                                                    {isVariationZero ? (
                                                        <div className="flex justify-center text-emerald-500"><CheckCircle size={16} /></div>
                                                    ) : variation !== null ? (
                                                        <span className="text-red-600 font-bold">{variation.toFixed(2)}</span>
                                                    ) : (
                                                        <span className="text-slate-300">-</span>
                                                    )}
                                                </td>
                                            </>
                                        );
                                    })()}

                                    <td className="px-4 py-3 font-mono text-blue-600">
                                        <div className="flex items-center gap-2 justify-between">
                                            <span>{row.extractedBl || '-'}</span>
                                            {!row.shipmentId && (
                                                <button
                                                    onClick={() => handleManualLink(row.id)}
                                                    className="text-amber-600 hover:text-amber-700 flex items-center gap-1 text-[10px] font-bold bg-amber-50 px-2 py-1 rounded border border-amber-200"
                                                    title="Link to Shipment Manually"
                                                >
                                                    <Plus size={10} /> Link
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-slate-600 max-w-[150px] truncate" title={row.extractedContainer || ''}>{row.extractedContainer || '-'}</td>
                                    <td className="px-4 py-3 text-slate-600 font-mono font-medium text-emerald-700">
                                        {row.invoiceNo !== '-' ? row.invoiceNo : <span className="text-slate-300">-</span>}
                                    </td>
                                    <td className="px-4 py-3 text-slate-600 font-mono text-center">{row.currency}</td>
                                    <td className="px-4 py-3 text-slate-600">{row.invoiceDate}</td>
                                    <td className="px-4 py-3 text-right font-mono font-medium">
                                        {row.amount.toLocaleString()} <span className="text-[10px] text-slate-400">USD</span>
                                    </td>
                                    <td className="px-4 py-3 text-slate-400 font-mono text-[10px] max-w-[100px] truncate" title={row.uuid}>{row.uuid}</td>
                                    <td className="px-4 py-3 text-slate-500 italic max-w-[150px] truncate">{row.comments}</td>
                                    <td className="px-4 py-3 text-slate-600 font-mono">{row.bpm || '-'}</td>
                                    <td className="px-4 py-3 text-slate-600 text-xs">{row.submitDate || '-'}</td>
                                    <td className="px-4 py-3 text-slate-600 text-xs">{row.paymentDate || '-'}</td>
                                    <td className="px-4 py-3 font-medium text-slate-700">{row.provider}</td>
                                    {/* 1. Celda AA Ref (Ajustada: Solo texto) */}
                                    <td className="px-4 py-3 text-slate-600 font-mono">
                                        {row.aaRef || '-'}
                                    </td>

                                    {/* 2. Celda Annexes (Donde ahora vivirán tus botones) */}
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            {(row.xmlFile || row.pdfFile) ? (
                                                <div className="flex gap-1">
                                                    {row.xmlFile && (
                                                        <a
                                                            href={row.xmlUrl}
                                                            download={row.xmlFile}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            title={`Download ${row.xmlFile}`}
                                                            className="bg-emerald-100 text-emerald-600 px-1 rounded text-[9px] border border-emerald-200 cursor-pointer hover:bg-emerald-200 flex items-center gap-1"
                                                        >
                                                            <FileText size={8} /> XML
                                                        </a>
                                                    )}
                                                    {row.pdfFile && (
                                                        <a
                                                            href={row.pdfUrl}
                                                            download={row.pdfFile}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            title={`Download ${row.pdfFile}`}
                                                            className="bg-red-100 text-red-600 px-1 rounded text-[9px] border border-red-200 hover:bg-red-200 transition-colors flex items-center gap-1"
                                                        >
                                                            <FileText size={8} /> PDF
                                                        </a>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-slate-300 text-[10px]">-</span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={16} className="px-6 py-12 text-center text-slate-400">
                                        No expenses found matching the filters.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* BPM Assignment Modal */}
            {showBpmModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="bg-slate-50 border-b border-slate-100 p-4 flex justify-between items-center">
                            <h3 className="font-bold text-slate-700">Link to BPM Process</h3>
                            <button onClick={() => setShowBpmModal(false)} className="text-slate-400 hover:text-slate-600">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>

                        <div className="p-6 space-y-6 overflow-y-auto">
                            {/* Invoices List */}
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <label className="text-xs font-bold text-slate-500 uppercase">Selected Invoices</label>
                                    <button
                                        onClick={() => copyToClipboard(Array.from(selectedIds).map(id => expenseRows.find(r => r.id === id)?.invoiceNo).filter(n => n && n !== '-').join(', '))}
                                        className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                        Copy List
                                    </button>
                                </div>
                                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-sm font-mono text-slate-600 break-words max-h-24 overflow-y-auto">
                                    {Array.from(selectedIds).map(id => expenseRows.find(r => r.id === id)?.invoiceNo).filter(n => n && n !== '-').join(', ') || 'No Invoices'}
                                </div>
                            </div>

                            {/* UUIDs List */}
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <label className="text-xs font-bold text-slate-500 uppercase">Selected UUIDs</label>
                                    <button
                                        onClick={() => copyToClipboard(Array.from(selectedIds).map(id => expenseRows.find(r => r.id === id)?.uuid).filter(n => n && n !== '-').join(', '))}
                                        className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                        Copy List
                                    </button>
                                </div>
                                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-sm font-mono text-slate-600 break-words max-h-24 overflow-y-auto">
                                    {Array.from(selectedIds).map(id => expenseRows.find(r => r.id === id)?.uuid).filter(n => n && n !== '-').join(', ') || 'No UUIDs'}
                                </div>
                            </div>

                            {/* Comments List */}
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <label className="text-xs font-bold text-slate-500 uppercase">Selected Comments</label>
                                    <button
                                        onClick={() => copyToClipboard(Array.from(selectedIds).map(id => expenseRows.find(r => r.id === id)?.comments).filter(n => n && n !== '-').join(', '))}
                                        className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                        Copy List
                                    </button>
                                </div>
                                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-sm font-mono text-slate-600 break-words max-h-24 overflow-y-auto">
                                    {Array.from(selectedIds).map(id => expenseRows.find(r => r.id === id)?.comments).filter(n => n && n !== '-').join(', ') || 'No Comments'}
                                </div>
                            </div>

                            {/* Total Amount */}
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <label className="text-xs font-bold text-slate-500 uppercase">Total Amount</label>
                                    <button
                                        onClick={() => copyToClipboard((Array.from(selectedIds).reduce((acc, id) => acc + (expenseRows.find(r => r.id === id)?.amount || 0), 0) as number).toFixed(2))}
                                        className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                        Copy Sum
                                    </button>
                                </div>
                                <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-100 text-2xl font-bold text-emerald-700 text-center">
                                    ${(Array.from(selectedIds).reduce((acc, id) => acc + (expenseRows.find(r => r.id === id)?.amount || 0), 0) as number).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                            </div>

                            {/* BPM Input */}
                            <div className="space-y-4 pt-4 border-t border-slate-100">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">
                                        BPM Process URL / ID
                                    </label>
                                    <input
                                        type="text"
                                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                        placeholder="Paste BPM Link or ID..."
                                        value={bpmInput}
                                        onChange={(e) => setBpmInput(e.target.value)}
                                        autoFocus
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">
                                        Payment Date (Optional)
                                    </label>
                                    <input
                                        type="date"
                                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={paymentDateInput}
                                        onChange={(e) => setPaymentDateInput(e.target.value)}
                                    />
                                    <p className="text-[10px] text-slate-400 mt-1">
                                        Select the date when the payment was scheduled or made.
                                    </p>
                                </div>

                                <div className="flex gap-3 pt-2">
                                    <p className="text-xs text-slate-400 mt-2">
                                        This code will be applied to all {selectedIds.size} selected records.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-slate-50 p-4 border-t border-slate-100 flex justify-end gap-3">
                            <button
                                onClick={() => setShowBpmModal(false)}
                                className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-200 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleApplyBpm}
                                disabled={!bpmInput.trim()}
                                className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold shadow-sm hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Apply Link
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Manual Link Modal */}
            {showLinkModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full flex flex-col max-h-[80vh]">
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-amber-50">
                            <h3 className="font-bold text-amber-800 flex items-center gap-2">
                                <Database size={18} /> Link to Shipment
                            </h3>
                            <button onClick={() => setShowLinkModal(false)}><XCircle size={20} className="text-amber-400 hover:text-amber-600" /></button>
                        </div>
                        <div className="p-4">
                            <input
                                type="text"
                                autoFocus
                                placeholder="Search Shipment (MBL, HBL, Container...)"
                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-amber-500 mb-4"
                                value={linkSearchTerm}
                                onChange={(e) => setLinkSearchTerm(e.target.value)}
                            />
                            <div className="overflow-y-auto max-h-[300px] space-y-2">
                                {shipments
                                    .filter(s =>
                                        !linkSearchTerm ||
                                        (s.mblNo || '').toLowerCase().includes(linkSearchTerm.toLowerCase()) ||
                                        (s.hblNo || '').toLowerCase().includes(linkSearchTerm.toLowerCase()) ||
                                        (s.refNo || '').toLowerCase().includes(linkSearchTerm.toLowerCase())
                                    )
                                    .slice(0, 20)
                                    .map(shipment => (
                                        <div key={shipment.id} className="border p-3 rounded hover:bg-slate-50 cursor-pointer flex justify-between items-center group"
                                            onClick={() => handleLinkSave(shipment.id)}>
                                            <div>
                                                <div className="font-bold text-slate-700">{shipment.idShort}</div>
                                                <div className="text-xs text-slate-500">MBL: {shipment.mblNo || '-'} | HBL: {shipment.hblNo || '-'}</div>
                                            </div>
                                            <div className="opacity-0 group-hover:opacity-100 text-blue-600 font-bold text-xs">Select →</div>
                                        </div>
                                    ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Record Modal */}
            {
                editingCost && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]">
                            <div className="bg-slate-50 border-b border-slate-100 p-4 flex justify-between items-center">
                                <h3 className="font-bold text-slate-700">Edit Expense Details</h3>
                                <button onClick={() => setEditingCost(null)} className="text-slate-400 hover:text-slate-600">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                </button>
                            </div>

                            <div className="p-6 overflow-y-auto grid grid-cols-2 gap-4">
                                <div className="col-span-1">
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Invoice No</label>
                                    <input
                                        type="text"
                                        className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={editingCost.invoiceNo || ''}
                                        onChange={e => setEditingCost({ ...editingCost, invoiceNo: e.target.value })}
                                    />
                                </div>
                                <div className="col-span-1">
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Date</label>
                                    <input
                                        type="date"
                                        className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={editingCost.date || ''}
                                        onChange={e => setEditingCost({ ...editingCost, date: e.target.value })}
                                    />
                                </div>

                                <div className="col-span-1">
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Amount</label>
                                    <input
                                        type="number"
                                        className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={editingCost.amount || 0}
                                        onChange={e => setEditingCost({ ...editingCost, amount: parseFloat(e.target.value) || 0 })}
                                    />
                                </div>
                                <div className="col-span-1">
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Currency</label>
                                    <select
                                        className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={editingCost.currency || 'USD'}
                                        onChange={e => setEditingCost({ ...editingCost, currency: e.target.value })}
                                    >
                                        <option value="USD">USD</option>
                                        <option value="MXN">MXN</option>
                                        <option value="EUR">EUR</option>
                                        <option value="CNY">CNY</option>
                                    </select>
                                </div>

                                <div className="col-span-1">
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Type</label>
                                    <select
                                        className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={editingCost.type || 'INLAND'}
                                        onChange={e => setEditingCost({ ...editingCost, type: e.target.value })}
                                    >
                                        <option value="PREPAYMENTS">PREPAYMENTS</option>
                                        <option value="INLAND">INLAND</option>
                                        <option value="BROKER">BROKER</option>
                                        <option value="AIR">AIR</option>
                                        {/* Legacy Options */}
                                        <option value="Freight">Freight</option>
                                        <option value="Customs">Customs</option>
                                        <option value="Transport">Transport</option>
                                        <option value="Handling">Handling</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>

                                {editingCost.type === 'BROKER' && (
                                    <div className="col-span-1 animate-in fade-in zoom-in duration-300">
                                        <label className="block text-xs font-bold text-blue-600 uppercase mb-1">AA Ref</label>
                                        <input
                                            type="text"
                                            className="w-full border border-blue-200 bg-blue-50 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                                            value={editingCost.aaRef || ''}
                                            maxLength={20}
                                            onChange={e => setEditingCost({ ...editingCost, aaRef: e.target.value })}
                                            placeholder="Ref. Operativa"
                                        />
                                    </div>
                                )}

                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Provider / Supplier</label>
                                    <input
                                        type="text"
                                        className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={editingCost.provider || ''}
                                        onChange={e => setEditingCost({ ...editingCost, provider: e.target.value })}
                                        list="providers-list"
                                    />
                                    <datalist id="providers-list">
                                        {suppliers.map(s => <option key={s.id} value={s.name} />)}
                                    </datalist>
                                </div>

                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Description / Comments</label>
                                    <input
                                        type="text"
                                        className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={editingCost.comments || ''}
                                        onChange={e => setEditingCost({ ...editingCost, comments: e.target.value })}
                                    />
                                </div>

                                <div className="col-span-1">
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">UUID</label>
                                    <input
                                        type="text"
                                        className="w-full border border-slate-300 rounded px-3 py-2 text-sm font-mono text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={editingCost.uuid || ''}
                                        onChange={e => setEditingCost({ ...editingCost, uuid: e.target.value })}
                                    />
                                </div>
                                <div className="col-span-1">
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">BPM Code</label>
                                    <input
                                        type="text"
                                        className="w-full border border-slate-300 rounded px-3 py-2 text-sm font-mono text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={editingCost.bpm || ''}
                                        onChange={e => setEditingCost({ ...editingCost, bpm: e.target.value })}
                                    />
                                </div>

                                {/* Helper to replace files - reuses existing logic by clicking hidden input */}
                                <div className="col-span-2 border-t border-slate-100 pt-4 mt-2">
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Files (Replace)</label>
                                    <div className="flex gap-4">
                                        <button
                                            type="button"
                                            onClick={() => handleUploadClick(editingCost.id)}
                                            className="text-blue-600 text-sm hover:underline flex items-center gap-1"
                                        >
                                            <Upload size={14} /> Upload New XML/PDF
                                        </button>
                                        {editingCost.xmlFile && <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded">XML: {editingCost.xmlFile}</span>}
                                        {editingCost.pdfFile && <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">PDF: {editingCost.pdfFile}</span>}
                                    </div>
                                </div>
                            </div>

                            <div className="bg-slate-50 p-4 border-t border-slate-100 flex justify-end gap-3">
                                <button
                                    onClick={() => setEditingCost(null)}
                                    className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-200 rounded-lg transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={async () => {
                                        if (editingCost) {
                                            // Update Local
                                            setCosts(prev => prev.map(c => c.id === editingCost.id ? editingCost : c));
                                            // Update DB
                                            try {
                                                await storageService.updateCost(editingCost);
                                                setEditingCost(null);
                                                showNotification('Success', 'Record updated successfully', 'success');
                                            } catch (e) {
                                                console.error(e);
                                                showNotification('Error', 'Failed to save changes.', 'error');
                                            }
                                        }
                                    }}
                                    className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold shadow-sm hover:bg-blue-700 transition-all"
                                >
                                    Save Changes
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};
