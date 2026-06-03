import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, ScanLine, Search, LayoutDashboard } from 'lucide-react';
import { getLocationCount, getDashboardCounts } from '../api.js';

export default function HomeScreen() {
    const navigate = useNavigate();
    const [user, setUser] = useState(() => JSON.parse(sessionStorage.getItem('wms_user') || '{}'));
    const [activeTab, setActiveTab] = useState('OVERVIEW'); // OVERVIEW, L1, L2, L3
    
    // Counts state
    const [dashCounts, setDashCounts] = useState({ L1: '-', L2: '-', L3: '-', QA: '-' });
    const [locCount, setLocCount] = useState('...');

    useEffect(() => {
        const fetchAll = async () => {
            try {
                // Always fetch dashboard counts for background freshness
                const dashData = await getDashboardCounts();
                setDashCounts({
                    L1: dashData.L1 ?? '-',
                    L2: dashData.L2 ?? '-',
                    L3: dashData.L3 ?? '-',
                    QA: dashData.QA ?? '-'
                });

                // Fetch specific location count if on a location tab
                if (activeTab !== 'OVERVIEW' && activeTab !== 'ALL') {
                    const locData = await getLocationCount(activeTab);
                    setLocCount(locData.count.toString());
                }
            } catch (err) {
                console.error(err);
                if (activeTab !== 'OVERVIEW') setLocCount('Err');
            }
        };

        fetchAll();
        const interval = setInterval(fetchAll, 5000);
        return () => clearInterval(interval);
    }, [activeTab]);

    const handleLogout = () => {
        sessionStorage.clear();
        navigate('/login');
    };

    const handleTabChange = (tab) => {
        setActiveTab(tab);
        if (tab !== 'OVERVIEW') {
            const updatedUser = { ...user, location: tab };
            sessionStorage.setItem('wms_user', JSON.stringify(updatedUser));
            setUser(updatedUser);
            setLocCount('...');
        }
    };

    const tabs = ['OVERVIEW', 'L1', 'QA', 'L2', 'L3'];

    return (
        <div className="flex flex-col min-h-screen bg-[#1a1a2e]">
            {/* Header */}
            <div className="bg-slate-800 p-4 shadow-md flex justify-between items-center z-10 relative">
                <div>
                    <div className="text-sm text-slate-400 font-bold uppercase">{user.role}</div>
                    <div className="text-xl font-bold text-white">{user.name}</div>
                </div>
                <button onClick={handleLogout} className="p-2 bg-red-900/50 text-red-400 rounded-full hover:bg-red-800">
                    <LogOut size={24} />
                </button>
            </div>

            {/* Top Navigation Tabs */}
            <div className="bg-slate-800/80 border-b border-slate-700 p-2 flex gap-2 overflow-x-auto no-scrollbar">
                {tabs.map(t => (
                    <button
                        key={t}
                        onClick={() => handleTabChange(t)}
                        className={`flex-1 min-w-[80px] py-2 px-3 rounded-lg font-bold text-sm transition-all ${
                            activeTab === t
                                ? 'bg-blue-600 text-white shadow-md'
                                : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                        }`}
                    >
                        {t}
                    </button>
                ))}
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col p-4 items-center justify-center gap-6 overflow-y-auto">
                
                {/* OVERVIEW Dashboard */}
                {activeTab === 'OVERVIEW' ? (
                    <div className="w-full h-full flex flex-col pt-2 max-w-md mx-auto">
                        <h3 className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-4 text-center">Real-time Overview</h3>
                        <div className="grid grid-cols-2 gap-3 mb-4">
                            <StatCard title="L1 PREP" value={dashCounts.L1} color="blue" />
                            <StatCard title="L2 ASSEMBLY" value={dashCounts.L2} color="indigo" />
                            <StatCard title="L3 PACKING" value={dashCounts.L3} color="cyan" />
                        </div>
                        <div className="w-full">
                            <StatCard title="PENDING QA APPROVAL" value={dashCounts.QA} color="amber" />
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Live Counter */}
                        <div className="flex flex-col items-center mb-4">
                            <div className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Units in {activeTab}</div>
                            <div className="text-5xl font-black text-white">{locCount}</div>
                        </div>

                        {/* Primary Action */}
                        <button 
                            onClick={() => navigate('/scan', { state: { scanLocation: activeTab } })}
                            className="w-full max-w-xs py-10 bg-[#00c853] hover:bg-[#00e676] active:bg-[#00a844] rounded-3xl shadow-[0_5px_15px_rgba(0,200,83,0.3)] flex flex-col items-center justify-center gap-3 transition-transform active:scale-95"
                        >
                            <ScanLine size={64} className="text-white drop-shadow-md" />
                            <span className="text-3xl font-black text-white drop-shadow-md tracking-wider">SCAN</span>
                        </button>

                        {/* Secondary Action */}
                        <button 
                            onClick={() => navigate('/lookup')}
                            className="w-full max-w-xs bg-slate-700 hover:bg-slate-600 active:bg-slate-500 rounded-xl py-4 flex items-center justify-center gap-3 transition-transform active:scale-95 mb-4"
                        >
                            <Search size={24} className="text-slate-300" />
                            <span className="text-xl font-bold text-slate-300">LOOKUP</span>
                        </button>
                    </>
                )}

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
        <div className={`p-3 rounded-xl border ${colors[color]} flex flex-col items-center justify-center shadow-md py-6`}>
            <span className="text-[10px] font-bold opacity-80 mb-1 text-center leading-tight uppercase tracking-wide">{title}</span>
            <span className="text-4xl font-black">{value}</span>
        </div>
    );
}
