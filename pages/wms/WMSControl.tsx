import React, { useState, useEffect, useCallback } from 'react';
import {
    LayoutDashboard, Car, History, Map, FileBarChart, Database,
    RotateCcw, AlertTriangle, Search, Filter, Download, X, Plus, RefreshCw, Trash2
} from 'lucide-react';
import { db } from '../../services/firebaseConfig';
import { collection, onSnapshot, query, where, orderBy, limit, doc, updateDoc, addDoc, deleteDoc, getDocs } from 'firebase/firestore';


function getStoredUser() {
    try { return JSON.parse(localStorage.getItem('logimaster_user') || 'null'); } catch { return null; }
}

/* ── Types ─────────────────────────────────────────────────────────────────── */
interface QueryCondition {
    id: string;
    column: string;
    operator: string;
    value: string;
}

interface ColumnDef { label: string; key: string; }

/* ── CSV export ─────────────────────────────────────────────────────────────── */
function exportCSV(rows: any[], filename: string) {
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const csv = [
        headers.join(','),
        ...rows.map(r =>
            headers.map(h => {
                const v = String(r[h] ?? '').replace(/"/g, '""');
                return v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v}"` : v;
            }).join(',')
        )
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
}

/* ── Query Builder ──────────────────────────────────────────────────────────── */
function defaultCondition(): QueryCondition {
    return { id: Math.random().toString(36).slice(2), column: '', operator: '=', value: '' };
}

function applyConditions(rows: any[], conditions: QueryCondition[]): any[] {
    return rows.filter(row =>
        conditions.every(cond => {
            if (!cond.column) return true;
            const cell = String(row[cond.column] ?? '').toLowerCase();
            const val  = cond.value.toLowerCase().trim();
            if (!val) return true;
            switch (cond.operator) {
                case '=':        return cell === val;
                case '!=':       return cell !== val;
                case 'contains': return cell.includes(val);
                case 'in list': {
                    const list = cond.value.split(/[\n,]/).map(v => v.trim().toLowerCase()).filter(Boolean);
                    return list.includes(cell);
                }
                default: return true;
            }
        })
    );
}

interface QueryBuilderModalProps {
    columns: ColumnDef[];
    conditions: QueryCondition[];
    onChange: (c: QueryCondition[]) => void;
    onApply: () => void;
    onClose: () => void;
    onReset: () => void;
}

function WMSQueryBuilderModal({ columns, conditions, onChange, onApply, onClose, onReset }: QueryBuilderModalProps) {
    const update = (id: string, field: keyof QueryCondition, val: string) =>
        onChange(conditions.map(c => c.id === id ? { ...c, [field]: val } : c));

    const addCondition = () => onChange([...conditions, defaultCondition()]);
    const removeCondition = (id: string) => onChange(conditions.filter(c => c.id !== id));

    return (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                    <div className="flex items-center gap-3">
                        <Database className="text-indigo-600" size={22} />
                        <div>
                            <h3 className="text-lg font-bold text-gray-900">Advanced Query Builder</h3>
                            <p className="text-xs text-gray-500">Combine multiple filters to find specific records.</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
                        <X size={20} />
                    </button>
                </div>

                {/* Conditions */}
                <div className="px-6 py-4 space-y-4 max-h-[55vh] overflow-y-auto">
                    {conditions.map((cond, idx) => (
                        <div key={cond.id} className="border border-gray-200 rounded-xl p-4 relative">
                            <div className="flex items-center justify-between mb-3">
                                <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">{idx + 1}</span>
                                {conditions.length > 1 && (
                                    <button onClick={() => removeCondition(cond.id)} className="text-gray-400 hover:text-red-500 transition">
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                            <div className="grid grid-cols-3 gap-3 mb-3">
                                {/* Column */}
                                <div>
                                    <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Column</label>
                                    <select
                                        value={cond.column}
                                        onChange={e => update(cond.id, 'column', e.target.value)}
                                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                                    >
                                        <option value="">Select...</option>
                                        {columns.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                                    </select>
                                </div>
                                {/* Operator */}
                                <div>
                                    <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Operator</label>
                                    <select
                                        value={cond.operator}
                                        onChange={e => update(cond.id, 'operator', e.target.value)}
                                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                                    >
                                        <option value="=">(=) igual</option>
                                        <option value="!=">(!= ) distinto</option>
                                        <option value="contains">contains</option>
                                        <option value="in list">(in) in list</option>
                                    </select>
                                </div>
                                {/* Data type (display only) */}
                                <div>
                                    <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Data Type</label>
                                    <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-400 cursor-default" disabled>
                                        <option>String (Text)</option>
                                    </select>
                                </div>
                            </div>
                            {/* Values */}
                            <div>
                                <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">
                                    {cond.operator === 'in list' ? 'Values (one per line or comma-separated)' : 'Value'}
                                </label>
                                {cond.operator === 'in list' ? (
                                    <textarea
                                        rows={3}
                                        value={cond.value}
                                        onChange={e => update(cond.id, 'value', e.target.value)}
                                        placeholder={"Example:\nValue 1\nValue 2"}
                                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none font-mono"
                                    />
                                ) : (
                                    <input
                                        type="text"
                                        value={cond.value}
                                        onChange={e => update(cond.id, 'value', e.target.value)}
                                        placeholder="Enter value..."
                                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                    />
                                )}
                            </div>
                        </div>
                    ))}

                    {/* Add Condition */}
                    <button
                        onClick={addCondition}
                        className="w-full border-2 border-dashed border-gray-300 hover:border-indigo-400 hover:text-indigo-600 text-gray-400 rounded-xl py-3 flex items-center justify-center gap-2 text-sm font-medium transition"
                    >
                        <Plus size={16} /> Add Another Condition
                    </button>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
                    <button onClick={onReset} className="flex items-center gap-2 text-red-500 hover:text-red-700 text-sm font-medium transition">
                        <RefreshCw size={14} /> Reset All
                    </button>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 text-sm font-medium transition">
                            Cancel
                        </button>
                        <button
                            onClick={onApply}
                            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold transition"
                        >
                            <Search size={14} /> Apply Complex Filter
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ── Main Component ─────────────────────────────────────────────────────────── */
const isDev = typeof window !== 'undefined' && window.location.hostname === 'localhost';
const API_BASE = isDev ? 'http://127.0.0.1:5001/logimaster-cfmoto/us-central1/api' : '/api';

export function WMSControl() {
    const [activeTab, setActiveTab]       = useState('dashboard');
    const [vehicles, setVehicles]         = useState<any[]>([]);
    const [transfers, setTransfers]       = useState<any[]>([]);
    const [loading, setLoading]           = useState(true);
    const [reversalTarget, setReversalTarget]   = useState<any>(null);
    const [reversalReason, setReversalReason]   = useState('');
    const [reversalLoading, setReversalLoading] = useState(false);
    const [reversalMsg, setReversalMsg]         = useState<{type:'ok'|'err', text:string}|null>(null);

    const user    = getStoredUser();
    const isAdmin = user?.role === 'Admin' || user?.role === 'ADMIN' || user?.role === 'admin';

    useEffect(() => {
        // Vehicles: real-time (few docs, need live updates)
        // Optimization: Only fetch active vehicles (not SHIPPED) to avoid downloading entire historical DB
        const unsubV = onSnapshot(
            query(collection(db, 'wms_vehicles'), where('status', '!=', 'SHIPPED')),
            snap => {
                setVehicles(snap.docs.map(d => ({ id: d.id, ...d.data() })));
                setLoading(false); // show UI as soon as vehicles arrive
            },
            err => { console.error('Vehicles error:', err); setLoading(false); }
        );
        // Transfers: limit to last 500 — avoid downloading unlimited history
        const unsubT = onSnapshot(
            query(collection(db, 'wms_transfers'), orderBy('timestamp', 'desc'), limit(500)),
            snap => setTransfers(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
            err => console.error('Transfers error:', err)
        );
        // Safety fallback: max 1.5s wait instead of 5s
        const t = setTimeout(() => setLoading(false), 1500);
        return () => { unsubV(); unsubT(); clearTimeout(t); };
    }, []);


    const handleReversal = async () => {
        if (!reversalTarget || !reversalReason.trim()) return;
        setReversalLoading(true); setReversalMsg(null);
        try {
            const prevLocMap: Record<string,string> = { L2: 'L1', L3: 'L2', REJECTED_AREA: 'L1' };
            const destination = prevLocMap[reversalTarget.current_location];
            if (!destination) throw new Error('No hay ubicación anterior para este vehículo.');
            const now = new Date().toISOString();
            await updateDoc(doc(db, 'wms_vehicles', reversalTarget.vin), {
                current_location: destination, status: 'IN_PROCESS', qa_cleared: false,
                [`entered_${destination}_at`]: now,
            });
            await addDoc(collection(db, 'wms_transfers'), {
                vin: reversalTarget.vin, from_location: reversalTarget.current_location,
                to_location: destination, operator_id: user?.email || user?.name || 'Admin',
                observations: `⚠️ REVERSA ADMIN: ${reversalReason.trim()}`,
                timestamp: now, type: 'REVERSAL',
                reversed_by: user?.email || user?.name || 'Admin',
                reason: reversalReason.trim(),
            });
            setReversalMsg({ type: 'ok', text: `Vehículo ${reversalTarget.vin} revertido → ${destination}. QA debe re-autorizar.` });
            setTimeout(() => { setReversalTarget(null); setReversalReason(''); setReversalMsg(null); }, 2500);
        } catch (e: any) {
            setReversalMsg({ type: 'err', text: e.message || 'Error desconocido' });
        } finally { setReversalLoading(false); }
    };

    const prevLoc: Record<string,string> = { L2: 'L1', L3: 'L2', REJECTED_AREA: 'L1' };

    const tabs = [
        { id: 'dashboard',    label: 'Dashboard',    icon: <LayoutDashboard size={20} /> },
        { id: 'vehicles',     label: 'Vehicles',     icon: <Car size={20} /> },
        { id: 'transactions', label: 'Transactions', icon: <History size={20} /> },
        { id: 'locations',    label: 'Locations',    icon: <Map size={20} /> },
        { id: 'reports',      label: 'Reports',      icon: <FileBarChart size={20} /> },
        { id: 'enrichment',   label: 'Enrichment',   icon: <Database size={20} /> },
    ];

    if (loading) return (
        <div className="flex flex-col h-[calc(100vh-4rem)] bg-slate-900 text-white overflow-hidden">
            <div className="bg-slate-800 border-b border-slate-700 px-6 py-3">
                <div className="h-7 w-36 bg-slate-700 rounded-lg animate-pulse" />
            </div>
            <div className="flex-1 p-6 space-y-6">
                <div className="grid grid-cols-4 gap-4">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="p-6 rounded-2xl border border-slate-700 bg-slate-800 animate-pulse">
                            <div className="h-4 w-24 bg-slate-700 rounded mb-4" />
                            <div className="h-12 w-16 bg-slate-700 rounded" />
                        </div>
                    ))}
                </div>
                <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden animate-pulse">
                    {[...Array(6)].map((_, i) => (
                        <div key={i} className="flex gap-4 px-4 py-3 border-b border-slate-700">
                            <div className="h-4 w-32 bg-slate-700 rounded" />
                            <div className="h-4 w-24 bg-slate-700 rounded" />
                            <div className="h-4 w-20 bg-slate-700 rounded" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );

    return (
        <div className="flex flex-col h-[calc(100vh-4rem)] bg-slate-900 text-white overflow-hidden">

            {/* Reversal Modal */}
            {reversalTarget && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
                    <div className="bg-slate-800 border border-slate-600 rounded-2xl p-8 w-full max-w-md shadow-2xl">
                        <div className="flex items-center gap-3 mb-4">
                            <AlertTriangle className="text-amber-400" size={28} />
                            <h3 className="text-xl font-bold">Confirmar Reversa de Transacción</h3>
                        </div>
                        <p className="text-slate-300 mb-1">VIN: <span className="font-mono font-bold text-blue-400">{reversalTarget.vin}</span></p>
                        <p className="text-slate-300 mb-4">
                            Movimiento:{' '}
                            <span className="font-bold text-amber-400">{reversalTarget.current_location}</span>
                            {' → '}
                            <span className="font-bold text-green-400">{prevLoc[reversalTarget.current_location] ?? '?'}</span>
                        </p>
                        <p className="text-slate-400 text-sm mb-4">QA deberá re-autorizar el vehículo en la nueva ubicación.</p>
                        <label className="block text-sm font-semibold text-slate-300 mb-2">Motivo <span className="text-red-400">*</span></label>
                        <textarea
                            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm mb-4 resize-none focus:outline-none focus:border-amber-400"
                            rows={3} placeholder="Ej: QA autorizó por error..."
                            value={reversalReason} onChange={e => setReversalReason(e.target.value)}
                        />
                        {reversalMsg && (
                            <div className={`mb-4 px-4 py-2 rounded-lg text-sm font-semibold ${reversalMsg.type === 'ok' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                {reversalMsg.text}
                            </div>
                        )}
                        <div className="flex gap-3">
                            <button onClick={() => { setReversalTarget(null); setReversalReason(''); setReversalMsg(null); }} disabled={reversalLoading}
                                className="flex-1 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 font-semibold transition">Cancelar</button>
                            <button onClick={handleReversal} disabled={reversalLoading || !reversalReason.trim()}
                                className="flex-1 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold transition flex items-center justify-center gap-2">
                                <RotateCcw size={16} />
                                {reversalLoading ? 'Procesando...' : 'Ejecutar Reversa'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Top Bar */}
            <div className="bg-slate-800 flex flex-col md:flex-row md:items-center border-b border-slate-700 px-6 py-3 gap-4">
                <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400 shrink-0">WMS Control</h2>
                <nav className="flex flex-1 items-center gap-2 overflow-x-auto pb-2 md:pb-0 no-scrollbar">
                    {tabs.map(t => (
                        <button key={t.id} onClick={() => setActiveTab(t.id)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all whitespace-nowrap ${
                                activeTab === t.id ? 'bg-blue-600 text-white font-semibold shadow-md' : 'text-slate-400 hover:bg-slate-700 hover:text-white'
                            }`}>
                            {t.icon}
                            <span className="hidden sm:inline">{t.label}</span>
                        </button>
                    ))}
                </nav>
            </div>

            {/* Content */}
            <div className="flex-1 p-6 overflow-y-auto">
                {activeTab === 'dashboard'    && <WMSDashboard vehicles={vehicles} transfers={transfers} />}
                {activeTab === 'vehicles'     && <WMSVehicles vehicles={vehicles} transfers={transfers} isAdmin={isAdmin} onReverse={setReversalTarget} />}
                {activeTab === 'transactions' && <WMSTransactions transfers={transfers} />}
                {activeTab === 'locations'    && <WMSLocations vehicles={vehicles} />}
                {activeTab === 'enrichment'   && <WMSEnrichment vehicles={vehicles} />}
                {activeTab === 'reports' && (
                    <div className="flex items-center justify-center h-full text-slate-500 font-bold text-2xl">
                        Reports Module — Coming Soon
                    </div>
                )}
            </div>
        </div>
    );
}

/* ── Dashboard ──────────────────────────────────────────────────────────────── */
function WMSDashboard({ vehicles, transfers }: any) {
    const l1      = vehicles.filter((v:any) => v.current_location === 'L1' && v.status !== 'SHIPPED').length;
    const l2      = vehicles.filter((v:any) => v.current_location === 'L2' && v.status !== 'SHIPPED').length;
    const l3      = vehicles.filter((v:any) => v.current_location === 'L3' && v.status !== 'SHIPPED').length;
    const blocked = vehicles.filter((v:any) => v.status === 'BLOCKED').length;
    return (
        <div className="space-y-6">
            <h3 className="text-2xl font-bold">Real-time Overview</h3>
            <div className="grid grid-cols-4 gap-4">
                <StatCard title="L1 PREPARACIÓN" value={l1}      color="blue" />
                <StatCard title="L2 FG"           value={l2}      color="indigo" />
                <StatCard title="L3 EMBARQUE"     value={l3}      color="purple" />
                <StatCard title="BLOCKED"          value={blocked} color="red" />
            </div>
        </div>
    );
}

function StatCard({ title, value, color }: any) {
    const colors: Record<string,string> = {
        blue:   'bg-blue-500/20 text-blue-400 border-blue-500/30',
        indigo: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
        purple: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
        red:    'bg-red-500/20 text-red-400 border-red-500/30',
    };
    return (
        <div className={`p-6 rounded-2xl border ${colors[color]} flex flex-col items-center justify-center`}>
            <span className="text-sm font-bold opacity-80 mb-2">{title}</span>
            <span className="text-5xl font-black">{value}</span>
        </div>
    );
}

/* ── Vehicles Tab ───────────────────────────────────────────────────────────── */
const VEHICLE_COLUMNS: ColumnDef[] = [
    { label: 'VIN',        key: 'vin' },
    { label: 'Ubicación',  key: 'current_location' },
    { label: 'QA',         key: 'qa_cleared' },
    { label: 'Status',     key: 'status' },
    { label: 'Enriched',   key: 'enriched' },
    { label: 'Product No', key: 'product_no' },
];

function WMSVehicles({ vehicles, transfers, isAdmin, onReverse }: any) {
    const [search, setSearch]               = useState('');
    const [selected, setSelected]           = useState<Set<string>>(new Set());
    const [showQuery, setShowQuery]         = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [conditions, setConditions]       = useState<QueryCondition[]>([defaultCondition()]);
    const [activeFilters, setActiveFilters] = useState<QueryCondition[]>([]);

    const canReverse = (v: any) => v.status !== 'SHIPPED' && v.current_location !== 'L1';

    // Filter pipeline
    const searchFiltered = vehicles.filter((v: any) => {
        if (!search.trim()) return true;
        const s = search.toLowerCase();
        return [v.vin, v.current_location, v.status, v.product_no, v.engine_no]
            .some(f => String(f ?? '').toLowerCase().includes(s));
    });

    // Map to flat keys for query builder
    const mapped = searchFiltered.map((v: any) => ({
        ...v,
        qa_cleared: v.qa_cleared ? 'true' : 'false',
        enriched:   v.enriched   ? 'true' : 'false',
    }));
    const filtered = activeFilters.length && activeFilters.some(c => c.column && c.value)
        ? applyConditions(mapped, activeFilters).map(r => vehicles.find((v: any) => v.id === r.id) ?? r)
        : searchFiltered;

    const allSelected = filtered.length > 0 && filtered.every((v: any) => selected.has(v.id));
    const toggleAll = () => {
        if (allSelected) setSelected(new Set());
        else setSelected(new Set(filtered.map((v: any) => v.id)));
    };
    const toggleOne = (id: string) => {
        const s = new Set(selected);
        s.has(id) ? s.delete(id) : s.add(id);
        setSelected(s);
    };

    const handleApply = () => { setActiveFilters([...conditions]); setShowQuery(false); };
    const handleReset = () => { setConditions([defaultCondition()]); setActiveFilters([]); };

    const handleCSV = () => {
        const toExport = selected.size > 0
            ? filtered.filter((v: any) => selected.has(v.id))
            : filtered;
        const rows = toExport.map((v: any) => ({
            VIN: v.vin ?? '',
            'Product No': v.product_no ?? '',
            'Engine No': v.engine_no ?? '',
            Ubicación: v.current_location ?? '',
            QA: v.qa_cleared ? 'Autorizado' : 'Pendiente',
            Status: v.status ?? '',
            Enriched: v.enriched ? 'Sí' : 'No',
        }));
        const date = new Date().toISOString().slice(0, 10);
        exportCSV(rows, `wms_vehicles_${date}.csv`);
    };

    const hasFilters = search.trim() || (activeFilters.some(c => c.column && c.value));

    const handleDeleteSelected = async () => {
        if (!selected.size || deleteLoading) return;
        setDeleteLoading(true);
        try {
            for (const vehicleId of Array.from(selected)) {
                const vehicle = vehicles.find((v: any) => v.id === vehicleId);
                const vin = vehicle?.vin || vehicleId;

                // 1. Delete vehicle record
                await deleteDoc(doc(db, 'wms_vehicles', vehicleId));

                // 2. Cascade: delete related transfers using in-memory list (no extra query needed)
                const relatedTransfers = (transfers || []).filter((t: any) => t.vin === vin);
                for (const t of relatedTransfers) {
                    await deleteDoc(doc(db, 'wms_transfers', t.id));
                }
            }
            setSelected(new Set());
            setShowDeleteModal(false);
        } catch (e: any) {
            console.error('Error eliminando VINs:', e);
        } finally {
            setDeleteLoading(false);
        }
    };

    return (
        <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-3">
                {/* Search */}
                <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 flex-1 min-w-48">
                    <Search size={15} className="text-slate-400 shrink-0" />
                    <input
                        type="text" value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar VIN, modelo, status..."
                        className="bg-transparent text-white text-sm outline-none w-full placeholder-slate-500"
                    />
                    {search && (
                        <button onClick={() => setSearch('')} className="text-slate-400 hover:text-white">
                            <X size={14} />
                        </button>
                    )}
                </div>

                {/* Query Builder */}
                <button onClick={() => setShowQuery(true)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition border ${
                        activeFilters.some(c => c.column && c.value)
                            ? 'bg-indigo-600 border-indigo-500 text-white'
                            : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                    }`}>
                    <Filter size={15} /> Advanced Query
                    {activeFilters.some(c => c.column && c.value) && (
                        <span className="bg-white text-indigo-600 text-xs font-bold px-1.5 py-0.5 rounded-full">
                            {activeFilters.filter(c => c.column && c.value).length}
                        </span>
                    )}
                </button>

                {/* Clear filters */}
                {hasFilters && (
                    <button onClick={() => { setSearch(''); handleReset(); }}
                        className="flex items-center gap-1 px-3 py-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 text-sm font-semibold border border-red-500/30 transition">
                        <X size={14} /> Clear
                    </button>
                )}

                {/* CSV */}
                <button onClick={handleCSV}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition">
                    <Download size={15} /> CSV
                    {selected.size > 0 && <span className="bg-white text-emerald-700 text-xs font-bold px-1.5 py-0.5 rounded-full">{selected.size}</span>}
                </button>

                {/* Delete — Admin only, visible cuando hay selección */}
                {isAdmin && selected.size > 0 && (
                    <button onClick={() => setShowDeleteModal(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-bold transition">
                        <Trash2 size={15} /> Eliminar ({selected.size})
                    </button>
                )}
            </div>

            {/* Modal de confirmación de eliminación */}
            {showDeleteModal && (
                <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-800 border border-slate-600 rounded-2xl p-8 w-full max-w-md shadow-2xl">
                        <div className="flex items-center gap-3 mb-4">
                            <Trash2 className="text-red-400" size={26} />
                            <h3 className="text-xl font-bold text-white">Confirmar Eliminación</h3>
                        </div>
                        <p className="text-slate-300 text-sm mb-3">Se eliminarán los siguientes registros de vehículos:</p>
                        <div className="bg-slate-900 rounded-lg px-4 py-3 mb-4 max-h-40 overflow-y-auto">
                            {Array.from(selected).map(id => {
                                const v = vehicles.find((v: any) => v.id === id);
                                const vin = v?.vin || id;
                                const txCount = (transfers || []).filter((t: any) => t.vin === vin).length;
                                return (
                                    <div key={id} className="font-mono text-blue-400 text-sm py-0.5 flex justify-between">
                                        <span>• {vin}</span>
                                        <span className="text-slate-500 text-xs">{txCount} transacción(es)</span>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 mb-6">
                            <p className="text-red-400 text-xs font-semibold">
                                ⚠️ Eliminación en cascada:<br />
                                Se borrará el registro del vehículo <strong>Y todas sus transacciones</strong> en wms_transfers.<br />
                                Esta acción no se puede deshacer.
                            </p>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowDeleteModal(false)}
                                disabled={deleteLoading}
                                className="flex-1 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-semibold transition">
                                Cancelar
                            </button>
                            <button
                                onClick={handleDeleteSelected}
                                disabled={deleteLoading}
                                className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-bold transition flex items-center justify-center gap-2">
                                <Trash2 size={15} />
                                {deleteLoading ? 'Eliminando...' : 'Confirmar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Selection info */}
            {selected.size > 0 && (
                <div className="flex items-center gap-3 text-sm text-slate-300 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2">
                    <span className="font-semibold text-white">{selected.size} seleccionados</span>
                    <button onClick={() => setSelected(new Set())} className="text-slate-400 hover:text-white transition text-xs">
                        Deseleccionar todos
                    </button>
                </div>
            )}

            {/* Stats */}
            <div className="text-xs text-slate-500">
                Mostrando <span className="text-slate-300 font-semibold">{filtered.length}</span> de <span className="text-slate-300 font-semibold">{vehicles.length}</span> vehículos
            </div>

            {/* Table */}
            <div className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-900 text-slate-400">
                        <tr>
                            <th className="p-4 w-10">
                                <input type="checkbox" checked={allSelected} onChange={toggleAll}
                                    className="w-4 h-4 rounded accent-indigo-500 cursor-pointer" />
                            </th>
                            <th className="p-4">VIN</th>
                            <th className="p-4">Enriched</th>
                            <th className="p-4">Ubicación</th>
                            <th className="p-4">QA</th>
                            <th className="p-4">Status</th>
                            {isAdmin && <th className="p-4">Admin</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 ? (
                            <tr><td colSpan={isAdmin ? 7 : 6} className="p-8 text-center text-slate-500 italic">
                                Sin resultados para los filtros aplicados.
                            </td></tr>
                        ) : filtered.map((v: any) => (
                            <tr key={v.id}
                                onClick={() => toggleOne(v.id)}
                                className={`border-t border-slate-700 cursor-pointer transition ${
                                    selected.has(v.id) ? 'bg-indigo-600/10' : 'hover:bg-slate-700/50'
                                }`}>
                                <td className="p-4" onClick={e => e.stopPropagation()}>
                                    <input type="checkbox" checked={selected.has(v.id)} onChange={() => toggleOne(v.id)}
                                        className="w-4 h-4 rounded accent-indigo-500 cursor-pointer" />
                                </td>
                                <td className="p-4 font-mono font-semibold">{v.vin}</td>
                                <td className="p-4">
                                    {v.enriched
                                        ? <span className="text-green-400">✓ {v.product_no}</span>
                                        : <span className="text-yellow-500">Pendiente</span>}
                                </td>
                                <td className="p-4 font-bold">{v.current_location}</td>
                                <td className="p-4">
                                    <span className={`px-2 py-1 rounded text-xs font-bold ${v.qa_cleared ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                                        {v.qa_cleared ? 'Autorizado' : 'Pendiente'}
                                    </span>
                                </td>
                                <td className="p-4">
                                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                                        v.status === 'SHIPPED'  ? 'bg-blue-500/20 text-blue-400'     :
                                        v.status === 'REJECTED' ? 'bg-red-500/20 text-red-400'       :
                                        v.status === 'BLOCKED'  ? 'bg-orange-500/20 text-orange-400' :
                                        'bg-green-500/20 text-green-400'
                                    }`}>{v.status}</span>
                                </td>
                                {isAdmin && (
                                    <td className="p-4" onClick={e => e.stopPropagation()}>
                                        {canReverse(v) && (
                                            <button onClick={() => onReverse(v)}
                                                className="flex items-center gap-1 px-3 py-1 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/40 border border-amber-500/40 text-xs font-bold transition">
                                                <RotateCcw size={12} /> Reversa
                                            </button>
                                        )}
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Query Builder Modal */}
            {showQuery && (
                <WMSQueryBuilderModal
                    columns={VEHICLE_COLUMNS}
                    conditions={conditions}
                    onChange={setConditions}
                    onApply={handleApply}
                    onClose={() => setShowQuery(false)}
                    onReset={handleReset}
                />
            )}
        </div>
    );
}

/* ── Transactions Tab ───────────────────────────────────────────────────────── */
const TRANSACTION_COLUMNS: ColumnDef[] = [
    { label: 'VIN',       key: 'vin' },
    { label: 'Tipo',      key: 'type' },
    { label: 'From',      key: 'from_location' },
    { label: 'To',        key: 'to_location' },
    { label: 'Operador',  key: 'operator_id' },
];

function WMSTransactions({ transfers }: any) {
    const [search, setSearch]               = useState('');
    const [showQuery, setShowQuery]         = useState(false);
    const [conditions, setConditions]       = useState<QueryCondition[]>([defaultCondition()]);
    const [activeFilters, setActiveFilters] = useState<QueryCondition[]>([]);

    const searchFiltered = transfers.filter((t: any) => {
        if (!search.trim()) return true;
        const s = search.toLowerCase();
        return [t.vin, t.operator_id, t.from_location, t.to_location, t.type, t.observations]
            .some(f => String(f ?? '').toLowerCase().includes(s));
    });

    const filtered = activeFilters.some(c => c.column && c.value)
        ? applyConditions(searchFiltered, activeFilters)
        : searchFiltered;

    const handleApply = () => { setActiveFilters([...conditions]); setShowQuery(false); };
    const handleReset = () => { setConditions([defaultCondition()]); setActiveFilters([]); };

    const handleCSV = () => {
        const rows = filtered.map((t: any) => ({
            'Fecha/Hora': t.timestamp ? new Date(t.timestamp).toLocaleString() : '',
            VIN: t.vin ?? '',
            From: t.from_location ?? 'NEW',
            To: t.to_location ?? '',
            Tipo: t.type ?? '',
            Operador: t.operator_id ?? '',
            Observaciones: t.observations ?? '',
        }));
        const date = new Date().toISOString().slice(0, 10);
        exportCSV(rows, `wms_transactions_${date}.csv`);
    };

    const hasFilters = search.trim() || activeFilters.some(c => c.column && c.value);

    return (
        <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 flex-1 min-w-48">
                    <Search size={15} className="text-slate-400 shrink-0" />
                    <input
                        type="text" value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar VIN, operador, acción..."
                        className="bg-transparent text-white text-sm outline-none w-full placeholder-slate-500"
                    />
                    {search && <button onClick={() => setSearch('')} className="text-slate-400 hover:text-white"><X size={14} /></button>}
                </div>

                <button onClick={() => setShowQuery(true)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition border ${
                        activeFilters.some(c => c.column && c.value)
                            ? 'bg-indigo-600 border-indigo-500 text-white'
                            : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                    }`}>
                    <Filter size={15} /> Advanced Query
                    {activeFilters.some(c => c.column && c.value) && (
                        <span className="bg-white text-indigo-600 text-xs font-bold px-1.5 py-0.5 rounded-full">
                            {activeFilters.filter(c => c.column && c.value).length}
                        </span>
                    )}
                </button>

                {hasFilters && (
                    <button onClick={() => { setSearch(''); handleReset(); }}
                        className="flex items-center gap-1 px-3 py-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 text-sm font-semibold border border-red-500/30 transition">
                        <X size={14} /> Clear
                    </button>
                )}

                <button onClick={handleCSV}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition">
                    <Download size={15} /> CSV
                </button>
            </div>

            <div className="text-xs text-slate-500">
                Mostrando <span className="text-slate-300 font-semibold">{filtered.length}</span> de <span className="text-slate-300 font-semibold">{transfers.length}</span> transacciones
            </div>

            {/* Table */}
            <div className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-900 text-slate-400">
                        <tr>
                            <th className="p-4">Date/Time</th>
                            <th className="p-4">VIN</th>
                            <th className="p-4">Acción</th>
                            <th className="p-4">Operador</th>
                            <th className="p-4">Observaciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 ? (
                            <tr><td colSpan={5} className="p-8 text-center text-slate-500 italic">Sin resultados para los filtros aplicados.</td></tr>
                        ) : filtered.map((t: any) => (
                            <tr key={t.id} className={`border-t border-slate-700 hover:bg-slate-700/50 ${t.type === 'REVERSAL' ? 'bg-amber-500/5' : ''}`}>
                                <td className="p-4 text-slate-400 whitespace-nowrap">{t.timestamp ? new Date(t.timestamp).toLocaleString() : '-'}</td>
                                <td className="p-4 font-mono text-blue-400">{t.vin}</td>
                                <td className="p-4">
                                    <span className="bg-slate-700 px-2 py-1 rounded text-xs">{t.from_location || 'NEW'}</span>
                                    {' → '}
                                    <span className={`px-2 py-1 rounded text-xs text-white ${t.type === 'REVERSAL' ? 'bg-amber-600' : 'bg-blue-600'}`}>{t.to_location}</span>
                                    {t.type === 'REVERSAL' && <span className="ml-2 text-amber-400 text-xs font-bold">↩ REVERSA</span>}
                                </td>
                                <td className="p-4">{t.operator_id}</td>
                                <td className="p-4 italic text-slate-400 max-w-xs truncate">{t.observations || '-'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {showQuery && (
                <WMSQueryBuilderModal
                    columns={TRANSACTION_COLUMNS}
                    conditions={conditions}
                    onChange={setConditions}
                    onApply={handleApply}
                    onClose={() => setShowQuery(false)}
                    onReset={handleReset}
                />
            )}
        </div>
    );
}

/* ── Locations Tab ──────────────────────────────────────────────────────────── */
function WMSLocations({ vehicles }: any) {
    return (
        <div className="space-y-8">
            {['L1','L2','L3'].map(loc => {
                const units = vehicles.filter((v:any) => v.current_location === loc && v.status !== 'SHIPPED');
                return (
                    <div key={loc} className="bg-slate-800 rounded-xl p-6 border border-slate-700">
                        <div className="flex justify-between items-center mb-4 border-b border-slate-700 pb-2">
                            <h3 className="text-xl font-bold">{loc}</h3>
                            <span className="bg-blue-600 px-3 py-1 rounded-full text-sm font-bold">{units.length} Units</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {units.map((v:any) => (
                                <div key={v.id} className="bg-slate-900 px-3 py-2 rounded-lg border border-slate-700 font-mono text-sm flex flex-col">
                                    <span className={v.status === 'BLOCKED' ? 'text-red-400' : 'text-slate-300'}>{v.vin}</span>
                                    <span className="text-[10px] text-slate-500 mt-1">
                                        In since: {v[`entered_${loc}_at`] ? new Date(v[`entered_${loc}_at`]).toLocaleTimeString() : '-'}
                                    </span>
                                </div>
                            ))}
                            {units.length === 0 && <span className="text-slate-500 italic">Empty</span>}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

/* ── Enrichment Tab ─────────────────────────────────────────────────────────── */
function WMSEnrichment({ vehicles }: any) {
    const pending = vehicles.filter((v:any) => !v.enriched);
    return (
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
            <h3 className="text-xl font-bold mb-4 text-yellow-400">Pending Enrichment ({pending.length})</h3>
            <p className="text-slate-400 mb-6 text-sm">
                En una implementación completa, puedes hacer doble clic en las celdas para editar en línea o pegar datos de Excel para actualización masiva.
            </p>
            <div className="overflow-hidden border border-slate-700 rounded-lg">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-900 text-slate-400">
                        <tr>
                            <th className="p-4">VIN</th><th className="p-4">Product No</th>
                            <th className="p-4">Engine No</th><th className="p-4">Color</th>
                            <th className="p-4">Acción</th>
                        </tr>
                    </thead>
                    <tbody>
                        {pending.map((v:any) => (
                            <tr key={v.id} className="border-t border-slate-700 hover:bg-slate-700/50">
                                <td className="p-4 font-mono">{v.vin}</td>
                                <td className="p-4"><input className="bg-slate-900 border border-slate-600 rounded px-2 py-1 w-full" placeholder="Ingresar..." /></td>
                                <td className="p-4"><input className="bg-slate-900 border border-slate-600 rounded px-2 py-1 w-full" placeholder="Ingresar..." /></td>
                                <td className="p-4"><input className="bg-slate-900 border border-slate-600 rounded px-2 py-1 w-full" placeholder="Ingresar..." /></td>
                                <td className="p-4"><button className="bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded font-bold">Guardar</button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
