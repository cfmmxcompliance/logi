import React, { useState, useEffect, useRef, useDeferredValue } from 'react';
// import ExcelJS from 'exceljs'; // REMOVED: Dynamic Import
// import * as XLSX_Basic from 'xlsx/dist/xlsx.mini.min.js'; // REMOVED: Dynamic Import
import { Upload, FileDown, Search, Plus, Trash2, Edit2, X, Check, FileSpreadsheet, AlertCircle, FileText, CheckCircle, Save, Repeat, History, RotateCcw, AlertTriangle, Calendar, Database } from 'lucide-react';
import { storageService } from '../services/storageService.ts';
import { CommercialInvoiceItem, RawMaterialPart, VesselTrackingRecord } from '../types.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useNotification } from '../context/NotificationContext.tsx';
import { LOGO_BASE64 } from '../src/constants/logo.ts';






// Helper for Master Data Application (Shared Logic)
const applyMasterDataToItems = (
    items: CommercialInvoiceItem[],
    masterDataMap: Record<string, RawMaterialPart>
): CommercialInvoiceItem[] => {
    return items.map(item => {
        const normalizedPartNo = String(item.partNo || '').trim();
        const match = masterDataMap[normalizedPartNo];

        if (match) {
            return {
                ...item,
                spanishDescription: match.DESCRIPCION_ES?.trim() || item.spanishDescription,
                englishName: match.DESCRIPTION_EN?.trim() || item.englishName,
                hts: match.HTSMX?.trim() || item.hts,
                rb: match.R8?.trim() || (['FALTA', 'N/A', 'NA', 'NO APLICA'].includes(item.rb?.toString().toUpperCase() || '') ? '' : item.rb),
                um: match.UMC?.trim() || item.um,
                // Only overwrite netWeight if Master Data has it defined (>0)
                // If Invoice has weight but Master Data is 0, keep Invoice weight (safest assumption)
                netWeight: (match.NETWEIGHT && Number(match.NETWEIGHT) > 0) ? Number(match.NETWEIGHT) : (item.netWeight || 0),
                regimen: match.REGIMEN?.trim() || item.regimen,
                prosec: match.PROSEC?.toString().trim() || item.prosec,
                // Correction of PartNo casing/trimming
                partNo: match.PART_NUMBER?.trim() || item.partNo
            };
        }
        return item;
    });
};

