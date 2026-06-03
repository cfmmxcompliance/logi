import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Car, History, Map, FileBarChart, Database, Settings } from 'lucide-react';
import { db } from '../../services/firebaseConfig';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';

export function WMSControl() {
    const [activeTab, setActiveTab] = useState('dashboard');
    const [vehicles, setVehicles] = useState([]);
    const [transfers, setTransfers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubVehicles = onSnapshot(
            collection(db, 'wms_vehicles'),
            (snap) => {
                setVehicles(snap.docs.map(d => ({ id: d.id, ...d.data() })));
                setLoading(false);
            },
            (err) => {
                console.error("Vehicles snapshot error:", err);
                setLoading(false);
            }
        );

        const q = query(collection(db, 'wms_transfers'), orderBy('timestamp', 'desc'));
        const unsubTransfers = onSnapshot(
            q,
            (snap) => {
                setTransfers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            },
            (err) => {
                console.error("Transfers snapshot error:", err);
            }
        );

        return () => {
            unsubVehicles();
            unsubTransfers();
        };
    }, []);

    const tabs = [
        { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
        { id: 'vehicles', label: 'Vehicles', icon: <Car size={20} /> },
        { id: 'transactions', label: 'Transactions', icon: <History size={20} /> },
        { id: 'locations', label: 'Locations', icon: <Map size={20} /> },
        { id: 'reports', label: 'Reports', icon: <FileBarChart size={20} /> },
        { id: 'enrichment', label: 'Enrichment', icon: <Database size={20} /> }
    ];

    if (loading) {
        return <div className="p-8 text-white">Loading WMS Data...</div>;
    }

    return (
        <div className="flex flex-col h-[calc(100vh-4rem)] bg-slate-900 text-white overflow-hidden">
            {/* WMS Top Bar */}
            <div className="bg-slate-800 flex flex-col md:flex-row md:items-center border-b border-slate-700 px-6 py-3 gap-4">
                <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400 shrink-0">
                    WMS Control
                </h2>
                <nav className="flex flex-1 items-center gap-2 overflow-x-auto pb-2 md:pb-0 no-scrollbar">
                    {tabs.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setActiveTab(t.id)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all whitespace-nowrap ${
                                activeTab === t.id 
                                    ? 'bg-blue-600 text-white font-semibold shadow-md' 
                                    : 'text-slate-400 hover:bg-slate-700 hover:text-white'
                            }`}
                        >
                            {t.icon}
                            <span className="hidden sm:inline">{t.label}</span>
                        </button>
                    ))}
                </nav>
            </div>

            {/* WMS Content Area */}
            <div className="flex-1 p-8 overflow-y-auto">
                {activeTab === 'dashboard' && <WMSDashboard vehicles={vehicles} transfers={transfers} />}
                {activeTab === 'vehicles' && <WMSVehicles vehicles={vehicles} />}
                {activeTab === 'transactions' && <WMSTransactions transfers={transfers} />}
                {activeTab === 'locations' && <WMSLocations vehicles={vehicles} />}
                {activeTab === 'enrichment' && <WMSEnrichment vehicles={vehicles} />}
                {/* Reports is a placeholder for brevity in this initial implementation */}
                {activeTab === 'reports' && (
                    <div className="flex items-center justify-center h-full text-slate-500 font-bold text-2xl">
                        {tabs.find(t => t.id === activeTab)?.label} Module - Coming Soon
                    </div>
                )}
            </div>
        </div>
    );
}

function WMSDashboard({ vehicles, transfers }) {
    const l1Count = vehicles.filter(v => v.current_location === 'L1' && v.status !== 'SHIPPED').length;
    const l2Count = vehicles.filter(v => v.current_location === 'L2' && v.status !== 'SHIPPED').length;
    const l3Count = vehicles.filter(v => v.current_location === 'L3' && v.status !== 'SHIPPED').length;
    const blockedCount = vehicles.filter(v => v.status === 'BLOCKED').length;

    return (
        <div className="space-y-6">
            <h3 className="text-2xl font-bold">Real-time Overview</h3>
            <div className="grid grid-cols-4 gap-4">
                <StatCard title="L1 PREPARACIÓN" value={l1Count} color="blue" />
                <StatCard title="L2 FG" value={l2Count} color="indigo" />
                <StatCard title="L3 EMBARQUE" value={l3Count} color="purple" />
                <StatCard title="BLOCKED" value={blockedCount} color="red" />
            </div>

            <h3 className="text-xl font-bold mt-8 mb-4">Recent Transactions</h3>
            <div className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-900 text-slate-400">
                        <tr>
                            <th className="p-4">Time</th>
                            <th className="p-4">VIN</th>
                            <th className="p-4">Move</th>
                            <th className="p-4">Operator</th>
                        </tr>
                    </thead>
                    <tbody>
                        {transfers.slice(0, 10).map(t => (
                            <tr key={t.id} className="border-t border-slate-700">
                                <td className="p-4">{new Date(t.timestamp).toLocaleTimeString()}</td>
                                <td className="p-4 font-mono text-blue-400">{t.vin}</td>
                                <td className="p-4">
                                    <span className="bg-slate-700 px-2 py-1 rounded">{t.from_location || 'NEW'}</span>
                                    {' → '}
                                    <span className="bg-blue-600 px-2 py-1 rounded text-white">{t.to_location}</span>
                                </td>
                                <td className="p-4">{t.operator_id}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function StatCard({ title, value, color }) {
    const colors = {
        blue: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
        indigo: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
        purple: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
        red: 'bg-red-500/20 text-red-400 border-red-500/30',
    };
    return (
        <div className={`p-6 rounded-2xl border ${colors[color]} flex flex-col items-center justify-center`}>
            <span className="text-sm font-bold opacity-80 mb-2">{title}</span>
            <span className="text-5xl font-black">{value}</span>
        </div>
    );
}

function WMSVehicles({ vehicles }) {
    return (
        <div className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700">
            <table className="w-full text-left text-sm">
                <thead className="bg-slate-900 text-slate-400">
                    <tr>
                        <th className="p-4">VIN</th>
                        <th className="p-4">Model / Enriched</th>
                        <th className="p-4">Location</th>
                        <th className="p-4">Status</th>
                    </tr>
                </thead>
                <tbody>
                    {vehicles.map(v => (
                        <tr key={v.id} className="border-t border-slate-700 hover:bg-slate-700/50">
                            <td className="p-4 font-mono">{v.vin}</td>
                            <td className="p-4">
                                {v.enriched ? (
                                    <span className="text-green-400">Yes ({v.product_no})</span>
                                ) : (
                                    <span className="text-yellow-500">Pending</span>
                                )}
                            </td>
                            <td className="p-4 font-bold">{v.current_location}</td>
                            <td className="p-4">
                                <span className={`px-2 py-1 rounded text-xs font-bold ${v.status === 'BLOCKED' ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
                                    {v.status}
                                </span>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function WMSTransactions({ transfers }) {
    return (
        <div className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700">
            <table className="w-full text-left text-sm">
                <thead className="bg-slate-900 text-slate-400">
                    <tr>
                        <th className="p-4">Date/Time</th>
                        <th className="p-4">VIN</th>
                        <th className="p-4">Action</th>
                        <th className="p-4">Operator</th>
                        <th className="p-4">Observations</th>
                    </tr>
                </thead>
                <tbody>
                    {transfers.map(t => (
                        <tr key={t.id} className="border-t border-slate-700 hover:bg-slate-700/50">
                            <td className="p-4">{new Date(t.timestamp).toLocaleString()}</td>
                            <td className="p-4 font-mono text-blue-400">{t.vin}</td>
                            <td className="p-4">{t.from_location || 'NEW'} → {t.to_location}</td>
                            <td className="p-4">{t.operator_id}</td>
                            <td className="p-4 italic text-slate-400">{t.observations || '-'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function WMSLocations({ vehicles }) {
    const locs = ['L1', 'L2', 'L3'];
    return (
        <div className="space-y-8">
            {locs.map(loc => {
                const units = vehicles.filter(v => v.current_location === loc && v.status !== 'SHIPPED');
                return (
                    <div key={loc} className="bg-slate-800 rounded-xl p-6 border border-slate-700">
                        <div className="flex justify-between items-center mb-4 border-b border-slate-700 pb-2">
                            <h3 className="text-xl font-bold">{loc}</h3>
                            <span className="bg-blue-600 px-3 py-1 rounded-full text-sm font-bold">{units.length} Units</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {units.map(v => (
                                <div key={v.id} className="bg-slate-900 px-3 py-2 rounded-lg border border-slate-700 font-mono text-sm flex flex-col">
                                    <span className={v.status === 'BLOCKED' ? 'text-red-400' : 'text-slate-300'}>{v.vin}</span>
                                    <span className="text-[10px] text-slate-500 mt-1">In since: {new Date(v[`entered_${loc}_at`]).toLocaleTimeString()}</span>
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

function WMSEnrichment({ vehicles }) {
    const pending = vehicles.filter(v => !v.enriched);
    return (
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
            <h3 className="text-xl font-bold mb-4 text-yellow-400">Pending Enrichment ({pending.length})</h3>
            <p className="text-slate-400 mb-6 text-sm">
                In a full implementation, you can double click cells to inline edit or paste Excel data to bulk update Product No., Engine, Color, etc.
            </p>
            <div className="overflow-hidden border border-slate-700 rounded-lg">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-900 text-slate-400">
                        <tr>
                            <th className="p-4">VIN</th>
                            <th className="p-4">Product No</th>
                            <th className="p-4">Engine No</th>
                            <th className="p-4">Color</th>
                            <th className="p-4">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {pending.map(v => (
                            <tr key={v.id} className="border-t border-slate-700 hover:bg-slate-700/50">
                                <td className="p-4 font-mono">{v.vin}</td>
                                <td className="p-4"><input className="bg-slate-900 border border-slate-600 rounded px-2 py-1 w-full" placeholder="Enter..." /></td>
                                <td className="p-4"><input className="bg-slate-900 border border-slate-600 rounded px-2 py-1 w-full" placeholder="Enter..." /></td>
                                <td className="p-4"><input className="bg-slate-900 border border-slate-600 rounded px-2 py-1 w-full" placeholder="Enter..." /></td>
                                <td className="p-4"><button className="bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded font-bold">Save</button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
