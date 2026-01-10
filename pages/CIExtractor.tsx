import React, { useState, useEffect, useRef } from 'react';
import ExcelJS from 'exceljs';
import * as XLSX_Basic from 'xlsx/dist/xlsx.mini.min.js';
import { Upload, FileDown, Search, Plus, Trash2, Edit2, X, Check, FileSpreadsheet, AlertCircle, FileText, CheckCircle, Save, Repeat, History, RotateCcw, AlertTriangle } from 'lucide-react';
import { storageService } from '../services/storageService.ts';
import { CommercialInvoiceItem, RawMaterialPart } from '../types.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useNotification } from '../context/NotificationContext.tsx';
import { downloadFile } from '../utils/fileHelpers.ts';
import { LOGO_BASE64 } from '../src/constants/logo.ts';






// Helper for Consolidation
const consolidateItems = (
    rawItems: any[],
    masterPartsMap: Map<string, number>
): CommercialInvoiceItem[] => {
    const map = new Map<string, CommercialInvoiceItem>();

    rawItems.forEach(row => {
        // Key includes Description now
        const descKey = (row.spanishDescription || '').trim();
        const key = `${row.partNo}|${row.unitPrice}|${row.invoiceNo}|${row.regimen}|${descKey}`;

        const masterWeight = masterPartsMap.get(row.partNo);
        const hasMasterWeight = masterWeight !== undefined && masterWeight !== null;

        const existing = map.get(key);
        if (existing) {
            existing.qty += row.qty;
            // Accumulate weight only if not from Master Data
            if (!hasMasterWeight) {
                existing.netWeight += (row.netWeight || 0);
            }
            existing.totalAmount = existing.qty * existing.unitPrice;
        } else {
            const initialWeight = hasMasterWeight ? Number(masterWeight) : (row.netWeight || 0);
            map.set(key, {
                id: crypto.randomUUID(),
                invoiceNo: row.invoiceNo,
                date: row.date,
                item: row.item,
                model: row.model,
                partNo: row.partNo,
                englishName: row.englishName,
                spanishDescription: row.spanishDescription,
                hts: row.hts,
                prosec: row.prosec,
                rb: row.rb,
                qty: row.qty,
                um: row.um,
                netWeight: initialWeight,
                unitPrice: row.unitPrice,
                totalAmount: row.qty * row.unitPrice,
                regimen: row.regimen,
                incoterm: row.incoterm || ''
            });
        }
    });

    return Array.from(map.values());
};