// Helper for Consolidation
const consolidateItems = (
    rawItems: any[],
    masterPartsMap: Map<string, number>
): CommercialInvoiceItem[] => {
    const map = new Map<string, CommercialInvoiceItem>();

    rawItems.forEach(row => {
        // Key includes ONLY invariant fields for identification (Part, Price, Invoice)
        // Description and Regimen are metadata that can be updated, so they shouldn't trigger a new ID.
        // This enforces DETERMINISTIC IDs -> "Same Part + Same Invoice + Same Price = Same Item".
        const key = `${String(row.partNo).trim().toUpperCase()}|${Number(row.unitPrice).toFixed(6)}|${String(row.invoiceNo).trim().toUpperCase()}`;

        const masterPart = masterPartsMap.get(row.partNo);
        // Handle both old (number) and new (object) map values for safety
        const masterWeight = (typeof masterPart === 'object' && masterPart !== null) ? (masterPart as any).NETWEIGHT : masterPart;
        const hasMasterWeight = masterWeight !== undefined && masterWeight !== null && !isNaN(Number(masterWeight));

        const existing = map.get(key);
        if (existing) {
            existing.qty += row.qty;
            // netWeight (Unit Weight) stays the same for compressed items.
            existing.totalAmount = existing.qty * existing.unitPrice;
        } else {
            // Initial weight: If master exists, it's Unit Weight. If not, it's Total Line Weight from Excel? 
            // Wait, usually Master Data = Unit Weight. Excel = Total Weight.
            // Let's stick to previous logic: `Number(masterWeight)` was likely Unit Weight.
            const initialWeight = hasMasterWeight ? Number(masterWeight) : (row.netWeight || 0);

            const cleanKey = key.replace(/[^a-zA-Z0-9|]/g, '-');
            map.set(key, {
                id: cleanKey,
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

// Componente optimizado para evitar re-renderizados masivos
const InvoiceRow = React.memo(({
    item,
    index,
    isSelected,
    onSelect,
    isEditing,
    onStartEdit,
    onCancelEdit,
    onSaveEdit,
    onDelete,
    editValues,
    setEditValues,
    masterPart,
    onOpenDiff,
    onOpenEst,
    blNo
}: any) => {

    // Lógica auxiliar visual (extraída del render inline para velocidad)
    const getStatusIcons = () => {
        // R8 Logic
        const r8Code = masterPart?.R8?.toString().trim().toUpperCase() || '';
        const r8Desc = masterPart?.DESCRIPCION_R8?.toString().trim().toUpperCase() || '';
        const itemDesc = item.spanishDescription?.toString().trim().toUpperCase() || '';

        let itemRb = item.rb?.toString().trim().toUpperCase() || '';
        // Treat FALTA/NA as empty for comparison (User Request: "cuando no aplica")
        if (['FALTA', 'N/A', 'NA', 'NO APLICA'].includes(itemRb)) itemRb = '';

        const isTextMatch = r8Desc && itemDesc && (r8Desc.includes(itemDesc) || itemDesc.includes(r8Desc));
        const isCodeMatch = r8Code && (itemRb === r8Code);
        const isR8Match = !r8Code || !itemRb || isCodeMatch || isTextMatch;

        // Price Logic
        const estPrice = Number(masterPart?.ESTIMATED || 0);
        const itemPrice = parseFloat(String(item.unitPrice || '0'));
        const remarks = masterPart?.REMARKS?.toString().toLowerCase() || '';
        const isPriceIssue = (estPrice > 0 && itemPrice < estPrice) || ((estPrice === 0 && remarks.includes('price')) && !item.priceVerified);

        // Sensible Logic
        const sensibleVal = masterPart?.SENSIBLE ? String(masterPart.SENSIBLE).trim().toUpperCase() : '';
        // User Request: Warning (X) only if Sensible AND Regimen is 'IN'. Otherwise Green Check.
        const isSensibleClean = (sensibleVal === 'N' || sensibleVal === '') || item.regimen !== 'IN';

        return { isR8Match, isPriceIssue, isSensibleClean, estPrice };
    };

    const status = getStatusIcons();

    return (
        <tr className={`hover:bg-slate-50 transition-colors group ${isEditing ? 'bg-blue-50' : ''}`}>
            <td className="p-4">
                <input type="checkbox" checked={isSelected} onChange={() => onSelect(item.id)} className="rounded border-slate-300" />
            </td>
            <td className="p-4 text-center">
                {isEditing ? (
                    <div className="flex items-center gap-1 justify-center">
                        <button onClick={() => onSaveEdit(item.id)} className="text-emerald-600 hover:bg-emerald-50 p-1 rounded"><Save size={16} /></button>
                        <button onClick={onCancelEdit} className="text-slate-400 hover:bg-slate-100 p-1 rounded"><X size={16} /></button>
                    </div>
                ) : (
                    <div className="flex items-center gap-1 justify-center">
                        <button onClick={() => onStartEdit(item)} className="text-slate-400 hover:text-blue-600 p-1"><Edit2 size={16} /></button>
                        <button onClick={() => onDelete(item.id)} className="text-slate-400 hover:text-red-500 p-1"><Trash2 size={16} /></button>
                    </div>
                )}
            </td>
            <td className="p-4 font-mono font-bold text-slate-700">{index + 1}</td>

            {/* R8 Diff Column */}
            <td className="p-4 text-center">
                {!masterPart ? (
                    <button className="text-red-500 hover:text-red-700 p-1"><X size={20} strokeWidth={3} /></button>
                ) : status.isR8Match ? (
                    <Check size={20} className="text-emerald-500 mx-auto" strokeWidth={3} />
                ) : (
                    <button onClick={() => onOpenDiff(item)} className="text-red-500 hover:text-red-700 p-1"><X size={20} strokeWidth={3} /></button>
                )}
            </td>

            {/* Estimated Price Column */}
            <td className="p-4 text-center">
                {!masterPart ? (
                    <button onClick={() => onOpenEst(item)} className="text-red-500 hover:text-red-700 p-1"><X size={20} strokeWidth={3} /></button>
                ) : status.isPriceIssue ? (
                    <button onClick={() => onOpenEst(item)} className="text-red-500 hover:text-red-700 p-1" title={`Est: $${status.estPrice}`}><X size={20} strokeWidth={3} /></button>
                ) : (
                    <Check size={20} className="text-emerald-500 mx-auto" strokeWidth={3} />
                )}
            </td>

            {/* Sensible Column */}
            <td className="p-4 text-center">
                {!masterPart ? <X size={20} className="text-red-500 mx-auto" strokeWidth={3} /> :
                    status.isSensibleClean ? <Check size={20} className="text-emerald-500 mx-auto" strokeWidth={3} /> : <X size={20} className="text-red-500 mx-auto" strokeWidth={3} />}
            </td>

            {/* DB Exists Column */}
            <td className="p-4 text-center">
                {masterPart ? <Check size={20} className="text-emerald-500 mx-auto" strokeWidth={3} /> : <X size={20} className="text-red-500 mx-auto" strokeWidth={3} />}
            </td>

            {/* Invoice No */}
            <td className="p-4 font-medium text-slate-800">
                <div className="flex items-center gap-2">
                    {isEditing ? (
                        <input type="text" value={editValues.invoiceNo || ''} onChange={e => setEditValues({ ...editValues, invoiceNo: e.target.value })} className="w-full px-2 py-1 border rounded bg-white text-xs" />
                    ) : item.invoiceNo}
                </div>
            </td>

            {/* BL Column */}
            <td className="p-4 text-slate-600 font-mono text-xs">
                {blNo || '-'}
            </td>

            {/* Container */}
            <td className="p-4 text-slate-600 font-mono text-xs">
                {isEditing ? (
                    <input type="text" value={editValues.containerNo || ''} onChange={e => setEditValues({ ...editValues, containerNo: e.target.value })} className="w-full px-2 py-1 border rounded bg-white text-xs" />
                ) : (item.containerNo || '-')}
            </td>

            <td className="p-4 text-slate-600 whitespace-nowrap">{item.date}</td>

            {/* Regimen */}
            <td className="p-4">
                {item.regimen ? (
                    <span className={`px-2 py-1 rounded text-xs font-bold ${item.regimen === 'A1' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'}`}>{item.regimen}</span>
                ) : <span className="px-2 py-1 rounded text-xs font-bold bg-red-100 text-red-600 animate-pulse">MISSING</span>}
            </td>

            {/* Incoterm */}
            <td className="p-4 text-slate-600 font-mono text-xs">
                {isEditing ? (
                    <input type="text" value={editValues.incoterm || ''} onChange={e => setEditValues({ ...editValues, incoterm: e.target.value })} className="w-full px-2 py-1 border rounded bg-white text-xs" />
                ) : (item.incoterm || '').replace(/INCOTERM/i, '').split(' ')[0]}
            </td>

            {/* HTS */}
            <td className="p-4 text-slate-600 font-mono text-xs">
                {item.hts || <span className="px-2 py-1 rounded text-xs font-bold bg-red-100 text-red-600 animate-pulse">MISSING</span>}
            </td>

            {/* CLAVESAT */}
            <td className="p-4 text-slate-600 font-mono text-xs">
                {masterPart?.CLAVESAT !== undefined && masterPart?.CLAVESAT !== null && masterPart?.CLAVESAT !== ''
                    ? String(masterPart.CLAVESAT)
                    : <span className="text-slate-300">—</span>}
            </td>

            {/* IGI DUTY */}
            <td className="p-4 text-slate-600 font-mono text-xs">
                {masterPart?.IGI_DUTY !== undefined && masterPart?.IGI_DUTY !== null && masterPart?.IGI_DUTY !== ''
                    ? String(masterPart.IGI_DUTY)
                    : <span className="text-slate-300">—</span>}
            </td>

            {/* PROSEC */}
            <td className="p-4 text-slate-600 font-mono text-xs">
                {(() => {
                    const v = masterPart?.PROSEC ?? item.prosec;
                    return v !== undefined && v !== null && v !== '' ? String(v) : <span className="text-slate-300">—</span>;
                })()}
            </td>

            {/* R8 */}
            <td className="p-4 text-slate-600 font-mono text-xs">
                {(() => {
                    const v = masterPart?.R8 ?? item.rb;
                    return v !== undefined && v !== null && v !== '' ? String(v) : <span className="text-slate-300">—</span>;
                })()}
            </td>

            {/* Part No */}
            <td className="p-4 text-slate-600">
                {isEditing ? (
                    <input type="text" value={editValues.partNo || ''} onChange={e => setEditValues({ ...editValues, partNo: e.target.value })} className="w-full px-2 py-1 border rounded bg-white text-xs font-mono" />
                ) : item.partNo}
            </td>

            <td className="p-4 text-slate-600">{item.model}</td>
            <td className="p-4 text-slate-600 max-w-xs truncate" title={item.englishName}>{item.englishName}</td>

            <td className="p-4 text-slate-600 max-w-xs truncate" title={item.spanishDescription}>
                {item.spanishDescription ? <span className="uppercase">{item.spanishDescription}</span> : <span className="px-2 py-1 bg-red-100 text-red-600 text-xs font-bold">MISSING</span>}
            </td>

            {/* Qty, UM, Weight, Price */}
            <td className="p-4 text-right font-mono">
                {isEditing ? <input type="number" value={editValues.qty || 0} onChange={e => setEditValues({ ...editValues, qty: Number(e.target.value) })} className="w-20 px-2 py-1 border rounded text-right" /> : item.qty}
            </td>
            <td className="p-4 font-mono text-xs">
                {isEditing ? <input type="text" value={editValues.um || ''} onChange={e => setEditValues({ ...editValues, um: e.target.value })} className="w-16 px-2 py-1 border rounded uppercase" /> : (item.um || <span className="text-red-600 font-bold">MISSING</span>)}
            </td>
            <td className="p-4 text-right font-mono">
                {isEditing ? <input type="number" step="0.001" value={editValues.netWeight || 0} onChange={e => setEditValues({ ...editValues, netWeight: Number(e.target.value) })} className="w-20 px-2 py-1 border rounded text-right" /> : (item.netWeight ? item.netWeight.toFixed(3) : <span className="text-red-600">MISSING</span>)}
            </td>
            <td className="p-4 text-right font-mono text-slate-600">
                {isEditing ? ((editValues.qty || 0) * (editValues.netWeight || 0)).toFixed(3) : ((item.qty || 0) * (item.netWeight || 0)).toFixed(3)}
            </td>
            <td className="p-4 text-right font-mono">
                {isEditing ? <input type="number" step="0.01" value={editValues.unitPrice || 0} onChange={e => setEditValues({ ...editValues, unitPrice: Number(e.target.value) })} className="w-24 px-2 py-1 border rounded text-right" /> : `$${item.unitPrice.toFixed(2)}`}
            </td>
            <td className="p-4 text-right font-mono font-medium">${((item.qty || 0) * (item.unitPrice || 0)).toFixed(2)}</td>
        </tr>
    );
}, (prev, next) => {
    // Custom compare function for performance
    return (
        prev.item === next.item &&
        prev.isSelected === next.isSelected &&
        prev.isEditing === next.isEditing &&
        prev.masterPart === next.masterPart &&
        prev.editValues === next.editValues
    );
});

export const CIExtractor: React.FC = () => {
    const { user } = useAuth();
    const isAdmin = user?.role === 'Admin';
    const isEditor = user?.role === 'Editor';
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
    const deferredSearchTerm = useDeferredValue(searchTerm); // NON-BLOCKING UI

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkDeleteModal, setBulkDeleteModal] = useState(false);
    const [editingItem, setEditingItem] = useState<CommercialInvoiceItem | null>(null);
    const [incotermLabel, setIncotermLabel] = useState<string>('');

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(50);

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
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');
    const [showQueryBuilder, setShowQueryBuilder] = useState(false);
    const [queryConditions, setQueryConditions] = useState<any[]>([]);

    const [stats, setStats] = useState({
        totalItems: 0,
        inCount: 0,
        a1Count: 0
    });

    const updateStats = (data: CommercialInvoiceItem[]) => {
        setStats({
            totalItems: data.length,
            inCount: data.filter(i => i.regimen !== 'A1').length,
            a1Count: data.filter(i => i.regimen === 'A1').length
        });
    };

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

    useEffect(() => {
        const syncMasterData = () => {
            const rawParts = storageService.getParts();

            // PERF: Skip rebuild if array reference hasn't changed (prevents unnecessary sorting/mapping)
            if ((syncMasterData as any).lastRef === rawParts) return;
            (syncMasterData as any).lastRef = rawParts;

            const parts = [...rawParts];
            // Sort by Date Ascending (Oldest -> Newest) so Newest overwrites Oldest in the map
            parts.sort((a, b) => {
                const dateA = a.UPDATE_TIME ? new Date(a.UPDATE_TIME).getTime() : 0;
                const dateB = b.UPDATE_TIME ? new Date(b.UPDATE_TIME).getTime() : 0;
                return dateA - dateB;
            });

            const map: Record<string, RawMaterialPart> = {};
            parts.forEach(p => {
                if (p.PART_NUMBER) {
                    const normalizedKey = String(p.PART_NUMBER).trim();
                    map[normalizedKey] = p;
                }
            });
            setMasterDataMap(map);
        };

        const initLoad = async () => {
            setLoading(true);
            // Trigger Lazy Load of Master Data + Invoices
            await Promise.all([
                storageService.loadMasterData(),
                storageService.refreshInvoices()
            ]);
            syncMasterData();
            loadData();
        };

        initLoad();

        // Subscribe to updates (Fixes slow load / race condition)
        const unsubscribe = storageService.subscribe(() => {
            syncMasterData();
            loadData(); // CRITICAL: Reload Invoices when Storage Updates
        });
        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, []);

    // --- TRACKING DATA FOR BL MAPPING ---
    const [tracking, setTracking] = useState<VesselTrackingRecord[]>([]);

    useEffect(() => {
        const fetchTracking = () => {
            const data = storageService.getVesselTracking();
            setTracking(data);
        };
        fetchTracking();
        const interval = setInterval(fetchTracking, 2000);
        return () => clearInterval(interval);
    }, []);

    const invoiceToBLMap = React.useMemo(() => {
        const map: Record<string, string> = {};
        tracking.forEach(t => {
            if (t.invoiceNo) map[t.invoiceNo] = t.blNo || '';
        });
        return map;
    }, [tracking]);

    const [showPendingBLsModal, setShowPendingBLsModal] = useState(false);

    const pendingBLs = React.useMemo(() => {
        const uploadedInvoices = new Set(items.map(i => String(i.invoiceNo).trim().toUpperCase()));

        const pendingMap = new Map<string, { vessel: string, containers: Set<string>, invoices: Set<string> }>();

        tracking.forEach(t => {
            if (t.blNo && t.invoiceNo) {
                const inv = String(t.invoiceNo).trim().toUpperCase();
                if (!uploadedInvoices.has(inv)) {
                    if (!pendingMap.has(t.blNo)) {
                        pendingMap.set(t.blNo, { vessel: t.vessel, containers: new Set(), invoices: new Set() });
                    }
                    if (t.containerNo) pendingMap.get(t.blNo)!.containers.add(t.containerNo);
                    pendingMap.get(t.blNo)!.invoices.add(t.invoiceNo);
                }
            }
        });

        return Array.from(pendingMap.entries()).map(([blNo, data]) => ({
            blNo,
            vessel: data.vessel,
            containers: Array.from(data.containers),
            invoices: Array.from(data.invoices)
        }));
    }, [items, tracking]);



    // Look up Master Data when Amendments modal opens
    // AUTO RECOVERY ON MOUNT
    useEffect(() => {
        const attemptRecovery = async () => {
            const restored = await storageService.recoverLocalData();
            if (restored > 0) {
                showNotification('Data Recovery', `Restored ${restored} unsaved items from local storage.`, 'success');
                loadData(); // Refresh UI
            }
        };
        attemptRecovery();
    }, []); // Only on Mount

    // Look up Master Data when Amendments modal opens
    useEffect(() => {
        if (showRegimenModal && selectedIds.size > 0) {
            const allParts = storageService.getParts();
            const matches: Record<string, RawMaterialPart> = {};

            items.filter(i => selectedIds.has(i.id)).forEach(item => {
                // Improved Matching Logic using MasterDataMap (O(1) lookup vs O(N) find)
                const normalizedPartNo = String(item.partNo || '').trim();
                const part = masterDataMap[normalizedPartNo];

                if (part) {
                    matches[item.id] = part;
                }
            });
            setAmendmentMatches(matches);
        }
    }, [showRegimenModal, selectedIds, items, masterDataMap]);

    const handleApplyMasterData = async () => {
        try {
            // 1. Filter selected items
            const explicitItems = items.filter(i => selectedIds.has(i.id));

            // 2. Apply Master Data Logic
            const enrichedItems = applyMasterDataToItems(explicitItems, masterDataMap);

            // Optimization: Prevent "Ghost Writes" (updating items that didn't actually change)
            const updates = enrichedItems.filter(newItem => {
                const original = items.find(i => i.id === newItem.id);
                if (!original) return false;

                // Compare key fields to see if ANY changed
                const hasChanged =
                    newItem.spanishDescription !== original.spanishDescription ||
                    newItem.hts !== original.hts ||
                    newItem.rb !== original.rb ||
                    newItem.um !== original.um ||
                    newItem.regimen !== original.regimen ||
                    newItem.netWeight !== original.netWeight ||
                    newItem.partNo !== original.partNo; // In case normalization changed casing

                return hasChanged;
            });

            if (updates.length > 0) {
                // Use Batch Update (Atomic & Safer)
                await storageService.batchUpdateInvoiceItems(updates);

                loadData();
                setShowRegimenModal(false);
                setSelectedIds(new Set());
                showNotification('Auto-Fill Success', `Updated ${updates.length} items from Master Data.`, 'success');
            } else {
                showNotification('No Matches', 'No Master Data found for selected items.', 'warning');
            }
        } catch (error) {
            console.error("Apply Master Data Failed:", error);
            showNotification('Update Failed', 'Could not apply Master Data updates.', 'error');
        }
    };

    const handleBulkRegimenUpdate = async () => {
        try {
            const updates = items
                .filter(i => selectedIds.has(i.id))
                // Optimization: Ignore if already has this regimen
                .filter(i => i.regimen !== bulkRegimenValue)
                .map(i => ({ ...i, regimen: bulkRegimenValue }));

            if (updates.length === 0) {
                showNotification('No Changes', 'Selected items already have this regimen.', 'info');
                return;
            }

            // Use Batch Update (Atomic & Safer than Promise.all)
            await storageService.batchUpdateInvoiceItems(updates);

            loadData();
            setShowRegimenModal(false);
            setSelectedIds(new Set());
            showNotification('Update Success', `Updated regimen for ${updates.length} items.`, 'success');
        } catch (error) {
            console.error("Bulk Regimen Update Failed:", error);
            showNotification('Update Failed', 'Could not update regimen.', 'error');
        }
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

        // 1. Prepare Updates
        const updatedItem = {
            ...diffItem,
            spanishDescription: resolvedDescription,
            rb: diffMasterPart?.R8 || diffItem.rb
        };

        const promises: Promise<any>[] = [];

        // 2. Optimistic Item Update
        setItems(prevItems => prevItems.map(i => i.id === diffItem.id ? updatedItem : i));
        promises.push(storageService.updateInvoiceItem(updatedItem));

        // 3. Master Data Update (if changed)
        if (diffMasterPart && diffMasterPart.DESCRIPCION_R8 !== resolvedR8Description) {
            const updatedPart: RawMaterialPart = {
                ...diffMasterPart,
                DESCRIPCION_R8: resolvedR8Description,
                UPDATE_TIME: new Date().toISOString()
            };

            // Local Map Update
            setMasterDataMap(prev => ({
                ...prev,
                [updatedPart.PART_NUMBER]: updatedPart
            }));

            promises.push(storageService.updatePart(updatedPart));
        }

        // 4. IMMEDIATE CLOSURE (Optimistic UI)
        handleCloseDiffModal();

        // 5. Background Cloud Update
        Promise.all(promises)
            .then(() => {
                showNotification('R8 Resolution', 'Descriptions updated successfully in cloud.', 'success');
            })
            .catch(err => {
                console.error("R8 Background Update Failed:", err);
                showNotification('Update Sync Warning', 'Updates saved locally but cloud sync failed. Retrying in background...', 'warning');
            });
    };

    // Stats


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

        // 1. Prepare Update
        const hasChanged = Math.abs(newPrice - (estItem.unitPrice || 0)) > 0.001;
        const updatedItem = {
            ...estItem,
            unitPrice: newPrice,
            totalAmount: parseFloat((newPrice * (estItem.qty || 0)).toFixed(2)),
            priceVerified: hasChanged ? true : (estItem.priceVerified || false)
        };

        // 2. Optimistic UI Update
        setItems(prevItems => prevItems.map(i => i.id === estItem.id ? updatedItem : i));

        // 3. IMMEDIATE CLOSURE
        handleCloseEstModal();

        // 4. Background Cloud Update
        storageService.updateInvoiceItem(updatedItem)
            .then(() => {
                if (hasChanged) {
                    showNotification('Price Update', 'Price corrected & verified in cloud.', 'success');
                }
            })
            .catch(err => {
                console.error("Price Sync Failed:", err);
                showNotification('Sync Warning', 'Price updated locally but cloud sync failed.', 'warning');
            });
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
                        // DYNAMIC IMPORT: Load library only when needed
                        const XLSX_Basic = await import('xlsx/dist/xlsx.mini.min.js');
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
                        // Map Columns
                        // @ts-ignore
                        const headers = Array.from(data[headerRowIndex] as any[] || []).map(cell => String(cell || '').trim());
                        const colMap: Record<string, number> = {};
                        const requiredCols = ['ITEM', 'MODEL', 'PART NO', 'ENGLISH NAME', 'SPANISH DESCRIPTION', 'HTS', 'PROSEC', 'RB', 'QTY', 'UM', 'NETWEIGHT', 'UNIT PRICE', 'TOTAL AMOUNT', 'REGIMEN'];

                        requiredCols.forEach(col => {
                            let idx = headers.findIndex(h => {
                                const normalizedHeader = (h || '').toUpperCase().replace(/[^A-Z]/g, '').trim();
                                const normalizedCol = col.replace(/[^A-Z]/g, '').trim();
                                return normalizedHeader === normalizedCol;
                            });

                            if (idx === -1) {
                                const hUpper = headers.map(h => (h || '').toUpperCase());
                                if (col === 'SPANISH DESCRIPTION') idx = hUpper.findIndex(h => h.includes('DESCRIP') && h.includes('ES'));
                                else if (col === 'ENGLISH NAME') idx = hUpper.findIndex(h => h.includes('ENGLISH') || h.includes('NAME'));
                                else if (col === 'UNIT PRICE') {
                                    idx = hUpper.findIndex(h => h.includes('PRICE') && !h.includes('TOTAL')); // Avoid "TOTAL PRICE"
                                    if (idx === -1) idx = hUpper.findIndex(h => h.includes('UNIT') && h.includes('USD'));
                                    if (idx === -1) idx = hUpper.findIndex(h => (h === 'PRICE(USD)' || h === 'UNIT PRICE'));
                                } else if (col === 'TOTAL AMOUNT') {
                                    if (idx === -1) idx = hUpper.findIndex(h => h.includes('TOTAL') && h.includes('USD'));
                                    if (idx === -1) idx = hUpper.findIndex(h => h.includes('AMOUNT') && h.includes('USD'));
                                } else if (col === 'UM') {
                                    idx = hUpper.findIndex(h => h === 'UM' || h === 'U.M.' || h === 'U-M' || h === 'U/M');
                                } else if (col === 'RB') {
                                    idx = hUpper.findIndex(h => h === 'RB' || h === 'R8');
                                } else if (col === 'NETWEIGHT') {
                                    idx = hUpper.findIndex(h => h.includes('NET') && h.includes('WEIGHT'));
                                }
                            }
                            if (idx !== -1) colMap[col] = idx;
                        });


                        // Metadata (Invoice, Date)
                        let invoiceNo = '';
                        // Try mapping
                        let invIdx = headers.findIndex(h => h.includes('INVOICE') || h === 'FACTURA' || h === 'NO. DE FACTURA');
                        if (invIdx !== -1) {
                            invoiceNo = String((data[headerRowIndex + 1] || [])[invIdx] || '').trim();
                        }

                        // Fallback: Filename based Invoice detection
                        // Pattern: CI-{INVOICE}_for_{CONTAINER}.xlsx
                        if ((!invoiceNo || invoiceNo.length < 3 || invoiceNo === 'UNKNOWN') && file.name.includes('CI-')) {
                            const ciMatch = file.name.match(/CI-([^_]+)/); // Matches content between CI- and _
                            if (ciMatch && ciMatch[1]) {
                                invoiceNo = ciMatch[1];
                                console.log("Extracted Invoice from Filename:", invoiceNo);
                            }
                        }
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
                        // Pre-fetch Master Data for NetWeight and R8 correction
                        const allParts = storageService.getParts();
                        // Sort by Date Ascending (Oldest -> Newest) so Newest overwrites Oldest in the map
                        allParts.sort((a, b) => {
                            const dateA = a.UPDATE_TIME ? new Date(a.UPDATE_TIME).getTime() : 0;
                            const dateB = b.UPDATE_TIME ? new Date(b.UPDATE_TIME).getTime() : 0;
                            return dateA - dateB;
                        });
                        const partsMap = new Map<string, any>(allParts.map(p => {
                            const key = p.PART_NUMBER ? String(p.PART_NUMBER).trim() : '';
                            return [key, p];
                        }));

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

                            const partNo = row[colMap['PART NO']] ? String(row[colMap['PART NO']]).trim() : '';
                            const itemCode = row[colMap['ITEM']];
                            if (!partNo && !itemCode) continue;
                            if (String(itemCode).toUpperCase().includes('TOTAL')) continue;

                            const unitPrice = parseCurrency(row[colMap['UNIT PRICE']]);
                            const regime = row[colMap['REGIMEN']]?.toString().toUpperCase() || '';
                            const invoice = invoiceNo || 'UNKNOWN';
                            const qty = Number(row[colMap['QTY']]) || 0;
                            const partData = partsMap.get(partNo);
                            const excelNetWeight = Number(row[colMap['NETWEIGHT']] || 0);

                            // Auto-Correction logic:
                            // 1. NetWeight: Prioritize Master Data (Unit Weight) over Excel to avoid "Total Weight treated as Unit" errors.
                            // If Master Data is missing, use Excel value (fallback).
                            const finalNetWeight = (partData?.NETWEIGHT && Number(partData.NETWEIGHT) > 0)
                                ? Number(partData.NETWEIGHT)
                                : isNaN(excelNetWeight) ? 0 : excelNetWeight;
                            const fileRb = row[colMap['RB']] || '';
                            const finalRb = fileRb ? fileRb : (partData?.R8 || '');

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
                                rb: finalRb,
                                qty: qty,
                                um: row[colMap['UM']] || '',
                                netWeight: finalNetWeight,
                                unitPrice: unitPrice,
                                regimen: regime,
                                incoterm: '' // Set later
                            });
                        }

                        // Consolidate
                        const newItemsRaw = consolidateItems(rawItems, partsMap as any);

                        // AUTOMATION: Auto-Apply Master Data to New Items
                        // This ensures that when we save, we already have the correct HTS/Desc/etc.
                        const newItems = applyMasterDataToItems(newItemsRaw, masterDataMap);

                        // Apply Incoterm
                        if (parsedIncoterm) {
                            newItems.forEach(i => i.incoterm = parsedIncoterm);
                        }

                        if (newItems.length > 0) {
                            // Fix: Define ID detection Regex
                            // Support Standard Containers (ABCD1234567) AND Courier Tracking (DHL 123..., FedEx 123...)
                            const containerRegex = /[A-Z]{4}\d{7}/;
                            const dhlRegex = /DHL\s+(\d+)/i;
                            const fedexRegex = /FedEx\s+(\d+)/i;

                            let targetContainerNo = '';
                            let matchType = '';

                            const matchContainer = file.name.match(containerRegex);
                            const matchDHL = file.name.match(dhlRegex);
                            const matchFedEx = file.name.match(fedexRegex);

                            if (matchDHL) {
                                targetContainerNo = matchDHL[1]; // Capture group 1 (digits)
                                matchType = 'DHL';
                            } else if (matchFedEx) {
                                targetContainerNo = matchFedEx[1]; // Capture group 1 (digits)
                                matchType = 'FedEx';
                            } else if (matchContainer) {
                                targetContainerNo = matchContainer[0];
                                matchType = 'Standard';
                            }

                            if (targetContainerNo) {
                                // CASE A: Container/Tracking Found -> SAFE SAVE

                                // Check for duplicates
                                if (items.some(i => i.containerNo === targetContainerNo)) {
                                    errors.push(`${file.name}: ${matchType} Tracking ${targetContainerNo} already exists.`);
                                } else {
                                    const itemsWithContainer = newItems.map(i => ({ ...i, containerNo: targetContainerNo }));

                                    // FORCE OVERWRITE: Delete old items first, then add new ones.
                                    // Extract invoice number from the first item (all items in this batch belong to the same invoice/file)
                                    const targetInvoice = itemsWithContainer[0]?.invoiceNo || 'UNKNOWN';

                                    if (targetInvoice && targetInvoice !== 'UNKNOWN') {
                                        await storageService.overwriteInvoiceItems(targetInvoice, itemsWithContainer);
                                    } else {
                                        // Fallback if no invoice found (should not happen in valid files)
                                        console.warn("No invoice number found for overwrite logic, defaulting to append.");
                                        await storageService.addInvoiceItems(itemsWithContainer);
                                    }

                                    // Since we overwrite, count is just the new length
                                    importCount += itemsWithContainer.length;
                                }
                            } else {
                                // CASE B: No Container -> DO NOT SAVE YET
                                // Add to pending logic for user manual assignment
                                pendingAggregate.push(...newItems);
                                // Note: We do NOT call storageService.addInvoiceItems here.
                            }
                        } else {
                            errors.push(`${file.name}: No valid items found.`);
                        }
                        resolve();
                    } catch (err: any) {
                        console.error('CIExtractor Process Error:', err);

                        let msg = err.message || 'Unknown Parse Error';
                        if (msg.includes('Failed to fetch dynamically imported module')) {
                            msg = "New version detected. Please REFRESH the page to update internal components.";
                        }

                        errors.push(`${file.name}: ${msg}`);
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
            showNotification('Safe Upload', `Successfully persisted ${importCount} items to Cloud.`, 'success');
        } else if (files.length > 0 && pendingAggregate.length === 0) {
            showNotification('Ignored', 'All items were duplicates and have been skipped.', 'warning');
        }

        if (pendingAggregate.length > 0) {
            setPendingFileItems(pendingAggregate);
            setTempContainerNo('');
            setShowContainerModal(true);
            showNotification('Action Required', `${pendingAggregate.length} items saved as TEMP. Please assign Container Number.`, 'info');
        }

        if (errors.length > 0) {
            // Show first few errors
            showNotification('Import Warnings', errors.slice(0, 3).join(' | '), 'warning');
        }

        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // --- REUSABLE EXPORT FUNCTION (ExcelJS) ---

    const exportToExcelStamped = async (data: CommercialInvoiceItem[], filename: string) => {
        // DYNAMIC IMPORT: Load library only when needed
        const ExcelJS = (await import('exceljs')).default;

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

        // Prepare Master Data Lookup for hydration
        const allParts = storageService.getParts();
        const partsMap = new Map<string, any>(allParts.map(p => [p.PART_NUMBER, p]));

        data.forEach(item => {
            const r = ws.getRow(currentRowIdx);

            // Just-In-Time R8 Hydration
            const masterPart = partsMap.get(item.partNo);
            const r8Value = item.rb || (masterPart?.R8 || '');

            const values = [
                item.item, item.model, item.partNo, item.englishName, item.spanishDescription,
                item.hts, item.prosec, r8Value, item.qty, item.um,
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
        // FIX: Use static value instead of formula to prevent Excel "Repair" errors
        qtyCell.value = totalQty;
        qtyCell.font = { bold: true };
        qtyCell.alignment = { horizontal: 'center' };
        qtyCell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

        // Total Amount (Col 14 / N)
        const amtCell = fRow.getCell(14);
        // FIX: Use static value instead of formula
        amtCell.value = parseFloat(totalAmount.toFixed(2));
        amtCell.numFmt = '0.00';
        amtCell.font = { bold: true };
        amtCell.alignment = { horizontal: 'center' };
        amtCell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

        // GENERATE & DOWNLOAD
        const buffer = await workbook.xlsx.writeBuffer();
        // FORCE 'application/octet-stream' to prevent browser "preview" tabs (UUIDs)
        const blob = new Blob([buffer], { type: 'application/octet-stream' });

        // MANUAL DOWNLOAD - BYPASS fileHelpers.ts TO GUARANTEE FILENAME
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', filename); // Explicitly set download attribute
        document.body.appendChild(link);
        link.click();

        // Cleanup
        setTimeout(() => {
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        }, 3000);
    };

    // Memory Optimized Filter Logic


    const handleSelectRow = (id: string) => {
        setSelectedIds(prev => {
            const newSelected = new Set(prev);
            if (newSelected.has(id)) newSelected.delete(id);
            else newSelected.add(id);
            return newSelected;
        });
    };

    const [isDeleting, setIsDeleting] = useState(false);

    const confirmBulkDelete = async () => {
        try {
            setIsDeleting(true);
            const idsToDelete = Array.from(selectedIds);

            // Optimistic Update: Remove immediately from UI
            setItems(prev => prev.filter(i => !selectedIds.has(i.id)));
            setSelectedIds(new Set()); // Clear selection immediately
            setBulkDeleteModal(false); // Close modal immediately

            await storageService.deleteInvoiceItems(idsToDelete as string[]);

            showNotification('Deleted', `Deleted ${idsToDelete.length} items.`, 'success');
        } catch (error) {
            console.error(error);
            showNotification('Error', 'Failed to delete items. Please try again.', 'error');
        } finally {
            setIsDeleting(false);
        }
    };


    const handleDelete = async (id: string) => {
        if (confirm("Are you sure you want to delete this item?")) {
            // Optimistic Update: Remove immediately from UI
            setItems(prev => prev.filter(i => i.id !== id));

            try {
                await storageService.deleteInvoiceItem(id);
                showNotification('Deleted', "Item deleted.", 'success');
            } catch (error) {
                console.error(error);
                // Revert or Sync on error
                loadData();
                showNotification('Error', 'Failed to delete item.', 'error');
            }
        }
    };

    const confirmContainerInput = async () => {
        if (!tempContainerNo) {
            showNotification('Input Required', "Please enter a Container/Guide Number.", 'warning');
            return;
        }

        // Duplicate Check (Logic from User)
        const exists = items.some(i => i.containerNo === tempContainerNo);
        if (exists) {
            if (!confirm(`Container ${tempContainerNo} already contains data. Merge items?`)) return;
        }

        // Assign Container and SAVE NOW (First time persistence)
        const itemsWithContainer = pendingFileItems.map(i => ({
            ...i,
            containerNo: tempContainerNo,
            // Natural key for persistence if missing (should already be there from consolidation)
            id: i.id || `${i.invoiceNo}-${i.partNo}-${i.qty}-${tempContainerNo}`
        }));

        await storageService.addInvoiceItems(itemsWithContainer);

        loadData(); // REFRESH UI
        showNotification('Import Successful', `Successfully imported ${itemsWithContainer.length} items to ${tempContainerNo}.`, 'success');

        setPendingFileItems([]);
        setTempContainerNo('');
        setShowContainerModal(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const [showErrorsOnly, setShowErrorsOnly] = useState(false);

    // Helper to check R8 Mismatch
    const checkR8Mismatch = (item: CommercialInvoiceItem) => {
        const normalizedPartNo = String(item.partNo || '').trim();
        const masterPart = masterDataMap[normalizedPartNo];
        const r8Code = masterPart?.R8?.toString().trim().toUpperCase() || '';
        const r8Desc = masterPart?.DESCRIPCION_R8?.toString().trim().toUpperCase() || '';
        const itemDesc = item.spanishDescription?.toString().trim().toUpperCase() || '';

        let itemRb = item.rb?.toString().trim().toUpperCase() || '';
        // Treat FALTA/NA as empty for comparison (Matches getStatusIcons)
        if (['FALTA', 'N/A', 'NA', 'NO APLICA'].includes(itemRb)) itemRb = '';

        const isTextMatch = r8Desc && itemDesc && (r8Desc.includes(itemDesc) || itemDesc.includes(r8Desc));
        const isCodeMatch = r8Code && (itemRb === r8Code);
        const isR8Match = !r8Code || !itemRb || isCodeMatch || isTextMatch;

        return !isR8Match; // Return true if mismatch (Red X)
    };

    // Memory Optimized Filter Logic
    const filteredItems = React.useMemo(() => {
        // CPU Optimization: Calculate terms ONCE
        const terms = deferredSearchTerm ? deferredSearchTerm.split(',').map(s => s.trim().toLowerCase()).filter(s => s.length > 0) : [];

        const hasSearch = terms.length > 0;

        // Pre-calculate condition sets for O(1) performance in Mass Query
        const activeQueryConditions = queryConditions
            .filter(c => c.value && c.value.trim().length > 0)
            .map(c => {
                if (c.operator === 'in_list') {
                    const listItems = c.value.split(/[\n,;\t]+/)
                        .map((s: string) => s.trim().toLowerCase())
                        .filter((s: string) => s.length > 0);
                    return { ...c, set: new Set(listItems) };
                }
                return c;
            });

        return items.filter(i => {
            if (showMissingOnly) {
                const hasMissingData = !i.regimen || !i.hts || !i.spanishDescription || !i.um || !i.netWeight;
                if (!hasMissingData) return false;
            }

            if (showErrorsOnly) {
                if (!checkR8Mismatch(i)) return false;
            }

            if (showSensibleOnly) {
                const partNo = String(i.partNo || '').trim();
                const masterPart = masterDataMap[partNo];
                const strVal = masterPart?.SENSIBLE ? String(masterPart.SENSIBLE).trim().toUpperCase() : '';
                const isNotSensible = strVal === 'N' || strVal === '';
                if (isNotSensible) return false;
            }

            if (showNoDBOnly) {
                const partNo = String(i.partNo || '').trim();
                if (masterDataMap[partNo]) return false;
            }

            if (showPricesOnly) {
                const partNo = String(i.partNo || '').trim();
                const masterPart = masterDataMap[partNo];
                if (!masterPart) {
                    // Keep
                } else {
                    const remarks = masterPart.REMARKS?.toString().toLowerCase() || '';
                    const estimatedPrice = Number(masterPart.ESTIMATED || 0);
                    const itemPrice = parseFloat(String(i.unitPrice || '0'));
                    const isUndervalued = estimatedPrice > 0 && itemPrice < estimatedPrice;
                    const isLegacyError = (estimatedPrice === 0 && remarks.includes('price')) && !i.priceVerified;
                    if (!(isUndervalued || isLegacyError)) return false;
                }
            }

            // Date Range Filter (Robust ISO Comparison)
            if (startDate || endDate) {
                const itemDateStr = i.date || '';
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
                    // If we have a filter but couldn't parse the item date, hide it to be safe
                    return false;
                }
            }

            // Advanced Query Builder Filter (Optimized)
            if (activeQueryConditions.length > 0) {
                const results = activeQueryConditions.every(condition => {
                    const { column, operator, value } = condition;
                    if (!value) return true;

                    // Support for BL lookup if column is 'bl'
                    let itemValue = '';
                    if (column === 'bl') {
                        itemValue = String((i as any).bl || invoiceToBLMap[i.invoiceNo] || '').toLowerCase();
                    } else {
                        itemValue = String((i as any)[column] || '').toLowerCase();
                    }

                    const targetValue = value.toLowerCase();

                    if (operator === 'contains') return itemValue.includes(targetValue);
                    if (operator === 'equals') return itemValue === targetValue;
                    if (operator === 'in_list' && (condition as any).set) {
                        return ((condition as any).set as Set<string>).has(itemValue.trim());
                    }
                    return true;
                });
                if (!results) return false;
            }

            if (!hasSearch) return true;

            // Optimized Search: Pre-compute searchable string for the row
            const normalize = (str: any) => String(str || '').toLowerCase();
            const rowSearchStr = `
                ${normalize(i.invoiceNo)} 
                ${normalize(i.partNo)} 
                ${normalize(i.model)} 
                ${normalize(i.englishName)} 
                ${normalize(i.spanishDescription)} 
                ${normalize(i.hts)} 
                ${normalize(i.regimen)} 
                ${normalize(i.containerNo)}
                ${normalize(i.um)}
                ${normalize(i.incoterm)}
                ${normalize(i.item)}
                ${normalize((i as any).bl || '')}
                ${normalize(invoiceToBLMap[i.invoiceNo])}
                ${normalize(i.rb)}
                ${normalize(i.qty)}
                ${normalize(i.unitPrice)}
                ${normalize(i.totalAmount)}
                ${normalize(i.netWeight)}
                ${normalize(i.prosec)}
                ${normalize(i.date)}
            `;
            // AND Condition: ALL terms (from comma split) must match somewhere in this row
            return terms.every(term => rowSearchStr.includes(term));
        });
    }, [items, deferredSearchTerm, showMissingOnly, showErrorsOnly, showSensibleOnly, showNoDBOnly, showPricesOnly, masterDataMap, invoiceToBLMap, startDate, endDate, queryConditions]);

    const handleSplitAndExport = async () => {
        // FORCE FRESH FETCH FROM CLOUD to avoid stale closure / ghost data issues
        showNotification('Syncing...', "Verifying data with Cloud DB...", 'info');
        const freshData = await storageService.refreshInvoices();

        let sourceItems = freshData;

        // Re-apply critical filters if active (e.g. search)
        if (searchTerm) {
            const lowerTerm = searchTerm.toLowerCase();
            sourceItems = sourceItems.filter(i =>
                JSON.stringify(i).toLowerCase().includes(lowerTerm) // Simplified robust search
            );
        }

        // Apply same filters as UI if needed, but usually export wants EVERYTHING visible
        // We will respect the 'filteredItems' logic by re-filtering if needed, 
        // OR just default to "All Loaded Items" if the user wants to export what is "in the DB"
        // User complaint: "Csvs salian con datos duplicados... recien cargado y recien borrado"
        // This implies the EXPORT had lines that were DELETED. Fresh fetch fixes this.

        if (sourceItems.length === 0) {
            showNotification('Export Info', "No data found in database.", 'warning');
            return;
        }

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

    // --- CSV EXPORT BLINDADO (Sin librerías, Sin basura, Sin UUIDs) ---
    const handleExportCSV = () => {
        let itemsToExport = items;
        if (selectedIds.size > 0) itemsToExport = items.filter(i => selectedIds.has(i.id));
        else if (searchTerm) itemsToExport = filteredItems;

        if (!itemsToExport || itemsToExport.length === 0) {
            showNotification('Export Info', "No data to export.", 'info');
            return;
        }

        try {
            // 1. DEFINICIÓN ESTRICTA DE COLUMNAS (Aquí controlas qué sale y qué no)
            const headers = [
                'INVOICE NO', 'DATE', 'ITEM', 'MODEL', 'PART NO',
                'ENGLISH NAME', 'SPANISH DESCRIPTION', 'HTS', 'PROSEC',
                'RB', 'QTY', 'UM', 'NETWEIGHT', 'UNIT PRICE', 'TOTAL AMOUNT', 'REGIMEN'
            ];

            // 2. CONSTRUCCIÓN MANUAL DEL CSV (Iteración rápida)
            const csvRows = itemsToExport.map((item, index) => {
                // Hidratación de Master Data (R8) al vuelo
                const normalizedPart = String(item.partNo || '').trim();
                const masterPart = masterDataMap[normalizedPart];
                const r8Value = item.rb || (masterPart?.R8 || '');
                const prosecValue = item.prosec || (masterPart?.PROSEC || '');

                // Función auxiliar para escapar comas y comillas (Excel Standard)
                const esc = (val: any) => {
                    if (val === null || val === undefined) return '';
                    const str = String(val).trim();
                    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                        return `"${str.replace(/"/g, '""')}"`;
                    }
                    return str;
                };

                // El orden AQUÍ debe coincidir exactamente con los headers de arriba
                return [
                    esc(item.invoiceNo),
                    esc(item.date),
                    esc(index + 1),
                    esc(item.model),
                    esc(item.partNo),
                    esc(item.englishName),
                    esc(item.spanishDescription), // Asegura descripciones limpias
                    esc(item.hts),
                    esc(prosecValue),
                    esc(r8Value),
                    item.qty || 0,
                    esc(item.um),
                    (item.netWeight || 0).toFixed(4),
                    (item.unitPrice || 0).toFixed(4),
                    (item.totalAmount || 0).toFixed(2),
                    esc(item.regimen)
                ].join(',');
            });

            // 3. UNIR CABECERAS Y FILAS CON BOM (Para que Excel lea acentos)
            const csvContent = '\uFEFF' + headers.join(',') + '\n' + csvRows.join('\n');

            // 4. DESCARGA INMEDIATA (Sin depender de helpers externos)
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');

            const suffix = itemsToExport[0]?.containerNo || new Date().toISOString().slice(0, 10);
            link.setAttribute('href', url);
            link.setAttribute('download', `CI_Export_${suffix}.csv`);

            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            showNotification('Success', "CSV exported cleanly (Fixed Version)", 'success');

        } catch (error) {
            console.error("Manual Export Error:", error);
            showNotification('Export Error', "Failed to generate CSV.", 'error');
        }
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedIds(new Set(filteredItems.map(i => i.id)));
        } else {
            setSelectedIds(new Set());
        }
    };


    const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
    const displayedItems = filteredItems.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    return (
        <div className="flex flex-col h-[calc(100vh-85px)] gap-2">
            {/* Rigid Layout Container */}
            {/* Header Area (Gray Background) */}
            {/* Actions Toolbar */}
            < div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col gap-4" >
                {/* Compact Toolbar: Title | Search | Filters */}
                <div className="flex flex-col md:flex-row gap-4 items-center">

                    {/* Title (Integrated) */}
                    <h1 className="text-xl font-bold text-slate-800 whitespace-nowrap shrink-0 mr-2">
                        Commercial Invoices
                    </h1>

                    {/* Left: Search (Flexible) */}
                    <div className="relative w-full md:flex-1 min-w-[200px]">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            ref={searchInputRef}
                            type="text"
                            placeholder="Search..."
                            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700 text-sm"
                            onChange={(e) => handleSearch(e.target.value)}
                            defaultValue=""
                        />
                        {/* Clear Filters Button */}
                        {(showMissingOnly || showErrorsOnly || showSensibleOnly || showNoDBOnly || showPricesOnly || searchTerm || startDate || endDate || queryConditions.length > 0) && (
                            <button
                                onClick={() => {
                                    setShowMissingOnly(false);
                                    setShowErrorsOnly(false);
                                    setShowSensibleOnly(false);
                                    setShowNoDBOnly(false);
                                    setShowPricesOnly(false);
                                    setSearchTerm('');
                                    setStartDate('');
                                    setEndDate('');
                                    setQueryConditions([]);
                                    if (searchInputRef.current) searchInputRef.current.value = '';
                                }}
                                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-xs text-red-500 underline font-bold bg-white px-2 py-1 rounded shadow-sm opacity-90 hover:opacity-100"
                            >
                                Clear
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 shadow-sm transition-all focus-within:ring-2 focus-within:ring-blue-500/20">
                        <Calendar size={14} className="text-slate-400" />
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="bg-transparent border-none text-xs text-slate-600 focus:outline-none focus:ring-0 p-0 cursor-pointer"
                        />
                        <span className="text-slate-300 text-[10px] font-bold uppercase">to</span>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="bg-transparent border-none text-xs text-slate-600 focus:outline-none focus:ring-0 p-0 cursor-pointer"
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

                    <button
                        onClick={() => setShowQueryBuilder(true)}
                        className={`p-2 rounded-lg border transition-all flex items-center gap-2 text-sm font-bold shadow-sm ${(queryConditions.length > 0) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                        title="Advanced Query Builder"
                    >
                        <Plus size={18} />
                        <span className="hidden lg:inline">Advanced Query</span>
                        {(queryConditions.length > 0) && (
                            <span className="bg-white text-blue-600 px-1.5 py-0.5 rounded-full text-[10px]">
                                {queryConditions.length}
                            </span>
                        )}
                    </button>

                    {/* Right: Filters (Fixed) */}
                    <div className="w-auto flex-none flex items-center justify-end gap-2 overflow-x-auto">
                        {pendingBLs.length > 0 && (
                            <button
                                onClick={() => setShowPendingBLsModal(true)}
                                className="px-3 py-1.5 rounded-lg border border-orange-200 bg-orange-50/80 hover:bg-orange-100 text-orange-600 font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all"
                                title="BLs en Tracking sin factura cargada"
                            >
                                <Database size={14} />
                                <span className="hidden sm:inline">Pendientes:</span> {pendingBLs.length}
                            </button>
                        )}
                        <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-lg border border-slate-200">
                            <button
                                onClick={() => setShowErrorsOnly(!showErrorsOnly)}
                                className={`px-2 py-1.5 rounded-md flex items-center gap-1 transition-all text-xs font-bold ${showErrorsOnly
                                    ? 'bg-red-500 text-white shadow-sm'
                                    : 'text-slate-600 hover:bg-white hover:shadow-sm'
                                    }`}
                                title="Show Only R8 Mismatches"
                            >
                                <AlertCircle size={14} /> R8
                            </button>
                            <div className="w-px h-3 bg-slate-300 mx-1"></div>
                            <button
                                onClick={() => setShowMissingOnly(!showMissingOnly)}
                                className={`px-2 py-1.5 rounded-md flex items-center gap-1 transition-all text-xs font-bold ${showMissingOnly
                                    ? 'bg-amber-500 text-white shadow-sm'
                                    : 'text-slate-600 hover:bg-white hover:shadow-sm'
                                    }`}
                                title="Show Missing Data"
                            >
                                <AlertCircle size={14} /> Missing
                            </button>
                            <div className="w-px h-3 bg-slate-300 mx-1"></div>
                            <button
                                onClick={() => setShowPricesOnly(!showPricesOnly)}
                                className={`px-2 py-1.5 rounded-md flex items-center gap-1 transition-all text-xs font-bold ${showPricesOnly
                                    ? 'bg-rose-500 text-white shadow-sm'
                                    : 'text-slate-600 hover:bg-white hover:shadow-sm'
                                    }`}
                                title="Show Items with Estimate Price"
                            >
                                <AlertCircle size={14} /> Prices
                            </button>
                            <div className="w-px h-3 bg-slate-300 mx-1"></div>
                            <button
                                onClick={() => setShowSensibleOnly(!showSensibleOnly)}
                                className={`px-2 py-1.5 rounded-md flex items-center gap-1 transition-all text-xs font-bold ${showSensibleOnly
                                    ? 'bg-rose-500 text-white shadow-sm'
                                    : 'text-slate-600 hover:bg-white hover:shadow-sm'
                                    }`}
                                title="Show Items marked as Sensible (!= N)"
                            >
                                <AlertCircle size={14} /> Sens
                            </button>
                            <div className="w-px h-3 bg-slate-300 mx-1"></div>
                            <button
                                onClick={() => setShowNoDBOnly(!showNoDBOnly)}
                                className={`px-2 py-1.5 rounded-md flex items-center gap-1 transition-all text-xs font-bold ${showNoDBOnly
                                    ? 'bg-rose-500 text-white shadow-sm'
                                    : 'text-slate-600 hover:bg-white hover:shadow-sm'
                                    }`}
                                title="Show Items missing from DB"
                            >
                                <AlertCircle size={14} /> DB
                            </button>
                        </div>
                    </div>
                </div>

                {/* Row 2: Actions & Filters */}
                < div className="flex flex-wrap gap-3 items-center justify-between" >
                    <div className="flex items-center gap-3 flex-wrap">
                        {/* Old filters removed, replaced by compact inline above */}
                        <div className="hidden"></div>

                        {/* Selection Actions */}
                        {selectedIds.size > 0 && (isAdmin || isEditor) && (
                            <div className="flex items-center gap-2 animate-in fade-in zoom-in duration-200">
                                {isAdmin && (
                                    <button
                                        onClick={() => setBulkDeleteModal(true)}
                                        className="bg-red-50 text-red-600 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-red-100 transition-colors border border-red-100 text-sm font-bold"
                                    >
                                        <Trash2 size={16} /> Delete ({selectedIds.size})
                                    </button>
                                )}

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
                        <button
                            onClick={async () => {
                                try {
                                    const results = await storageService.refreshInvoices();
                                    loadData(); // Re-sort and render
                                    showNotification('Synced', `Refreshed ${results.length} items from Cloud.`, 'success');
                                } catch (e: any) {
                                    console.error("Sync Error:", e);
                                    showNotification('Error', `Sync failed: ${e.message || 'Unknown error'}`, 'error');
                                }
                            }}
                            className="bg-indigo-50 text-indigo-600 px-3 py-2 rounded-lg hover:bg-indigo-100 transition-colors border border-indigo-200 flex items-center gap-2 font-bold text-xs"
                            title="Force Refresh from Cloud"
                        >
                            <RotateCcw size={16} /> Sync Cloud
                        </button>
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
                            onClick={async () => {
                                // Logic: Find unique containers in current view
                                const containers = Array.from(new Set(items.map(i => i.containerNo).filter(Boolean)));
                                if (containers.length === 0) {
                                    showNotification('Error', "No containers found.", 'error');
                                    return;
                                }

                                const target = containers.length === 1 ? containers[0] : (prompt(`Multiple containers found (${containers.length}).\nType the Container Number to DELETE ALL items for:`) || '');

                                if (!target) return;

                                if (confirm(`⚠️ DANGER: Are you sure you want to DELETE ALL items for container '${target}'?\n\nThis will ignore all filters and wipe the container completely from the database.\n\nThis cannot be undone.`)) {
                                    try {
                                        await storageService.deleteContainer(target as string);
                                        showNotification('Success', `Container ${target} deleted.`, 'success');
                                        loadData();
                                    } catch (e) {
                                        console.error(e);
                                        showNotification('Error', "Failed to delete container.", 'error');
                                    }
                                }
                            }}
                            className="bg-red-50 text-red-600 border border-red-200 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-red-100 transition-colors shadow-sm text-sm font-medium"
                            title="Delete ENTIRE Container (Ignores Filters)"
                        >
                            <Trash2 size={18} /> Delete Container
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
                                <th className="p-4 text-center">{t('ci.actions')}</th>
                                <th className="p-4">{t('ci.item')}</th>
                                <th className="p-4 text-center">{t('ci.r8diff')}</th>
                                <th className="p-4 text-center">{t('ci.estimated')}</th>
                                <th className="p-4 text-center">{t('ci.sensible')}</th>
                                <th className="p-4 text-center">{t('ci.ndb')}</th>
                                <th className="p-4 min-w-[150px]">{t('ci.invoice')}</th>
                                <th className="p-4">{t('ci.bl')}</th>
                                <th className="p-4">{t('ci.container')}</th>
                                <th className="p-4">{t('ci.date')}</th>
                                <th className="p-4">{t('ci.regimen')}</th>
                                <th className="p-4">{t('ci.incoterm')}</th>
                                <th className="p-4">{t('ci.hts')}</th>
                                <th className="p-4">{t('ci.clavesat')}</th>
                                <th className="p-4">{t('ci.igi')}</th>
                                <th className="p-4">{t('ci.prosec')}</th>
                                <th className="p-4">{t('ci.r8')}</th>
                                <th className="p-4 min-w-[300px]">{t('ci.part')}</th>
                                <th className="p-4 min-w-[200px]">{t('ci.model')}</th>
                                <th className="p-4">{t('ci.english')}</th>
                                <th className="p-4">{t('ci.desc_es')}</th>
                                <th className="p-4 text-right">{t('ci.qty')}</th>
                                <th className="p-4">{t('ci.um')}</th>
                                <th className="p-4 text-right">{t('ci.netwt')}</th>
                                <th className="p-4 text-right">{t('ci.totalnetwt')}</th>
                                <th className="p-4 text-right">{t('ci.unitprice')}</th>
                                <th className="p-4 text-right">{t('ci.total')}</th>

                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr><td colSpan={16} className="p-8 text-center text-slate-400">Loading...</td></tr>
                            ) : filteredItems.length === 0 ? (
                                <tr><td colSpan={16} className="p-8 text-center text-slate-400">No invoice items found. Import an Excel file to get started.</td></tr>
                            ) : (
                                displayedItems.map((item, index) => {
                                    // Pre-calculate Master Data lookup
                                    const partNo = String(item.partNo || '').trim();
                                    const masterPart = masterDataMap[partNo];

                                    return (
                                        <InvoiceRow
                                            key={item.id}
                                            item={item}
                                            index={(currentPage - 1) * itemsPerPage + index}
                                            isSelected={selectedIds.has(item.id)}
                                            onSelect={handleSelectRow}
                                            isEditing={editingId === item.id}
                                            onStartEdit={handleStartEdit}
                                            onCancelEdit={handleCancelEdit}
                                            onSaveEdit={handleSaveEdit}
                                            onDelete={handleDelete}
                                            editValues={editValues}
                                            setEditValues={setEditValues}
                                            masterPart={masterPart}
                                            onOpenDiff={handleOpenDiffModal}
                                            onOpenEst={handleOpenEstModal}
                                            // Fix: Read BL from DB first, then fallback to map lookup
                                            blNo={(item as any).bl || invoiceToBLMap[item.invoiceNo]}
                                        />
                                    );
                                    /*
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
                                        <td className="p-4 text-slate-600 font-mono text-xs">
                                            {(() => {
                                                const masterPart = masterDataMap[String(item.partNo || '').trim()];
                                                const clavesat = masterPart?.CLAVESAT;
                                                const igi = masterPart?.IGI_DUTY;
                                                const prosec = masterPart?.PROSEC ?? item.prosec;
                                                const r8 = masterPart?.R8 ?? item.rb;
                                                return (
                                                    <>
                                                        <span>{clavesat || <span className="text-slate-300">—</span>}</span>
                                                    </>
                                                );
                                            })()}
                                        </td>
                                        <td className="p-4 text-slate-600 font-mono text-xs">
                                            {(() => {
                                                const masterPart = masterDataMap[String(item.partNo || '').trim()];
                                                const v = masterPart?.IGI_DUTY;
                                                return v !== undefined && v !== null && v !== '' ? String(v) : <span className="text-slate-300">—</span>;
                                            })()}
                                        </td>
                                        <td className="p-4 text-slate-600 font-mono text-xs">
                                            {(() => {
                                                const masterPart = masterDataMap[String(item.partNo || '').trim()];
                                                const v = masterPart?.PROSEC ?? item.prosec;
                                                return v !== undefined && v !== null && v !== '' ? String(v) : <span className="text-slate-300">—</span>;
                                            })()}
                                        </td>
                                        <td className="p-4 text-slate-600 font-mono text-xs">
                                            {(() => {
                                                const masterPart = masterDataMap[String(item.partNo || '').trim()];
                                                const v = masterPart?.R8 ?? item.rb;
                                                return v !== undefined && v !== null && v !== '' ? String(v) : <span className="text-slate-300">—</span>;
                                            })()}
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
                                                item.netWeight ? item.netWeight.toFixed(3) : (
                                                    <span className="px-2 py-1 rounded text-xs font-bold bg-red-100 text-red-600 animate-pulse border border-red-200">
                                                        MISSING
                                                    </span>
                                                )
                                            )}
                                        </td>
                                        <td className="p-4 text-right font-mono font-medium text-slate-600">
                                            {editingId === item.id ? (
                                                ((editValues.qty || 0) * (editValues.netWeight || 0)).toFixed(3)
                                            ) : (
                                                ((item.qty || 0) * (item.netWeight || 0)).toFixed(3)
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
                                    */
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div >

            {/* Compact Pagination Bar at Bottom */}
            <div className="flex flex-col md:flex-row justify-between items-center bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-sm text-xs mt-auto">

                {/* Left: Record Range */}
                <div className="text-slate-500 font-medium">
                    Showing <span className="font-bold text-slate-800">{(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, filteredItems.length)}</span> of <span className="font-bold text-slate-800">{filteredItems.length}</span>
                </div>

                {/* Dynamic Sums (BL / Container) */}
                {(() => {
                    // 1. Calculate Total Weight
                    const totalWeight = filteredItems.reduce((sum, item) => sum + ((item.netWeight || 0) * (item.qty || 0)), 0);

                    // 2. Detect Context
                    const uniqueBLs = new Set(filteredItems.map(i => (i as any).bl || invoiceToBLMap[i.invoiceNo]).filter(Boolean));
                    const uniqueContainers = new Set(filteredItems.map(i => i.containerNo).filter(Boolean));

                    const isSingleBL = uniqueBLs.size === 1 && searchTerm;
                    const isSingleContainer = uniqueContainers.size === 1 && searchTerm;

                    if (!isSingleBL && !isSingleContainer) return null;

                    return (
                        <div className="flex items-center gap-4 ml-4">
                            {isSingleBL && (
                                <span className="text-slate-500 font-bold text-xs uppercase">
                                    BLSum: <span className="text-blue-600">{totalWeight.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg</span>
                                </span>
                            )}
                            {isSingleContainer && (
                                <span className="text-slate-500 font-bold text-xs uppercase">
                                    ContainerSum: <span className="text-purple-600">{totalWeight.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg</span>
                                </span>
                            )}
                        </div>
                    );
                })()}

                {/* Center: Integrated Stats */}
                <div className="flex items-center gap-4 bg-slate-50 px-3 py-1 rounded-md border border-slate-100">
                    <span className="text-slate-500 font-bold">Total: <span className="text-blue-600">{stats.totalItems}</span></span>
                    <span className="w-px h-3 bg-slate-300"></span>
                    <span className="text-slate-500 font-bold">Standard: <span className="text-emerald-600">{stats.inCount}</span></span>
                    <span className="w-px h-3 bg-slate-300"></span>
                    <span className="text-slate-500 font-bold">A1: <span className="text-purple-600">{stats.a1Count}</span></span>
                </div>

                {/* Right: Controls (Selector + Buttons) */}
                <div className="flex items-center gap-2">
                    {/* Limit Selector (Left of Previous) */}
                    <select
                        value={itemsPerPage}
                        onChange={(e) => {
                            setItemsPerPage(Number(e.target.value));
                            setCurrentPage(1);
                        }}
                        className="bg-slate-50 border border-slate-200 text-slate-700 text-xs rounded focus:ring-blue-500 focus:border-blue-500 block p-1.5 font-medium cursor-pointer"
                    >
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                        <option value={500}>500</option>
                    </select>

                    <div className="flex items-center border border-slate-200 rounded-md overflow-hidden">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="px-3 py-1.5 text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed border-r border-slate-200 font-medium"
                        >
                            Previous
                        </button>
                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="px-3 py-1.5 text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>

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
                                    disabled={isDeleting}
                                    className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmBulkDelete}
                                    disabled={isDeleting}
                                    className="px-4 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 shadow-lg shadow-red-200 transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-wait"
                                >
                                    {isDeleting ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            Deleting...
                                        </>
                                    ) : (
                                        `Delete ${selectedIds.size} Items`
                                    )}
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
            {/* Advanced Query Builder Modal */}
            {showQueryBuilder && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                        {/* Header */}
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-blue-50 text-blue-600 rounded-xl shadow-sm border border-blue-100">
                                    <Database size={24} />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-slate-800">Advanced Query Builder</h2>
                                    <p className="text-sm text-slate-500">Combine multiple filters to find specific records in Master Data.</p>
                                </div>
                            </div>
                            <button onClick={() => setShowQueryBuilder(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                                <X size={24} />
                            </button>
                        </div>



                        {/* Body */}
                        <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4 bg-slate-50/30">
                            {queryConditions.length === 0 ? (
                                <div className="text-center py-10 text-slate-400">
                                    <Database size={48} className="mx-auto mb-4 opacity-20" />
                                    <p>No filters added yet. Click "+ Add Condition" to start.</p>
                                </div>
                            ) : (
                                queryConditions.map((cond, idx) => (
                                    <div key={idx} className="flex gap-4 items-start bg-white p-4 rounded-xl border border-slate-200 shadow-sm transition-all hover:border-blue-200">
                                        <div className="flex-1 space-y-4">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Column</label>
                                                    <select
                                                        value={cond.column}
                                                        onChange={(e) => {
                                                            const newConds = [...queryConditions];
                                                            newConds[idx].column = e.target.value;
                                                            setQueryConditions(newConds);
                                                        }}
                                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                                                    >
                                                        <option value="partNo">No. Parte</option>
                                                        <option value="invoiceNo">No. Factura</option>
                                                        <option value="bl">BL</option>
                                                        <option value="containerNo">Contenedor</option>
                                                        <option value="hts">HTS</option>
                                                        <option value="regimen">Regimen</option>
                                                        <option value="incoterm">Incoterm</option>
                                                        <option value="englishName">English Name</option>
                                                        <option value="spanishDescription">Spanish Description</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Operator</label>
                                                    <select
                                                        value={cond.operator}
                                                        onChange={(e) => {
                                                            const newConds = [...queryConditions];
                                                            newConds[idx].operator = e.target.value;
                                                            setQueryConditions(newConds);
                                                        }}
                                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                                                    >
                                                        <option value="contains">Contains</option>
                                                        <option value="equals">Equals</option>
                                                        <option value="in_list">In List (line separated)</option>
                                                    </select>
                                                </div>
                                            </div>
                                            <div>
                                                <div className="flex justify-between items-center mb-1">
                                                    <label className="block text-[10px] font-bold text-slate-400 uppercase">Values</label>
                                                    {cond.operator === 'in_list' && cond.value && (
                                                        <span className="text-[10px] font-bold text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full">
                                                            {cond.value.split(/[\n,;\t]+/).filter((s: string) => s.trim()).length} items
                                                        </span>
                                                    )}
                                                </div>
                                                {cond.operator === 'in_list' ? (
                                                    <textarea
                                                        value={cond.value}
                                                        onChange={(e) => {
                                                            const newConds = [...queryConditions];
                                                            newConds[idx].value = e.target.value;
                                                            setQueryConditions(newConds);
                                                        }}
                                                        placeholder="Enter values (separated by line, comma, semicolon or tab)..."
                                                        rows={6}
                                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none resize-y font-mono min-h-[120px]"
                                                    />
                                                ) : (
                                                    <input
                                                        type="text"
                                                        value={cond.value}
                                                        onChange={(e) => {
                                                            const newConds = [...queryConditions];
                                                            newConds[idx].value = e.target.value;
                                                            setQueryConditions(newConds);
                                                        }}
                                                        placeholder="Enter value..."
                                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                                                    />
                                                )}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => {
                                                const newConds = queryConditions.filter((_, i) => i !== idx);
                                                setQueryConditions(newConds);
                                            }}
                                            className="mt-6 p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                ))
                            )}

                            <button
                                onClick={() => setQueryConditions([...queryConditions, { column: 'partNo', operator: 'contains', value: '' }])}
                                className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-bold text-sm bg-blue-50/50 px-4 py-3 rounded-xl border border-blue-100 border-dashed w-full justify-center transition-all hover:bg-blue-50"
                            >
                                <Plus size={18} /> Add Condition
                            </button>
                        </div>

                        {/* Footer */}
                        <div className="p-6 border-t border-slate-100 flex items-center justify-between bg-white">
                            <button
                                onClick={() => {
                                    setQueryConditions([]);
                                    setStartDate('');
                                    setEndDate('');
                                }}
                                className="text-slate-400 hover:text-red-500 font-bold text-sm transition-colors px-4 py-2 hover:bg-red-50 rounded-lg"
                            >
                                Reset All
                            </button>
                            <button
                                onClick={() => setShowQueryBuilder(false)}
                                className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold text-sm shadow-xl shadow-blue-200 hover:bg-blue-700 hover:-translate-y-0.5 transition-all active:scale-95 flex items-center gap-2"
                            >
                                Apply Query
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- PENDING BLs MODAL --- */}
            {showPendingBLsModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[80vh] overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <Database className="text-orange-500" size={24} />
                                BLs Pendientes de Carga
                            </h2>
                            <button onClick={() => setShowPendingBLsModal(false)} className="text-slate-400 hover:text-slate-600">
                                <X size={24} />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto bg-slate-50 border-b border-slate-100 flex-1">
                            {pendingBLs.length === 0 ? (
                                <p className="text-center text-slate-500 italic py-8">No hay BLs pendientes.</p>
                            ) : (
                                <div className="space-y-4">
                                    <p className="text-sm font-medium text-slate-600 mb-2">
                                        Los siguientes archivos registrados en Trazabilidad aún no tienen <i>Commercial Invoice</i> asignada en este módulo:
                                    </p>
                                    {pendingBLs.map(bl => (
                                        <div key={bl.blNo} className="border border-slate-200 rounded-xl p-4 bg-white shadow-sm">
                                            <div className="flex justify-between items-start mb-3 border-b border-slate-100 pb-2">
                                                <div>
                                                    <h3 className="font-bold text-slate-800 text-base font-mono">BL: {bl.blNo}</h3>
                                                    <p className="text-sm text-slate-500 font-medium">Buque: {bl.vessel || 'Sin nombre'}</p>
                                                </div>
                                                <span className="bg-orange-100 border border-orange-200 text-orange-700 text-[10px] font-bold px-2 py-1.5 rounded-lg uppercase shadow-sm">Falta Carga CI</span>
                                            </div>
                                            <div className="text-sm text-slate-600 mt-2 space-y-1">
                                                <p><span className="font-bold text-slate-700">Invoices Esperadas:</span> <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">{bl.invoices.join(', ')}</span></p>
                                                <p><span className="font-bold text-slate-700">Contenedores:</span> <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">{bl.containers.length > 0 ? bl.containers.join(', ') : 'No registrados'}</span></p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

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
                                        <p className="text-xs font-bold text-slate-500 uppercase mb-2">Master Data R8 (Reference)</p>
                                        <div className="text-sm font-medium text-slate-800 bg-white p-3 rounded border border-slate-100 max-h-32 overflow-y-auto font-mono whitespace-pre-wrap">
                                            {diffMasterPart ? (
                                                <>
                                                    <div className="text-slate-600 text-xs">{diffMasterPart.DESCRIPCION_R8 || 'No Description'}</div>
                                                </>
                                            ) : (
                                                <span className="text-slate-400 italic">Not Found in Master Data</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Row 2: Comparison Side-by-Side */}
                                    <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                                        <p className="text-xs font-bold text-slate-500 uppercase mb-2">File R8 (R8)</p>
                                        <p className="text-sm font-medium text-slate-800 break-words">
                                            {diffItem.rb || diffMasterPart?.R8 || <span className="text-slate-400 italic">Empty</span>}
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
                                            <span>Master Data R8 Description</span>
                                            <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">Edits Database</span>
                                        </label>
                                        <textarea
                                            className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 font-mono text-sm bg-white text-slate-800"
                                            rows={4}
                                            value={resolvedR8Description}
                                            onChange={(e) => setResolvedR8Description(e.target.value)}
                                            placeholder="R8 Description..."
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