export const CIExtractor: React.FC = () => {
    const { user } = useAuth();
    const isAdmin = user?.role === 'Admin';
    const { showNotification } = useNotification();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const searchTimerRef = useRef<NodeJS.Timeout>();

    const handleSearch = (val: string) => {
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        searchTimerRef.current = setTimeout(() => {
            setSearchTerm(val);
        }, 300);
    };

    const [items, setItems] = useState<CommercialInvoiceItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkDeleteModal, setBulkDeleteModal] = useState(false);
    const [editingItem, setEditingItem] = useState<CommercialInvoiceItem | null>(null);
    const [incotermLabel, setIncotermLabel] = useState<string>('');

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 50;

    // Sync Reset
    useEffect(() => {
        if (searchTerm === '' && searchInputRef.current) {
            searchInputRef.current.value = '';
        }
        setCurrentPage(1); // Reset page on search
    }, [searchTerm]);

    // Container Logic
    const [showContainerModal, setShowContainerModal] = useState(false);
    const [tempContainerNo, setTempContainerNo] = useState('');
    const [pendingFileItems, setPendingFileItems] = useState<CommercialInvoiceItem[]>([]);
    const [showRegimenModal, setShowRegimenModal] = useState(false);
    const [bulkRegimenValue, setBulkRegimenValue] = useState<'IN' | 'A1'>('IN');
    const [showMissingOnly, setShowMissingOnly] = useState(false);
    const [showSensibleOnly, setShowSensibleOnly] = useState(false);
    const [showNoDBOnly, setShowNoDBOnly] = useState(false);
    const [showPricesOnly, setShowPricesOnly] = useState(false);
    const [amendmentMatches, setAmendmentMatches] = useState<Record<string, RawMaterialPart>>({});
    const [masterDataMap, setMasterDataMap] = useState<Record<string, RawMaterialPart>>({});

    useEffect(() => {
        const syncMasterData = () => {
            const parts = storageService.getParts();
            const map: Record<string, RawMaterialPart> = {};
            parts.forEach(p => {
                // Normalization: Key must be trimmed string to match lookup logic
                if (p.PART_NUMBER) {
                    const normalizedKey = String(p.PART_NUMBER).trim();
                    map[normalizedKey] = p;
                }
            });
            setMasterDataMap(map);
        };

        // Initial Load
        syncMasterData();

        // Subscribe to updates (Fixes slow load / race condition)
        const unsubscribe = storageService.subscribe(syncMasterData);
        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, []);

    // Look up Master Data when Amendments modal opens
    useEffect(() => {
        if (showRegimenModal && selectedIds.size > 0) {
            const allParts = storageService.getParts();
            const matches: Record<string, RawMaterialPart> = {};

            items.filter(i => selectedIds.has(i.id)).forEach(item => {
                const part = allParts.find(p => p.PART_NUMBER === item.partNo);
                if (part) {
                    matches[item.id] = part;
                }
            });
            setAmendmentMatches(matches);
        }
    }, [showRegimenModal, selectedIds, items]);

    const handleApplyMasterData = async () => {
        const updates: CommercialInvoiceItem[] = [];

        items.filter(i => selectedIds.has(i.id)).forEach(item => {
            const match = amendmentMatches[item.id];
            if (match) {
                updates.push({
                    ...item,
                    spanishDescription: match.DESCRIPCION_ES?.trim() || item.spanishDescription,
                    hts: match.HTSMX?.trim() || item.hts,
                    um: match.UMC?.trim() || item.um,
                    netWeight: match.NETWEIGHT !== undefined ? match.NETWEIGHT : (item.netWeight || 0)
                });


            }
        });

        if (updates.length > 0) {
            await Promise.all(updates.map(i => storageService.updateInvoiceItem(i)));
            loadData();
            setShowRegimenModal(false);
            setSelectedIds(new Set());
            showNotification('Auto-Fill Success', `Updated ${updates.length} items from Master Data.`, 'success');
        } else {
            showNotification('No Matches', 'No Master Data found for selected items.', 'warning');
        }
    };

    const handleBulkRegimenUpdate = async () => {
        const updates = items
            .filter(i => selectedIds.has(i.id))
            .map(i => ({ ...i, regimen: bulkRegimenValue }));

        // Parallel update
        await Promise.all(updates.map(i => storageService.updateInvoiceItem(i)));

        loadData();
        setShowRegimenModal(false);
        setSelectedIds(new Set());
        showNotification('Update Success', `Updated regimen for ${updates.length} items.`, 'success');
    };



    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValues, setEditValues] = useState<Partial<CommercialInvoiceItem>>({});

    // R8 Diff Resolution Modal
    const [showDiffModal, setShowDiffModal] = useState(false);
    const [diffItem, setDiffItem] = useState<CommercialInvoiceItem | null>(null);
    const [diffMasterPart, setDiffMasterPart] = useState<RawMaterialPart | null>(null);
    const [resolvedDescription, setResolvedDescription] = useState('');
    const [resolvedR8Description, setResolvedR8Description] = useState('');

    // Restore Logic
    const [showRestoreModal, setShowRestoreModal] = useState(false);
    const [restorePoints, setRestorePoints] = useState<any[]>([]);

    const handleRestoreClick = () => {
        const points = storageService.getSnapshots();
        setRestorePoints(points);
        setShowRestoreModal(true);
    };

    const confirmRestore = async (snapshotId: string) => {
        if (confirm("Restore this snapshot? Current unsaved data might be lost.")) {
            storageService.restoreSnapshot(snapshotId);
            loadData();
            setShowRestoreModal(false);
            showNotification('Restored', 'Data restored from snapshot.', 'success');
        }
    };

    const handleStartEdit = (item: CommercialInvoiceItem) => {
        setEditingId(item.id);
        setEditValues({
            invoiceNo: item.invoiceNo,
            partNo: item.partNo,
            qty: item.qty,
            um: item.um,
            unitPrice: item.unitPrice,
            netWeight: item.netWeight,
            containerNo: item.containerNo,
            incoterm: item.incoterm
            // Add other editable fields if needed
        });
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setEditValues({});
    };

    const handleSaveEdit = async (id: string) => {
        const original = items.find(i => i.id === id);
        if (!original) return;

        const updatedItem = {
            ...original,
            ...editValues,
            // Recalculate total if qty/price changed
            totalAmount: (editValues.qty || original.qty) * (editValues.unitPrice || original.unitPrice)
        };

        // Optimistic Update
        setItems(prevItems => prevItems.map(i => i.id === id ? updatedItem : i));

        await storageService.updateInvoiceItem(updatedItem);
        showNotification('Update Success', 'Item updated successfully.', 'success');
        setEditingId(null);
        setEditValues({});
    };

    const handleOpenDiffModal = (item: CommercialInvoiceItem) => {
        const masterPart = masterDataMap[item.partNo] || null;
        setDiffItem(item);
        setDiffMasterPart(masterPart);
        setResolvedDescription(item.spanishDescription || '');
        setResolvedR8Description(masterPart?.DESCRIPCION_R8 || '');
        setShowDiffModal(true);
    };

    const handleCloseDiffModal = () => {
        setShowDiffModal(false);
        setDiffItem(null);
        setDiffMasterPart(null);
        setResolvedDescription('');
        setResolvedR8Description('');
    };

    const handleSaveDiff = async () => {
        if (!diffItem) return;

        // 1. Update Invoice Item Description
        const updatedItem = {
            ...diffItem,
            spanishDescription: resolvedDescription
        };

        // 2. Update Master Data R8 Description (if changed and part exists)
        if (diffMasterPart && diffMasterPart.DESCRIPCION_R8 !== resolvedR8Description) {
            const updatedPart: RawMaterialPart = {
                ...diffMasterPart,
                DESCRIPCION_R8: resolvedR8Description,
                UPDATE_TIME: new Date().toISOString()
            };
            await storageService.updatePart(updatedPart);

            // Update local map locally to reflect changes immediately
            setMasterDataMap(prev => ({
                ...prev,
                [updatedPart.PART_NUMBER]: updatedPart
            }));

            showNotification('Master Data Updated', 'R8 Description updated in database.', 'success');
        }

        // Optimistic Update Item
        setItems(prevItems => prevItems.map(i => i.id === diffItem.id ? updatedItem : i));

        await storageService.updateInvoiceItem(updatedItem);
        showNotification('Description Updated', 'Item description corrected successfully.', 'success');
        handleCloseDiffModal();
    };

    // Stats
    const [stats, setStats] = useState({
        totalItems: 0,
        inCount: 0,
        a1Count: 0
    });

    useEffect(() => {
        loadData();
        const unsubscribe = storageService.subscribe(() => {
            loadData();
        });
        return () => unsubscribe();
    }, []);

    const loadData = () => {
        const data = storageService.getInvoiceItems();
        // Sort: Non-R8 first, then R8. Within groups, sort by Item Number.
        data.sort((a, b) => {
            const hasR8A = !!(a.rb && a.rb.toString().trim());
            const hasR8B = !!(b.rb && b.rb.toString().trim());

            if (hasR8A !== hasR8B) {
                return hasR8A ? 1 : -1; // R8 items go to the bottom
            }

            const numA = parseFloat(a.item) || 0;
            const numB = parseFloat(b.item) || 0;
            return numA - numB;
        });
        setItems(data);
        setLoading(false);
        updateStats(data);
    };

    const updateStats = (data: CommercialInvoiceItem[]) => {
        setStats({
            totalItems: data.length,
            inCount: data.filter(i => i.regimen !== 'A1').length,
            a1Count: data.filter(i => i.regimen === 'A1').length
        });
    };

    // --- ESTIMATED PRICE RESOLUTION MODAL ---
    const [showEstModal, setShowEstModal] = useState(false);
    const [estItem, setEstItem] = useState<CommercialInvoiceItem | null>(null);
    const [estMasterPart, setEstMasterPart] = useState<RawMaterialPart | null>(null);
    const [resolvedUnitPrice, setResolvedUnitPrice] = useState<string>(''); // For Invoice
    const [resolvedMasterPrice, setResolvedMasterPrice] = useState<string>(''); // For Master Data (optional update)

    const handleOpenEstModal = (item: CommercialInvoiceItem) => {
        const masterPart = masterDataMap[item.partNo] || null;
        setEstItem(item);
        setEstMasterPart(masterPart);
        // Default: display current item price
        setResolvedUnitPrice(String(item.unitPrice || '0'));
        // Display master estimated price
        setResolvedMasterPrice(String(masterPart?.ESTIMATED || '0'));
        setShowEstModal(true);
    };

    const handleCloseEstModal = () => {
        setShowEstModal(false);
        setEstItem(null);
        setEstMasterPart(null);
    };

    const handleSaveEst = async () => {
        if (!estItem) return;

        const newPrice = parseFloat(resolvedUnitPrice) || 0;
        const masterPrice = parseFloat(resolvedMasterPrice) || 0;

        // 1. Update Invoice Item Price
        const hasChanged = Math.abs(newPrice - (estItem.unitPrice || 0)) > 0.001;

        const updatedItem = {
            ...estItem,
            unitPrice: newPrice,
            // Update Amount too? Usually yes: Price * Qty
            totalAmount: parseFloat((newPrice * (estItem.qty || 0)).toFixed(2)),
            priceVerified: hasChanged ? true : (estItem.priceVerified || false) // Only verify if changed, or keep existing
        };

        // Note: Master Data is NOT updated here as it is fixed customs data.

        // Optimistic Update Item
        setItems(prevItems => prevItems.map(i => i.id === estItem.id ? updatedItem : i));
        await storageService.updateInvoiceItem(updatedItem);

        const msg = hasChanged ? 'Price Corrected & Verified.' : 'No changes made.';
        const type = hasChanged ? 'success' : 'info';
        showNotification('Price Update', msg, type);
        handleCloseEstModal();
    };




    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        let importCount = 0;
        let pendingAggregate: CommercialInvoiceItem[] = [];
        let errors: string[] = [];

        // Helper: Parse Currency
        const parseCurrency = (val: any) => {
            if (!val) return 0;
            const str = String(val).replace(/[$,]/g, '').trim();
            return parseFloat(str) || 0;
        };

        const processFile = (file: File): Promise<void> => {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = async (evt) => {
                    try {
                        const buffer = evt.target?.result as ArrayBuffer;
                        const wb = XLSX_Basic.read(buffer, { type: 'array' });
                        const wsname = wb.SheetNames[0];
                        const ws = wb.Sheets[wsname];
                        const data: any[][] = XLSX_Basic.utils.sheet_to_json(ws, { header: 1 });

                        // Header Detection
                        let headerRowIndex = -1;
                        // @ts-ignore
                        for (let i = 0; i < Math.min(data.length, 30); i++) {
                            // @ts-ignore
                            const rowStr = (data[i] || []).join(' ').toUpperCase();
                            if (rowStr.includes('ITEM') && rowStr.includes('PART')) {
                                headerRowIndex = i;
                                break;
                            }
                        }

                        if (headerRowIndex === -1) {
                            errors.push(`${file.name}: Could not find header row.`);
                            resolve(); return;
                        }

                        // Map Columns
                        // @ts-ignore
                        const headers = (data[headerRowIndex] as any[]).map(String);
                        const colMap: Record<string, number> = {};
                        const requiredCols = ['ITEM', 'MODEL', 'PART NO', 'ENGLISH NAME', 'SPANISH DESCRIPTION', 'HTS', 'PROSEC', 'RB', 'QTY', 'UM', 'NETWEIGHT', 'UNIT PRICE', 'TOTAL AMOUNT', 'REGIMEN'];

                        requiredCols.forEach(col => {
                            let idx = headers.findIndex(h => h.toUpperCase().replace('.', '').trim() === col.replace('.', '').trim());
                            if (idx === -1) {
                                const hUpper = headers.map(h => h.toUpperCase());
                                if (col === 'SPANISH DESCRIPTION') idx = hUpper.findIndex(h => h.includes('DESCRIP') && h.includes('ES'));
                                else if (col === 'ENGLISH NAME') idx = hUpper.findIndex(h => h.includes('ENGLISH') || h.includes('NAME'));
                                else if (col === 'UNIT PRICE') {
                                    idx = hUpper.findIndex(h => h.includes('PRICE'));
                                    if (idx === -1) idx = hUpper.findIndex(h => h.includes('UNIT') && h.includes('USD'));
                                } else if (col === 'TOTAL AMOUNT') {
                                    if (idx === -1) idx = hUpper.findIndex(h => h.includes('TOTAL') && h.includes('USD'));
                                    if (idx === -1) idx = hUpper.findIndex(h => h.includes('AMOUNT') && h.includes('USD'));
                                } else if (col === 'UM') {
                                    idx = hUpper.findIndex(h => h === 'UM' || h === 'U.M.' || h === 'U-M' || h === 'U/M');
                                } else if (col === 'RB') {
                                    idx = hUpper.findIndex(h => h === 'RB' || h === 'R8');
                                }
                            }
                            if (idx !== -1) colMap[col] = idx;
                        });

                        // Metadata (Invoice, Date)
                        let invoiceNo = '';
                        let invoiceDate = new Date().toISOString().split('T')[0];
                        for (let r = 0; r < headerRowIndex; r++) {
                            // @ts-ignore
                            const row = data[r] || [];
                            for (let c = 0; c < row.length; c++) {
                                const cell = String(row[c] || '');
                                if (cell.includes('INVOICE NO')) {
                                    const parts = cell.split(':');
                                    if (parts[1]) invoiceNo = parts[1].trim();
                                }
                                if (cell.includes('DATE :')) {
                                    const parts = cell.split(':');
                                    if (parts[1]) invoiceDate = parts[1].trim();
                                }
                            }
                        }

                        // Pre-fetch Master Data for NetWeight correction
                        const allParts = storageService.getParts();
                        const partsMap = new Map<string, number>(allParts.map(p => [p.PART_NUMBER, p.NETWEIGHT]));

                        // Parse to Raw Items first
                        const rawItems: any[] = [];
                        let parsedIncoterm = '';

                        // @ts-ignore
                        for (let i = headerRowIndex + 1; i < data.length; i++) {
                            // @ts-ignore
                            const row = data[i];
                            if (!row || row.length === 0) continue;

                            const firstCell = String(row[0] || '').toUpperCase();
                            if (firstCell.includes('INCOTERM')) {
                                let label = String(row[0] || '').trim();
                                const val = String(row[1] || '').trim();
                                if (val) label += ' ' + val;
                                parsedIncoterm = label;
                                setIncotermLabel(label);
                                break;
                            }
                            if (firstCell.includes('SAY TOTAL') || firstCell.includes('TOTAL US DOLLAR')) break;

                            const partNo = row[colMap['PART NO']] || '';
                            const itemCode = row[colMap['ITEM']];
                            if (!partNo && !itemCode) continue;
                            if (String(itemCode).toUpperCase().includes('TOTAL')) continue;

                            const unitPrice = parseCurrency(row[colMap['UNIT PRICE']]);
                            const regime = row[colMap['REGIMEN']]?.toString().toUpperCase() || '';
                            const invoice = invoiceNo || 'UNKNOWN';
                            const qty = Number(row[colMap['QTY']]) || 0;
                            const excelNetWeight = Number(row[colMap['NETWEIGHT']] || 0);

                            rawItems.push({
                                invoiceNo: invoice,
                                date: invoiceDate || new Date().toISOString().slice(0, 10),
                                item: row[colMap['ITEM']] || '',
                                model: row[colMap['MODEL']] || '',
                                partNo: partNo,
                                englishName: row[colMap['ENGLISH NAME']] || '',
                                spanishDescription: row[colMap['SPANISH DESCRIPTION']] || '',
                                hts: row[colMap['HTS']] || '',
                                prosec: row[colMap['PROSEC']] || '',
                                rb: row[colMap['RB']] || '',
                                qty: qty,
                                um: row[colMap['UM']] || '',
                                netWeight: excelNetWeight,
                                unitPrice: unitPrice,
                                regimen: regime,
                                incoterm: '' // Set later
                            });
                        }

                        // Consolidate
                        const newItems = consolidateItems(rawItems, partsMap);

                        // Apply Incoterm
                        if (parsedIncoterm) {
                            newItems.forEach(i => i.incoterm = parsedIncoterm);
                        }

                        if (newItems.length > 0) {
                            const containerRegex = /[A-Z]{4}\d{7}/;
                            const match = file.name.match(containerRegex);

                            if (match) {
                                const containerNo = match[0];
                                // Duplicate Check
                                if (items.some(i => i.containerNo === containerNo)) {
                                    errors.push(`${file.name}: Container ${containerNo} already exists.`);
                                } else {
                                    const itemsWithContainer = newItems.map(i => ({ ...i, containerNo }));
                                    await storageService.addInvoiceItems(itemsWithContainer);
                                    importCount += itemsWithContainer.length;
                                }
                            } else {
                                // No container in filename -> Aggregate for manual entry
                                pendingAggregate.push(...newItems);
                            }
                        } else {
                            errors.push(`${file.name}: No valid items found.`);
                        }
                        resolve();
                    } catch (err) {
                        console.error(err);
                        errors.push(`${file.name}: Parse error.`);
                        resolve();
                    }
                };
                reader.readAsArrayBuffer(file);
            });
        };

        // Process all files
        await Promise.all(files.map(processFile));

        // Post-process
        if (importCount > 0) {
            loadData();
            showNotification('Batch Import', `Successfully imported ${importCount} items found in ${files.length} files.`, 'success');
        }

        if (pendingAggregate.length > 0) {
            setPendingFileItems(pendingAggregate);
            setTempContainerNo('');
            setShowContainerModal(true);
            showNotification('Manual Entry Needed', `${pendingAggregate.length} items need a Container Number.`, 'info');
        }

        if (errors.length > 0) {
            // Show first few errors
            showNotification('Import Warnings', errors.slice(0, 3).join(' | '), 'warning');
        }

        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // --- REUSABLE EXPORT FUNCTION (ExcelJS) ---
    const exportToExcelStamped = async (data: CommercialInvoiceItem[], filename: string) => {
        const meta = (data[0] || {}) as Partial<CommercialInvoiceItem>;
        const workbook = new ExcelJS.Workbook();
        const ws = workbook.addWorksheet('Invoice');

        // --- COLUMNS ---
        ws.columns = [
            { width: 15 }, // A (Item)
            { width: 25 }, // B (Model)
            { width: 25 }, // C (PartNo)
            { width: 25 }, // D (Eng Name)
            { width: 30 }, // E (Desc)
            { width: 15 }, // F (HTS)
            { width: 10 }, // G (Prosec)
            { width: 8 },  // H (RB)
            { width: 10 }, // I (Qty)
            { width: 8 },  // J (UM)
            { width: 12 }, // K (NetWt)
            { width: 15 }, // L (Total NetWt)
            { width: 15 }, // M (Price)
            { width: 15 }, // N (Amount)
            { width: 10 }  // O (Regimen)
        ];

        // --- LOGO ---
        const logoId = workbook.addImage({
            base64: LOGO_BASE64,
            extension: 'png',
        });
        // Place logo roughly in A1:C4 area (Scaled to reference)
        ws.addImage(logoId, {
            tl: { col: 0, row: 0 },
            ext: { width: 280, height: 60 }
        });

        // --- COMPANY HEADER (Centered) ---
        // We'll push text down or alongside. Logo is top-left.
        // Let's put text starting Row 1, but centered across columns?
        // Row 1 (Index 1 in ExcelJS)

        const titleRow = ws.getRow(1);
        titleRow.getCell(5).value = "ZHEJIANG CFMOTO POWER CO., LTD";
        titleRow.getCell(5).alignment = { vertical: 'middle', horizontal: 'center' };
        titleRow.getCell(5).font = { bold: true, size: 14, name: 'Arial' };
        ws.mergeCells('E1:N1');

        const addr1 = ws.getRow(2);
        addr1.getCell(5).value = "NO.116, WUZHOU ROAD, YUHANG ECONOMIC DEVELOPMENT ZONE,";
        addr1.getCell(5).alignment = { vertical: 'middle', horizontal: 'center' };
        ws.mergeCells('E2:N2');

        const addr2 = ws.getRow(3);
        addr2.getCell(5).value = "HANGZHOU 311100, ZHEJIANG PROVINCE, P.R. CHINA";
        addr2.getCell(5).alignment = { vertical: 'middle', horizontal: 'center' };
        ws.mergeCells('E3:N3');

        const contact = ws.getRow(4);
        contact.getCell(5).value = "TEL: 0086-57189265787 FAX: 0086-57189265788";
        contact.getCell(5).alignment = { vertical: 'middle', horizontal: 'center' };
        ws.mergeCells('E4:N4');

        // Row 5: TITLE
        const mainTitle = ws.getRow(5);
        mainTitle.getCell(1).value = "COMMERCIAL INVOICE";
        mainTitle.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
        mainTitle.getCell(1).font = { bold: true, underline: true, size: 12, name: 'Arial' };
        ws.mergeCells('A5:N5');

        // Row 6: Empty

        // --- INFO BLOCKS (Row 7+) / Index 7
        // Prepare Data
        const importerLines = [
            "IMPORTADOR: CFMOTO MEXICO POWER S. DE R.L. DE C.V.",
            "DIRECCIÓN FISCAL: CALLE TECNOLOGIA",
            "No. EXT. 107 CIUDAD APODACA C.P. 66628",
            "COLONIA: VYNMSA APODACA INDUSTRIAL PARK",
            "NUEVO LEON, MEXICO",
            "(ESTADOS UNIDOS MEXICANOS)",
            "RFC: CMP220712ND9.",
            "TEL:+52 8119640554",
            "SHIPPED PER: BY SEA"
        ];
        const providerLines = [
            "PROVEEDOR: ZHEJIANG CFMOTO POWER CO., LTD",
            "DIRECCIÓN: WUZHOU ROAD, YUHANG ECONOMIC",
            "DEVELOPMENT ZONE No.EXT. 116 C.P. 311100",
            "HANGZHOU ZHEJIANG, CHINA (REPUBLICA POPULAR)",
            "TAX ID: 91330100757206158J",
            "", "", "", ""
        ];
        const invoiceLines = [
            `INVOICE NO: ${meta.invoiceNo || ''}`,
            "PAYMENT: T/T",
            `DATE: ${meta.date || ''}`,
            "SHIPPED FROM: NINGBO, CHINA",
            "TO MANZANILLO, MEXICO",
            "", "", "", ""
        ];

        const startRow = 7;
        const maxLines = Math.max(importerLines.length, providerLines.length, invoiceLines.length);

        for (let i = 0; i < maxLines; i++) {
            const r = ws.getRow(startRow + i);

            // Col A-C (Importer)
            if (importerLines[i]) {
                r.getCell(1).value = importerLines[i];
                r.getCell(1).alignment = { horizontal: 'left', wrapText: true };
                ws.mergeCells(`A${startRow + i}:C${startRow + i}`);
            }

            // Col E-G (Provider)
            if (providerLines[i]) {
                r.getCell(5).value = providerLines[i];
                r.getCell(5).alignment = { horizontal: 'left', wrapText: true };
                ws.mergeCells(`E${startRow + i}:G${startRow + i}`);
            }

            // Col I-K (Invoice)
            if (invoiceLines[i]) {
                r.getCell(9).value = invoiceLines[i];
                r.getCell(9).alignment = { horizontal: 'left', wrapText: true };
                ws.mergeCells(`I${startRow + i}:K${startRow + i}`);
            }
        }

        // --- HEADERS (Row startRow + maxLines + 2) ---
        const tableHeaderRowIdx = startRow + maxLines + 1;
        const headerRow = ws.getRow(tableHeaderRowIdx);
        const sortedHeaders = [
            "ITEM", "MODEL", "PART NO.", "ENGLISH NAME", "DESCRIPCION(ES)",
            "HTS", "PROSEC", "RB", "QTY", "U-M",
            "NETWEIGHT", "TOTAL NETWEIGHT", "PRICE(USD)", "AMOUNT(USD)", "REGIMEN"
        ];
        sortedHeaders.forEach((h, idx) => {
            const cell = headerRow.getCell(idx + 1);
            cell.value = h;
            cell.font = { bold: true };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };
        });

        // --- DATA ---
        let currentRowIdx = tableHeaderRowIdx + 1;
        data.forEach(item => {
            const r = ws.getRow(currentRowIdx);
            const values = [
                item.item, item.model, item.partNo, item.englishName, item.spanishDescription,
                item.hts, item.prosec, item.rb, item.qty, item.um,
                item.netWeight,
                parseFloat(((item.netWeight || 0) * (item.qty || 0)).toFixed(2)),
                parseFloat(item.unitPrice?.toString() || '0'),
                parseFloat(((item.qty || 0) * (item.unitPrice || 0)).toFixed(2)),
                item.regimen
            ];

            values.forEach((v, idx) => {
                const cell = r.getCell(idx + 1);
                cell.value = v;

                // Alignment
                if (idx === 0 || idx === 1 || idx === 2 || idx === 3 || idx === 4) cell.alignment = { horizontal: 'left', wrapText: true }; // Texts
                else cell.alignment = { horizontal: 'center', vertical: 'middle' };

                // Number Format
                // Number Format
                if (idx >= 11 && idx <= 13) { // TotalNetWt, Price, Amount
                    cell.numFmt = '0.00';
                }

                // Border
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
            });
            currentRowIdx++;
        });

        // --- FOOTER ---
        const footerRowIdx = currentRowIdx;
        const fRow = ws.getRow(footerRowIdx);

        // Incoterm (Footer)
        const fullIncoterm = meta.incoterm || incotermLabel || "";
        const cleanCode = fullIncoterm.replace(/INCOTERM/i, '').replace(/:/g, '').trim().split(' ')[0];

        fRow.getCell(1).value = "INCOTERM:";
        fRow.getCell(1).font = { bold: true };
        fRow.getCell(1).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

        // Place Code next to label (Cell B)
        if (cleanCode) {
            fRow.getCell(2).value = cleanCode;
            fRow.getCell(2).font = { bold: true };
            fRow.getCell(2).alignment = { horizontal: 'left' };
            fRow.getCell(2).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        } else {
            // Fallback if empty to full string in A if needed, but user wants split
            fRow.getCell(1).value = fullIncoterm || "INCOTERM:";
        }
        fRow.getCell(1).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

        // Total Qty (Col 9 / I)
        const sumStartRow = tableHeaderRowIdx + 1;
        const sumEndRow = currentRowIdx - 1;

        // JS Calculation for robustness
        const totalQty = data.reduce((sum, item) => sum + (item.qty || 0), 0);
        const totalAmount = data.reduce((sum, item) => sum + ((item.qty || 0) * (item.unitPrice || 0)), 0);

        const qtyCell = fRow.getCell(9);
        qtyCell.value = { formula: `SUM(I${sumStartRow}:I${sumEndRow})`, result: totalQty };
        qtyCell.font = { bold: true };
        qtyCell.alignment = { horizontal: 'center' };
        qtyCell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

        // Total Amount (Col 14 / N)
        const amtCell = fRow.getCell(14);
        amtCell.value = { formula: `SUM(N${sumStartRow}:N${sumEndRow})`, result: parseFloat(totalAmount.toFixed(2)) };
        amtCell.numFmt = '0.00';
        amtCell.font = { bold: true };
        amtCell.alignment = { horizontal: 'center' };
        amtCell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

        // --- GENERATE & DOWNLOAD ---
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        downloadFile(blob, filename);
    };

    const handleSplitAndExport = () => {
        const sourceItems = filteredItems;
        if (sourceItems.length === 0) return;

        // Split logic - Re-indexing items for each group
        const a1Items = sourceItems
            .filter(i => i.regimen === 'A1')
            .map((i, index) => ({
                ...i,
                item: (index + 1).toString(),
                invoiceNo: i.invoiceNo.endsWith('-A1') ? i.invoiceNo : `${i.invoiceNo}-A1`
            }));

        const standardItems = sourceItems
            .filter(i => i.regimen !== 'A1')
            .map((i, index) => ({
                ...i,
                item: (index + 1).toString()
            }));

        if (a1Items.length > 0) {
            const suffix = a1Items[0]?.containerNo || new Date().toISOString().split('T')[0];
            exportToExcelStamped(a1Items, `Commercial_Invoice_A1_${suffix}.xlsx`);
        }

        if (standardItems.length > 0) {
            setTimeout(() => {
                const suffix = standardItems[0]?.containerNo || new Date().toISOString().split('T')[0];
                exportToExcelStamped(standardItems, `Commercial_Invoice_IN_${suffix}.xlsx`);
            }, 800);
        }
    };

    const handleExportFiltered = () => {
        if (filteredItems.length === 0) {
            showNotification('Export Info', "No items to export (current filter is empty).", 'info');
            return;
        }
        const suffix = filteredItems[0]?.containerNo || new Date().toISOString().split('T')[0];

        // Re-index filtered items before export
        const reindexedItems = filteredItems.map((item, index) => ({
            ...item,
            item: (index + 1).toString()
        }));

        exportToExcelStamped(reindexedItems, `Commercial_Invoice_Filtered_${suffix}.xlsx`);
    };

    // --- CSV EXPORT CORREGIDO (Adiós a la basura de antigravity) ---
    const handleExportCSV = () => {
        let itemsToExport = items;
        if (selectedIds.size > 0) itemsToExport = items.filter(i => selectedIds.has(i.id));
        else if (searchTerm) itemsToExport = filteredItems;


        if (!itemsToExport || itemsToExport.length === 0) {
            showNotification('Export Info', "No data to export.", 'info');
            return;
        }

        try {
            // 1. Mapeo EXPLICITO: Evitamos que se filtre el campo 'id' (UUID) al CSV
            const rows = itemsToExport.map((item, index) => ({
                'INVOICE NO': String(item.invoiceNo || ''),
                'DATE': item.date || '',
                'ITEM': (index + 1).toString(),
                'MODEL': item.model || '',
                'PART NO': item.partNo || '',
                'ENGLISH NAME': item.englishName || '',
                'SPANISH DESCRIPTION': item.spanishDescription || '',
                'HTS': item.hts || '',
                'PROSEC': item.prosec || '',
                'RB': item.rb || '',
                'QTY': item.qty || 0,
                'UM': item.um || '',
                'NETWEIGHT': item.netWeight || 0,
                'UNIT PRICE': item.unitPrice || 0,
                'TOTAL AMOUNT': item.totalAmount || 0,
                'REGIMEN': item.regimen || ''
            }));

            // 2. Generación usando exclusivamente la versión mini para evitar conflictos
            const ws = XLSX_Basic.utils.json_to_sheet(rows);
            const csvContent = XLSX_Basic.utils.sheet_to_csv(ws);

            if (!csvContent) {
                throw new Error("CSV Content is empty");
            }

            // 3. Preparación del archivo con BOM (para que Excel no rompa los acentos)
            const BOM = '\uFEFF';
            // Aseguramos el tipo MIME exacto
            const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8' });

            // 4. Descarga forzada (Método robusto)
            downloadFile(blob, 'Commercial_Invoice_Export.csv');

            showNotification('Success', "CSV exported successfully", 'success');

            showNotification('Success', "CSV exported successfully", 'success');

        } catch (error) {
            console.error("Critical Export Error:", error);
            showNotification('Export Error', "Failed to generate CSV. Check console.", 'error');
        }
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedIds(new Set(filteredItems.map(i => i.id)));
        } else {
            setSelectedIds(new Set());
        }
    };

    const handleSelectRow = (id: string) => {
        const newSelected = new Set(selectedIds);
        if (newSelected.has(id)) newSelected.delete(id);
        else newSelected.add(id);
        setSelectedIds(newSelected);
    };

    const confirmBulkDelete = async () => {
        await storageService.deleteInvoiceItems(Array.from(selectedIds));
        loadData(); // REFRESH UI
        setSelectedIds(new Set());
        setBulkDeleteModal(false);
        showNotification('Deleted', `Deleted ${selectedIds.size} items.`, 'success');
    };

    const handleDelete = async (id: string) => {
        if (confirm("Are you sure you want to delete this item?")) {
            await storageService.deleteInvoiceItem(id);
            loadData(); // REFRESH UI
            showNotification('Deleted', "Item deleted.", 'success');
        }
    };

    const confirmContainerInput = async () => {
        if (!tempContainerNo) {
            showNotification('Input Required', "Please enter a Container/Guide Number.", 'warning');
            return;
        }

        const itemsWithContainer = pendingFileItems.map(i => ({ ...i, containerNo: tempContainerNo }));
        await storageService.addInvoiceItems(itemsWithContainer);
        loadData(); // REFRESH UI
        showNotification('Import Successful', `Successfully imported ${itemsWithContainer.length} items with Container ${tempContainerNo}.`, 'success');

        setPendingFileItems([]);
        setTempContainerNo('');
        setShowContainerModal(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const [showErrorsOnly, setShowErrorsOnly] = useState(false);

    // Helper to check R8 Mismatch
    const checkR8Mismatch = (item: CommercialInvoiceItem) => {
        const masterPart = masterDataMap[item.partNo];
        const r8Desc = masterPart?.DESCRIPCION_R8?.toString().trim().toUpperCase() || '';
        const itemDesc = item.spanishDescription?.toString().trim().toUpperCase() || '';
        const itemRb = item.rb?.toString().trim() || '';

        // 1. Description Match (Relaxed)
        const isTextMatch = r8Desc && itemDesc && (r8Desc.includes(itemDesc) || itemDesc.includes(r8Desc));

        // 2. Both Empty Case
        const isBothEmpty = !itemRb && !r8Desc;

        // Return true if mismatch (Red X)
        return !(isTextMatch || isBothEmpty);
    };

    const filteredItems = React.useMemo(() => {
        return items.filter(i => {
            if (showMissingOnly) {
                const hasMissingData = !i.regimen || !i.hts || !i.spanishDescription || !i.um;
                if (!hasMissingData) return false;
            }

            if (showErrorsOnly) {
                if (!checkR8Mismatch(i)) return false;
            }

            if (showSensibleOnly) {
                const partNo = String(i.partNo || '').trim();
                const masterPart = masterDataMap[partNo];
                const val = masterPart?.SENSIBLE;

                const strVal = masterPart?.SENSIBLE ? String(masterPart.SENSIBLE).trim().toUpperCase() : '';
                // Valid Non-Sensible value is "N" OR Empty
                const isNotSensible = strVal === 'N' || strVal === '';

                // We want to show items that ARE Sensible (i.e. NOT "N" and NOT Empty)
                if (isNotSensible) return false;
            }

            if (showNoDBOnly) {
                // Show ONLY if it does NOT exist in Master Data
                const partNo = String(i.partNo || '').trim();
                if (masterDataMap[partNo]) return false;
            }

            if (showPricesOnly) {
                const partNo = String(i.partNo || '').trim();
                const masterPart = masterDataMap[partNo];

                // PURE "PRICES" FILTER Logic (Visual Match):
                // The "Estimated" column shows a Red X if:
                // 1. Part is Missing (!masterPart)
                // 2. Part Exists BUT has "estimate_price" remark

                if (!masterPart) {
                    // Column has Red X (Part Not Found) -> Filter must SHOW it.
                } else {
                    const remarks = masterPart.REMARKS?.toString().toLowerCase() || '';
                    const estimatedPrice = Number(masterPart.ESTIMATED || 0);
                    const itemPrice = parseFloat(String(i.unitPrice || '0'));

                    // Match Render Logic: Only show if it causes a Red X
                    const isUndervalued = estimatedPrice > 0 && itemPrice < estimatedPrice;
                    const isLegacyError = (estimatedPrice === 0 && remarks.includes('price')) && !i.priceVerified;

                    const isPriceIssue = isUndervalued || isLegacyError;

                    // If NOT an issue, hide it.
                    if (!isPriceIssue) return false;
                }
            }

            if (!searchTerm) return true;

            // Split search logic for better user experience
            const terms = searchTerm.split(',').map(s => s.trim().toLowerCase()).filter(s => s.length > 0);
            if (terms.length === 0) return true;

            // Senior Frontend Engineer: Updated to OR logic (some) so users can search multiple IDs.
            return terms.some(term =>
                String(i.invoiceNo || '').toLowerCase().includes(term) ||
                String(i.partNo || '').toLowerCase().includes(term) ||
                String(i.model || '').toLowerCase().includes(term) ||
                String(i.englishName || '').toLowerCase().includes(term) ||
                String(i.regimen || '').toLowerCase().includes(term) ||
                String(i.containerNo || '').toLowerCase().includes(term)
            );
        });
    }, [items, searchTerm, showMissingOnly, showErrorsOnly, showSensibleOnly, showNoDBOnly, showPricesOnly, masterDataMap]);

    const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
    const displayedItems = filteredItems.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] gap-4">
            {/* Rigid Layout Container */}
            {/* Header and Stats */}
            <div className="flex justify-between items-start">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Commercial Invoices</h1>
                    <p className="text-slate-500">Manage and split commercial invoices by regimen</p>
                </div>
                <div className="flex gap-4">
                    {/* Stats Cards */}
                    <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-200 text-center min-w-[100px]">
                        <p className="text-xs text-slate-500 uppercase font-bold">Total Items</p>
                        <p className="text-xl font-bold text-blue-600">{stats.totalItems}</p>
                    </div>
                    <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-200 text-center min-w-[100px]">
                        <p className="text-xs text-slate-500 uppercase font-bold">Standard</p>
                        <p className="text-xl font-bold text-emerald-600">{stats.inCount}</p>
                    </div>
                    <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-200 text-center min-w-[100px]">
                        <p className="text-xs text-slate-500 uppercase font-bold">A1 Regimen</p>
                        <p className="text-xl font-bold text-purple-600">{stats.a1Count}</p>
                    </div>
                </div>
            </div >

            {/* Actions Toolbar */}
            < div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col gap-4" >
                {/* Row 1: Search Bar */}
                < div className="relative w-full" >
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                    <input
                        ref={searchInputRef}
                        type="text"
                        placeholder="Search by Invoice, Part No, or Model..."
                        className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700"
                        onChange={(e) => handleSearch(e.target.value)}
                        defaultValue=""
                    />
                </div >

                {/* Row 2: Actions & Filters */}
                < div className="flex flex-wrap gap-3 items-center justify-between" >
                    <div className="flex items-center gap-3 flex-wrap">
                        {/* Filters */}
                        <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-lg border border-slate-200">
                            <button
                                onClick={() => setShowErrorsOnly(!showErrorsOnly)}
                                className={`px-3 py-2 rounded-md flex items-center gap-2 transition-all text-sm font-medium ${showErrorsOnly
                                    ? 'bg-red-500 text-white shadow-sm'
                                    : 'text-slate-600 hover:bg-white hover:shadow-sm'
                                    }`}
                                title="Show Only R8 Mismatches"
                            >
                                <AlertCircle size={16} />
                                R8 Errors
                            </button>
                            <div className="w-px h-4 bg-slate-300 mx-1"></div>
                            <button
                                onClick={() => setShowMissingOnly(!showMissingOnly)}
                                className={`px-3 py-2 rounded-md flex items-center gap-2 transition-all text-sm font-medium ${showMissingOnly
                                    ? 'bg-amber-500 text-white shadow-sm'
                                    : 'text-slate-600 hover:bg-white hover:shadow-sm'
                                    }`}
                                title="Show Missing Data"
                            >
                                <AlertCircle size={16} />
                                Missing Info
                            </button>
                            <div className="w-px h-4 bg-slate-300 mx-1"></div>
                            <button
                                onClick={() => setShowPricesOnly(!showPricesOnly)}
                                className={`px-3 py-2 rounded-md flex items-center gap-2 transition-all text-sm font-medium ${showPricesOnly
                                    ? 'bg-rose-500 text-white shadow-sm'
                                    : 'text-slate-600 hover:bg-white hover:shadow-sm'
                                    }`}
                                title="Show Items with Estimate Price"
                            >
                                <AlertCircle size={16} />
                                Prices
                            </button>
                            <div className="w-px h-4 bg-slate-300 mx-1"></div>
                            <button
                                onClick={() => setShowSensibleOnly(!showSensibleOnly)}
                                className={`px-3 py-2 rounded-md flex items-center gap-2 transition-all text-sm font-medium ${showSensibleOnly
                                    ? 'bg-rose-500 text-white shadow-sm'
                                    : 'text-slate-600 hover:bg-white hover:shadow-sm'
                                    }`}
                                title="Show Items marked as Sensible (!= N)"
                            >
                                <AlertCircle size={16} />
                                Sens
                            </button>
                            <div className="w-px h-4 bg-slate-300 mx-1"></div>
                            <button
                                onClick={() => setShowNoDBOnly(!showNoDBOnly)}
                                className={`px-3 py-2 rounded-md flex items-center gap-2 transition-all text-sm font-medium ${showNoDBOnly
                                    ? 'bg-rose-500 text-white shadow-sm'
                                    : 'text-slate-600 hover:bg-white hover:shadow-sm'
                                    }`}
                                title="Show Items missing from DB"
                            >
                                <AlertCircle size={16} />
                                DB
                            </button>
                        </div>

                        {/* Selection Actions */}
                        {selectedIds.size > 0 && isAdmin && (
                            <div className="flex items-center gap-2 animate-in fade-in zoom-in duration-200">
                                <button
                                    onClick={() => setBulkDeleteModal(true)}
                                    className="bg-red-50 text-red-600 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-red-100 transition-colors border border-red-100 text-sm font-bold"
                                >
                                    <Trash2 size={16} /> Delete ({selectedIds.size})
                                </button>
                                <button
                                    onClick={() => setShowRegimenModal(true)}
                                    className="bg-blue-50 text-blue-600 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-100 transition-colors border border-blue-100 text-sm font-bold"
                                >
                                    <Repeat size={16} /> Amendments
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Main Actions */}
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleRestoreClick}
                            className="bg-slate-100 text-slate-500 px-3 py-2 rounded-lg hover:bg-slate-200 transition-colors border border-slate-200"
                            title="Restore from Backup"
                        >
                            <History size={18} />
                        </button>
                        <div className="h-8 w-px bg-slate-200 mx-1"></div>
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileUpload}
                            accept=".xlsx,.xls"
                            multiple
                            className="hidden"
                        />
                        <button
                            onClick={handleExportCSV}
                            className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg hover:bg-emerald-100 shadow-sm transition-colors text-sm font-medium"
                            title="Export filtered results to CSV"
                        >
                            <FileDown size={18} /> CSV
                        </button>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="bg-slate-800 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-700 transition-colors shadow-sm text-sm font-medium"
                        >
                            <Upload size={18} /> Import
                        </button>
                        <button
                            onClick={handleExportFiltered}
                            className="bg-white text-blue-600 border border-blue-200 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-50 transition-colors text-sm font-medium"
                        >
                            <FileSpreadsheet size={18} /> Export Filtered
                        </button>
                        <button
                            onClick={handleSplitAndExport}
                            disabled={items.length === 0}
                            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm font-bold shadow-sm ${items.length === 0
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                : 'bg-emerald-600 text-white hover:bg-emerald-700'
                                }`}
                        >
                            <FileSpreadsheet size={18} /> Split & Export
                        </button>
                    </div>
                </div >
            </div >

            {/* Table Area - Flex Grow to take remaining space, forcing scroll ONLY here */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex-1 flex flex-col min-h-0">
                <div className="overflow-auto flex-1">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200 sticky top-0 z-10">
                            <tr>
                                <th className="p-4 w-10">
                                    <input
                                        type="checkbox"
                                        onChange={handleSelectAll}
                                        checked={filteredItems.length > 0 && selectedIds.size === filteredItems.length}
                                        className="rounded border-slate-300"
                                    />
                                </th>
                                <th className="p-4 text-center">Actions</th>
                                <th className="p-4">Item</th>
                                <th className="p-4 text-center">R8Diff</th>
                                <th className="p-4 text-center">Estimated</th>
                                <th className="p-4 text-center">Sensible</th>
                                <th className="p-4 text-center">NDB</th>
                                <th className="p-4">Invoice No</th>
                                <th className="p-4">Container/Guide</th>
                                <th className="p-4">Date</th>
                                <th className="p-4">Regimen</th>
                                <th className="p-4">Incoterm</th>
                                <th className="p-4">HTS</th>
                                <th className="p-4">Part No</th>
                                <th className="p-4">Model</th>
                                <th className="p-4">English Name</th>
                                <th className="p-4">Desc (ES)</th>
                                <th className="p-4 text-right">Qty</th>
                                <th className="p-4">UM</th>
                                <th className="p-4 text-right">Net Weight</th>
                                <th className="p-4 text-right">Total Net Wt</th>
                                <th className="p-4 text-right">Unit Price</th>
                                <th className="p-4 text-right">Total</th>

                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr><td colSpan={15} className="p-8 text-center text-slate-400">Loading...</td></tr>
                            ) : filteredItems.length === 0 ? (
                                <tr><td colSpan={15} className="p-8 text-center text-slate-400">No invoice items found. Import an Excel file to get started.</td></tr>
                            ) : (
                                displayedItems.map((item, index) => (
                                    <tr key={item.id} className={`hover:bg-slate-50 transition-colors group ${editingId === item.id ? 'bg-blue-50' : ''}`}>
                                        <td className="p-4">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.has(item.id)}
                                                onChange={() => handleSelectRow(item.id)}
                                                className="rounded border-slate-300"
                                            />
                                        </td>
                                        <td className="p-4 text-center">
                                            {editingId === item.id ? (
                                                <div className="flex items-center gap-1 justify-center">
                                                    <button onClick={() => handleSaveEdit(item.id)} className="text-emerald-600 hover:bg-emerald-50 p-1 rounded" title="Save">
                                                        <Save size={16} />
                                                    </button>
                                                    <button onClick={handleCancelEdit} className="text-slate-400 hover:bg-slate-100 p-1 rounded" title="Cancel">
                                                        <X size={16} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-1 justify-center">
                                                    <button onClick={() => handleStartEdit(item)} className="text-slate-400 hover:text-blue-600 transition-colors p-1" title="Edit">
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button onClick={() => handleDelete(item.id)} className="text-slate-400 hover:text-red-500 transition-colors p-1" title="Delete">
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-4 font-mono font-bold text-slate-700">
                                            {index + 1}
                                        </td>
                                        <td className="p-4 text-center">
                                            {(() => {
                                                const partNo = String(item.partNo || '').trim();
                                                const masterPart = masterDataMap[partNo];
                                                // If Part not in DB -> Red X
                                                if (!masterPart) {
                                                    return (
                                                        <button
                                                            className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded-full p-1 transition-colors"
                                                            title="Part not in Master Data"
                                                        >
                                                            <X size={20} strokeWidth={3} />
                                                        </button>
                                                    );
                                                }

                                                const r8Desc = masterPart?.DESCRIPCION_R8?.toString().trim().toUpperCase() || '';
                                                const itemDesc = item.spanishDescription?.toString().trim().toUpperCase() || '';
                                                const itemRb = item.rb?.toString().trim() || '';

                                                // 1. Description Match (Relaxed)
                                                const isTextMatch = r8Desc && itemDesc && (r8Desc.includes(itemDesc) || itemDesc.includes(r8Desc));

                                                // 2. Both Empty Case (Not R8 in file AND Not R8 in Master Data)
                                                const isBothEmpty = !itemRb && !r8Desc;

                                                const isMatch = isTextMatch || isBothEmpty;

                                                return isMatch ? (
                                                    <Check size={20} className="text-emerald-500 mx-auto" strokeWidth={3} />
                                                ) : (
                                                    <button
                                                        onClick={() => handleOpenDiffModal(item)}
                                                        className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded-full p-1 transition-colors"
                                                        title="View Mismatch & Resolve"
                                                    >
                                                        <X size={20} strokeWidth={3} />
                                                    </button>
                                                );
                                            })()}
                                        </td>
                                        <td className="p-4 text-center">
                                            {(() => {
                                                const partNo = String(item.partNo || '').trim();
                                                const masterPart = masterDataMap[partNo];
                                                // If Part not in DB -> Red X
                                                if (!masterPart) {
                                                    return (
                                                        <button
                                                            onClick={() => handleOpenEstModal(item)}
                                                            className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded-full p-1 transition-colors"
                                                            title="Part Not Found (Click to Edit Price)"
                                                        >
                                                            <X size={20} strokeWidth={3} />
                                                        </button>
                                                    );
                                                }

                                                const remarks = masterPart?.REMARKS?.toString().toLowerCase() || '';
                                                const estimatedPrice = Number(masterPart?.ESTIMATED || 0);
                                                const itemPrice = parseFloat(String(item.unitPrice || '0'));

                                                // Logic:
                                                // Strictly Numeric:
                                                // - Bad if Estimated > 0 AND Item Price < Estimated.
                                                // - Otherwise Good (Green).

                                                const isPriceIssue = estimatedPrice > 0 && itemPrice < estimatedPrice;

                                                return isPriceIssue ? (
                                                    <button
                                                        onClick={() => handleOpenEstModal(item)}
                                                        className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded-full p-1 transition-colors"
                                                        title={`Undervalued! Invoice: $${itemPrice} < Est: $${estimatedPrice}`}
                                                    >
                                                        <X size={20} strokeWidth={3} />
                                                    </button>
                                                ) : (
                                                    <Check size={20} className="text-emerald-500 mx-auto" strokeWidth={3} />
                                                );
                                            })()}
                                        </td>
                                        <td className="p-4 text-center">
                                            {(() => {
                                                const masterPart = masterDataMap[String(item.partNo || '').trim()];
                                                if (!masterPart) {
                                                    return <X size={20} className="text-red-500 mx-auto" strokeWidth={3} title="Part Not Found" />;
                                                }

                                                const strVal = masterPart?.SENSIBLE ? String(masterPart.SENSIBLE).trim().toUpperCase() : '';
                                                // If "N" OR Empty -> Green Check (Assuming empty means not sensible if part exists)
                                                // Else (e.g. "Y") -> Red X
                                                const isNotSensible = strVal === 'N' || strVal === '';

                                                // If "N" (Not Sensible) -> Green Check
                                                // Else -> Red X
                                                return isNotSensible ? (
                                                    <Check size={20} className="text-emerald-500 mx-auto" strokeWidth={3} />
                                                ) : (
                                                    <X size={20} className="text-red-500 mx-auto" strokeWidth={3} />
                                                );
                                            })()}
                                        </td>
                                        <td className="p-4 text-center">
                                            {(() => {
                                                const partNo = String(item.partNo || '').trim();
                                                const exists = !!masterDataMap[partNo];
                                                return exists ? (
                                                    <Check size={20} className="text-emerald-500 mx-auto" strokeWidth={3} />
                                                ) : (
                                                    <X size={20} className="text-red-500 mx-auto" strokeWidth={3} />
                                                );
                                            })()}
                                        </td>
                                        <td className="p-4 font-medium text-slate-800">
                                            {editingId === item.id ? (
                                                <input
                                                    type="text"
                                                    value={editValues.invoiceNo || ''}
                                                    onChange={e => setEditValues({ ...editValues, invoiceNo: e.target.value })}
                                                    className="w-full px-2 py-1 border rounded bg-white text-xs"
                                                />
                                            ) : item.invoiceNo}
                                        </td>
                                        <td className="p-4 text-slate-600 font-mono text-xs">
                                            {editingId === item.id ? (
                                                <input
                                                    type="text"
                                                    value={editValues.containerNo || ''}
                                                    onChange={e => setEditValues({ ...editValues, containerNo: e.target.value })}
                                                    className="w-full px-2 py-1 border rounded bg-white text-xs"
                                                    placeholder="Container"
                                                />
                                            ) : (item.containerNo || '-')}
                                        </td>
                                        <td className="p-4 text-slate-600 whitespace-nowrap">{item.date}</td>
                                        <td className="p-4">
                                            {item.regimen ? (
                                                <span className={`px-2 py-1 rounded text-xs font-bold ${item.regimen === 'A1'
                                                    ? 'bg-purple-100 text-purple-700'
                                                    : 'bg-emerald-100 text-emerald-700'
                                                    }`}>
                                                    {item.regimen}
                                                </span>
                                            ) : (
                                                <span className="px-2 py-1 rounded text-xs font-bold bg-red-100 text-red-600 animate-pulse border border-red-200">
                                                    MISSING
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-4 text-slate-600 font-mono text-xs">
                                            {editingId === item.id ? (
                                                <input
                                                    type="text"
                                                    value={editValues.incoterm || ''}
                                                    onChange={e => setEditValues({ ...editValues, incoterm: e.target.value })}
                                                    className="w-full px-2 py-1 border rounded bg-white text-xs"
                                                    placeholder="Incoterm"
                                                />
                                            ) : (item.incoterm || '').replace(/INCOTERM/i, '').replace(/:/g, '').trim().split(' ')[0]}
                                        </td>
                                        <td className="p-4 text-slate-600 font-mono text-xs">
                                            {item.hts ? (
                                                item.hts
                                            ) : (
                                                <span className="px-2 py-1 rounded text-xs font-bold bg-red-100 text-red-600 animate-pulse border border-red-200">
                                                    MISSING
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-4 text-slate-600">
                                            {editingId === item.id ? (
                                                <input
                                                    type="text"
                                                    value={editValues.partNo || ''}
                                                    onChange={e => setEditValues({ ...editValues, partNo: e.target.value })}
                                                    className="w-full px-2 py-1 border rounded bg-white text-xs font-mono"
                                                />
                                            ) : item.partNo}
                                        </td>
                                        <td className="p-4 text-slate-600">{item.model}</td>
                                        <td className="p-4 text-slate-600 max-w-xs truncate" title={item.englishName}>{item.englishName}</td>
                                        <td className="p-4 text-slate-600 max-w-xs truncate" title={item.spanishDescription || item.englishName}>
                                            {item.spanishDescription ? (
                                                <span className="uppercase">{item.spanishDescription}</span>
                                            ) : (
                                                <span className="px-2 py-1 rounded text-xs font-bold bg-red-100 text-red-600 animate-pulse border border-red-200">
                                                    MISSING
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-4 text-right font-mono">
                                            {editingId === item.id ? (
                                                <input
                                                    type="number"
                                                    value={editValues.qty || 0}
                                                    onChange={e => setEditValues({ ...editValues, qty: Number(e.target.value) })}
                                                    className="w-20 px-2 py-1 border rounded bg-white text-right"
                                                />
                                            ) : item.qty}
                                        </td>
                                        <td className="p-4 font-mono text-xs">
                                            {editingId === item.id ? (
                                                <input
                                                    type="text"
                                                    value={editValues.um || ''}
                                                    onChange={e => setEditValues({ ...editValues, um: e.target.value })}
                                                    className="w-16 px-2 py-1 border rounded bg-white uppercase"
                                                />
                                            ) : (
                                                item.um ? item.um : (
                                                    <span className="px-2 py-1 rounded text-xs font-bold bg-red-100 text-red-600 animate-pulse border border-red-200">
                                                        MISSING
                                                    </span>
                                                )
                                            )}
                                        </td>
                                        <td className="p-4 text-right font-mono">
                                            {editingId === item.id ? (
                                                <input
                                                    type="number"
                                                    value={editValues.netWeight || 0}
                                                    onChange={e => setEditValues({ ...editValues, netWeight: Number(e.target.value) })}
                                                    className="w-20 px-2 py-1 border rounded bg-white text-right"
                                                    step="0.01"
                                                />
                                            ) : (
                                                item.netWeight ? item.netWeight.toFixed(2) : (
                                                    <span className="px-2 py-1 rounded text-xs font-bold bg-red-100 text-red-600 animate-pulse border border-red-200">
                                                        MISSING
                                                    </span>
                                                )
                                            )}
                                        </td>
                                        <td className="p-4 text-right font-mono font-medium text-slate-600">
                                            {editingId === item.id ? (
                                                ((editValues.qty || 0) * (editValues.netWeight || 0)).toFixed(2)
                                            ) : (
                                                ((item.qty || 0) * (item.netWeight || 0)).toFixed(2)
                                            )}
                                        </td>
                                        <td className="p-4 text-right font-mono">
                                            {editingId === item.id ? (
                                                <input
                                                    type="number"
                                                    value={editValues.unitPrice || 0}
                                                    onChange={e => setEditValues({ ...editValues, unitPrice: Number(e.target.value) })}
                                                    className="w-24 px-2 py-1 border rounded bg-white text-right"
                                                    step="0.01"
                                                />
                                            ) : `$${item.unitPrice.toFixed(2)}`}
                                        </td>
                                        <td className="p-4 text-right font-mono font-medium">${((item.qty || 0) * (item.unitPrice || 0)).toFixed(2)}</td>

                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div >

            {/* Bulk Delete Modal */}
            {
                bulkDeleteModal && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl">
                            <h3 className="text-lg font-bold text-slate-800 mb-2">Confirm Deletion</h3>
                            <p className="text-slate-600 mb-6">
                                Are you sure you want to delete {selectedIds.size} selected items? This action cannot be undone.
                            </p>
                            <div className="flex justify-end gap-3">
                                <button
                                    onClick={() => setBulkDeleteModal(false)}
                                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmBulkDelete}
                                    className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg"
                                >
                                    Delete {selectedIds.size} Items
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Container Input Modal */}
            {
                showContainerModal && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl animate-in fade-in zoom-in duration-200">
                            <div className="flex items-center gap-3 mb-4 text-blue-600">
                                <Search size={24} />
                                <h3 className="text-xl font-bold text-slate-800">Container Not Found</h3>
                            </div>

                            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-4">
                                <p className="text-blue-800 text-sm">
                                    Could not find a Container Number in the filename (Pattern: 4 Letters + 7 Digits).
                                    <br />
                                    Please enter it manually to assign it to <b>{pendingFileItems.length} items</b>.
                                </p>
                            </div>

                            <div className="mb-6">
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Container / Guide Number
                                </label>
                                <input
                                    type="text"
                                    autoFocus
                                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 uppercase font-mono"
                                    placeholder="e.g. MSKU1234567"
                                    value={tempContainerNo}
                                    onChange={(e) => setTempContainerNo(e.target.value.toUpperCase())}
                                    onKeyDown={(e) => e.key === 'Enter' && confirmContainerInput()}
                                />
                            </div>

                            <div className="flex justify-end gap-3">
                                <button
                                    onClick={() => {
                                        setShowContainerModal(false);
                                        setPendingFileItems([]);
                                        if (fileInputRef.current) fileInputRef.current.value = '';
                                    }}
                                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                                >
                                    Cancel Import
                                </button>
                                <button
                                    onClick={confirmContainerInput}
                                    disabled={!tempContainerNo}
                                    className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    <Save size={18} /> Save & Import
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Amendments Modal */}
            {
                showRegimenModal && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-lg p-6 max-w-2xl w-full shadow-xl animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-bold text-slate-800">Amendments & Corrections</h3>
                                <button onClick={() => setShowRegimenModal(false)} className="text-slate-400 hover:text-slate-600">
                                    <X size={24} />
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {/* Left: Regimen Update */}
                                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                                    <h4 className="font-bold text-slate-700 mb-2 flex items-center gap-2">
                                        <Repeat size={16} /> Bulk Regimen Update
                                    </h4>
                                    <p className="text-sm text-slate-500 mb-4">
                                        Force update <b>{selectedIds.size} items</b> to a specific regimen.
                                    </p>
                                    <div className="flex gap-2 mb-4">
                                        <button
                                            onClick={() => setBulkRegimenValue('IN')}
                                            className={`flex-1 py-2 px-3 rounded border font-bold text-sm transition-all ${bulkRegimenValue === 'IN'
                                                ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                                                : 'border-slate-300 bg-white text-slate-400'
                                                }`}
                                        >
                                            IN (Standard)
                                        </button>
                                        <button
                                            onClick={() => setBulkRegimenValue('A1')}
                                            className={`flex-1 py-2 px-3 rounded border font-bold text-sm transition-all ${bulkRegimenValue === 'A1'
                                                ? 'border-purple-500 bg-purple-50 text-purple-700'
                                                : 'border-slate-300 bg-white text-slate-400'
                                                }`}
                                        >
                                            A1 (Regimen)
                                        </button>
                                    </div>
                                    <button
                                        onClick={handleBulkRegimenUpdate}
                                        className="w-full py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-bold"
                                    >
                                        Apply Regimen
                                    </button>
                                </div>

                                {/* Right: Master Data Auto-Fill */}
                                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                                    <h4 className="font-bold text-blue-800 mb-2 flex items-center gap-2">
                                        <CheckCircle size={16} /> Master Data Auto-Fill
                                    </h4>
                                    <p className="text-sm text-blue-600 mb-4">
                                        Found Matches: <b>{Object.keys(amendmentMatches).length}</b> / {selectedIds.size} items.
                                    </p>

                                    <div className="space-y-2 mb-4 max-h-40 overflow-y-auto text-xs bg-white p-2 rounded border border-blue-100">
                                        {Object.keys(amendmentMatches).map(id => {
                                            const match = amendmentMatches[id];
                                            return (
                                                <div key={id} className="grid grid-cols-12 gap-2 border-b border-gray-100 last:border-0 py-1 items-center">
                                                    <span className="col-span-4 font-mono text-slate-600 truncate" title={match.PART_NUMBER}>{match.PART_NUMBER}</span>
                                                    <span className="col-span-6 text-emerald-600 font-bold truncate text-[10px]" title={match.DESCRIPCION_ES}>{match.DESCRIPCION_ES}</span>
                                                    <span className="col-span-2 text-slate-500 font-mono text-right">{match.UMC}</span>
                                                </div>
                                            );
                                        })}
                                        {Object.keys(amendmentMatches).length === 0 && (
                                            <p className="text-center text-slate-400 py-2">No matching parts found in Master Data.</p>
                                        )}
                                    </div>

                                    <button
                                        onClick={handleApplyMasterData}
                                        disabled={Object.keys(amendmentMatches).length === 0}
                                        className="w-full py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                                    >
                                        <Save size={16} /> Apply Master Data
                                    </button>
                                    <p className="text-[10px] text-blue-400 mt-2 text-center">
                                        Updates: Desc(ES), HTS, UMC, NetWeight
                                    </p>
                                </div>
                            </div>

                        </div>
                    </div>
                )
            }
            {/* Restore Modal */}
            {
                showRestoreModal && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-lg p-6 max-w-lg w-full shadow-xl animate-in fade-in zoom-in duration-200">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                    <History size={24} className="text-blue-600" /> Restore Points
                                </h3>
                                <button onClick={() => setShowRestoreModal(false)} className="text-slate-400 hover:text-slate-600">
                                    <X size={24} />
                                </button>
                            </div>
                            <p className="text-sm text-slate-500 mb-4">
                                Select a snapshot to restore. <b>Warning:</b> Unsaved changes made after the snapshot will be lost.
                            </p>
                            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                                {restorePoints.length === 0 ? (
                                    <p className="text-center text-slate-400 py-8">No restore points available.</p>
                                ) : (
                                    restorePoints.map((point: any) => (
                                        <div key={point.id} className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition-colors flex justify-between items-center group">
                                            <div>
                                                <p className="font-bold text-slate-700">{point.reason}</p>
                                                <p className="text-xs text-slate-400">
                                                    {new Date(point.timestamp).toLocaleString()} • {point.sizeKB} KB
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => confirmRestore(point.id)}
                                                className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-md text-sm font-medium hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors flex items-center gap-1 opacity-0 group-hover:opacity-100"
                                            >
                                                <RotateCcw size={14} /> Restore
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )
            }
            {/* --- ESTIMATED PRICE RESOLUTION MODAL --- */}
            {showEstModal && estItem && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <AlertTriangle className="text-orange-500" size={24} />
                                Resolve Estimated Price
                            </h3>
                            <button onClick={handleCloseEstModal} className="text-slate-400 hover:text-slate-600">
                                <X size={24} />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-6 space-y-6">

                            {/* Part Info */}
                            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">PART NUMBER</span>
                                <div className="font-mono text-lg font-bold text-slate-800">{estItem.partNo}</div>
                                <div className="text-sm text-slate-500 mt-1">{estItem.spanishDescription}</div>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                {/* Left: Master Data (Reference) */}
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <label className="text-sm font-bold text-slate-600">Master Data Estimated</label>
                                        <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-medium">Reference</span>
                                    </div>
                                    <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-lg">
                                        <div className="text-xs text-indigo-400 mb-1">RECORDED ESTIMATE</div>
                                        <div className={`text-lg font-mono font-bold ${estMasterPart ? 'text-indigo-900' : 'text-red-500'}`}>
                                            {estMasterPart
                                                ? `$${parseFloat(String(estMasterPart.ESTIMATED || 0)).toFixed(2)}`
                                                : 'PART NOT FOUND'
                                            }
                                        </div>
                                    </div>
                                </div>

                                {/* Right: Invoice (Target) */}
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <label className="text-sm font-bold text-slate-600">Invoice Unit Price</label>
                                        <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-medium">To Fix</span>
                                    </div>

                                    <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-lg">
                                        <div className="text-xs text-emerald-400 mb-1">CURRENT INVOICE PRICE</div>
                                        <div className="text-lg font-mono font-bold text-emerald-900">
                                            ${parseFloat(String(estItem.unitPrice || 0)).toFixed(2)}
                                        </div>
                                    </div>

                                    {/* Editable Invoice Price */}
                                    <div className="pt-2">
                                        <div className="flex justify-between items-center mb-1">
                                            <label className="text-xs font-medium text-slate-500">Corrected Price</label>
                                            <button
                                                onClick={() => setResolvedUnitPrice(String(estMasterPart?.ESTIMATED || '0'))}
                                                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                                            >
                                                Use Master Value
                                            </button>
                                        </div>
                                        <textarea
                                            className="w-full border border-emerald-300 ring-2 ring-emerald-100 rounded p-2 text-lg font-mono font-bold text-slate-800 focus:outline-none focus:ring-emerald-300"
                                            value={resolvedUnitPrice}
                                            onChange={(e) => setResolvedUnitPrice(e.target.value)}
                                            placeholder="0.00"
                                            rows={1}
                                        />
                                        <p className="text-xs text-slate-400 mt-1">
                                            * Updates 'UNIT PRICE' and recalculates 'TOTAL AMOUNT'.
                                        </p>
                                    </div>
                                </div>
                            </div>

                        </div>

                        {/* Footer */}
                        <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
                            <button
                                onClick={handleCloseEstModal}
                                className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg font-medium transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveEst}
                                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm transition-colors flex items-center gap-2"
                            >
                                <Check size={18} /> Apply Correction
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* R8 Diff Resolution Modal */}
            {
                showDiffModal && diffItem && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-lg p-6 max-w-2xl w-full shadow-xl animate-in fade-in zoom-in duration-200">
                            <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
                                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                    <AlertCircle className="text-amber-500" />
                                    Resolve R8 Mismatch
                                </h3>
                                <button onClick={handleCloseDiffModal} className="text-slate-400 hover:text-slate-600">
                                    <X size={24} />
                                </button>
                            </div>

                            <div className="space-y-6 mb-6">
                                {/* Comparison Grid - Optimized for Large Text */}
                                <div className="grid grid-cols-2 gap-4">
                                    {/* Row 1: Master Data Content (Full Width) */}
                                    <div className="col-span-2 p-4 bg-slate-50 rounded-lg border border-slate-200">
                                        <p className="text-xs font-bold text-slate-500 uppercase mb-2">Master Data R8 Description (Reference)</p>
                                        <div className="text-sm font-medium text-slate-800 bg-white p-3 rounded border border-slate-100 max-h-32 overflow-y-auto font-mono whitespace-pre-wrap">
                                            {diffMasterPart?.DESCRIPCION_R8 || <span className="text-slate-400 italic">Not Found in Master Data</span>}
                                        </div>
                                    </div>

                                    {/* Row 2: Comparison Side-by-Side */}
                                    <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                                        <p className="text-xs font-bold text-slate-500 uppercase mb-2">File R8 (RB)</p>
                                        <p className="text-sm font-medium text-slate-800 break-words">
                                            {diffItem.rb || <span className="text-slate-400 italic">Empty</span>}
                                        </p>
                                    </div>
                                    <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                                        <p className="text-xs font-bold text-blue-600 uppercase mb-2">Factura (Desc ES)</p>
                                        <p className="text-sm font-medium text-blue-900 break-words">
                                            {diffItem.spanishDescription || <span className="text-blue-300 italic">Empty</span>}
                                        </p>
                                    </div>
                                </div>

                                {/* Edit Section - Dual Fields */}
                                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-2">
                                            Corrected Description (Factura)
                                        </label>
                                        <textarea
                                            className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm bg-white text-slate-800"
                                            rows={4}
                                            value={resolvedDescription}
                                            onChange={(e) => setResolvedDescription(e.target.value)}
                                            placeholder="Edit Invoice Description..."
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center justify-between">
                                            <span>Master Data R8</span>
                                            <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">Edits Database</span>
                                        </label>
                                        <textarea
                                            className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 font-mono text-sm bg-white text-slate-800"
                                            rows={4}
                                            value={resolvedR8Description}
                                            onChange={(e) => setResolvedR8Description(e.target.value)}
                                            placeholder="Edit Master Data R8..."
                                            disabled={!diffMasterPart}
                                        />
                                        {!diffMasterPart && <p className="text-xs text-red-400 mt-1">Part not found in DB</p>}
                                    </div>
                                </div>

                                <p className="text-xs text-slate-500 italic">
                                    * Saving will update the item in the list AND the Master Data record if changed.
                                </p>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                                <button
                                    onClick={handleCloseDiffModal}
                                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveDiff}
                                    className="px-6 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg flex items-center gap-2 font-bold shadow-sm"
                                >
                                    <Check size={18} /> Apply Correction
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};
