import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, ScanLine, Search } from 'lucide-react';
import { getLocationCount, getDashboardCounts } from '../api.js';
import { useLang } from '../i18n.jsx';

export default function HomeScreen() {
    const navigate = useNavigate();
    const { t, lang, toggleLang } = useLang();
    const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('logimaster_user') || '{}'));
    const [activeTab, setActiveTab] = useState('OVERVIEW');
    const [dashCounts, setDashCounts] = useState({ L1: '-', L2: '-', L3: '-', QA: '-' });
    const [locCount, setLocCount] = useState('...');

    useEffect(() => {
        const fetchAll = async () => {
            try {
                const dashData = await getDashboardCounts();
                setDashCounts({
                    L1: dashData.L1 ?? '-',
                    L2: dashData.L2 ?? '-',
                    L3: dashData.L3 ?? '-',
                    QA: dashData.QA ?? '-'
                });
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
        localStorage.removeItem('logimaster_user');
        navigate('/login');
    };

    const handleTabChange = (tab) => {
        setActiveTab(tab);
        if (tab !== 'OVERVIEW') {
            const updatedUser = { ...user, location: tab };
            localStorage.setItem('logimaster_user', JSON.stringify(updatedUser));
            setUser(updatedUser);
            setLocCount('...');
        }
    };

    const tabsTop    = ['OVERVIEW', 'QA'];
    const tabLabels  = { OVERVIEW: t('tab_overview'), QA: t('tab_qa') };
    const tabsBottom = ['L1', 'L2', 'L3'];

    return (
        <div className="flex flex-col min-h-screen bg-[#1a1a2e]">
            {/* Header */}
            <div className="bg-slate-800 p-4 shadow-md flex justify-between items-center z-10 relative">
                <div>
                    <div className="text-sm text-slate-400 font-bold uppercase">{user.role}</div>
                    <div className="text-xl font-bold text-white">{user.name}</div>
                </div>
                <div className="flex items-center gap-2">
                    {/* Language toggle */}
                    <button
                        onClick={toggleLang}
                        className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-black rounded-lg uppercase tracking-widest transition-colors"
                    >
                        {lang === 'es' ? 'EN' : 'ES'}
                    </button>
                    <button onClick={handleLogout} className="p-2 bg-red-900/50 text-red-400 rounded-full hover:bg-red-800">
                        <LogOut size={24} />
                    </button>
                </div>
            </div>

            {/* Navegación — dos filas */}
            <div className="bg-slate-800/80 border-b border-slate-700 px-2 pt-2 pb-1 flex flex-col gap-1">
                {/* Fila 1: OVERVIEW y QA */}
                <div className="flex gap-2">
                    {tabsTop.map(t_key => (
                        <button
                            key={t_key}
                            onClick={() => handleTabChange(t_key)}
                            className={`flex-1 py-2 px-3 rounded-lg font-bold text-sm transition-all ${
                                activeTab === t_key
                                    ? 'bg-blue-600 text-white shadow-md'
                                    : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                            }`}
                        >
                            {tabLabels[t_key]}
                        </button>
                    ))}
                </div>
                {/* Fila 2: Estaciones L */}
                <div className="flex gap-2">
                    {tabsBottom.map(t_key => (
                        <button
                            key={t_key}
                            onClick={() => handleTabChange(t_key)}
                            className={`flex-1 py-2 px-3 rounded-lg font-bold text-sm transition-all ${
                                activeTab === t_key
                                    ? 'bg-emerald-600 text-white shadow-md'
                                    : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                            }`}
                        >
                            {t_key}
                        </button>
                    ))}
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col p-4 items-center justify-center gap-6 overflow-y-auto">
                {activeTab === 'OVERVIEW' ? (
                    <div className="w-full h-full flex flex-col pt-2 max-w-md mx-auto">
                        <h3 className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-4 text-center">{t('overview_title')}</h3>
                        <div className="grid grid-cols-2 gap-3 mb-4">
                            <StatCard title={t('stat_l1')} value={dashCounts.L1} color="blue" />
                            <StatCard title={t('stat_l2')} value={dashCounts.L2} color="indigo" />
                            <StatCard title={t('stat_l3')} value={dashCounts.L3} color="cyan" />
                        </div>
                        <div className="w-full">
                            <StatCard title={t('stat_qa')} value={dashCounts.QA} color="amber" />
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="flex flex-col items-center mb-4">
                            <div className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">{t('units_in')} {activeTab}</div>
                            <div className="text-5xl font-black text-white">{locCount}</div>
                        </div>

                        <button
                            onClick={() => navigate('/scan', { state: { scanLocation: activeTab } })}
                            className="w-full max-w-xs py-10 bg-[#00c853] hover:bg-[#00e676] active:bg-[#00a844] rounded-3xl shadow-[0_5px_15px_rgba(0,200,83,0.3)] flex flex-col items-center justify-center gap-3 transition-transform active:scale-95"
                        >
                            <ScanLine size={64} className="text-white drop-shadow-md" />
                            <span className="text-3xl font-black text-white drop-shadow-md tracking-wider">{t('btn_scan')}</span>
                        </button>

                        <button
                            onClick={() => navigate('/lookup')}
                            className="w-full max-w-xs bg-slate-700 hover:bg-slate-600 active:bg-slate-500 rounded-xl py-4 flex items-center justify-center gap-3 transition-transform active:scale-95 mb-4"
                        >
                            <Search size={24} className="text-slate-300" />
                            <span className="text-xl font-bold text-slate-300">{t('btn_lookup')}</span>
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}

function StatCard({ title, value, color }) {
    const colors = {
        blue:   'bg-blue-500/20 text-blue-400 border-blue-500/30',
        indigo: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
        cyan:   'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
        amber:  'bg-amber-500/20 text-amber-400 border-amber-500/30',
    };
    return (
        <div className={`p-3 rounded-xl border ${colors[color] || colors.blue} flex flex-col items-center justify-center shadow-md py-6`}>
            <span className="text-[10px] font-bold opacity-80 mb-1 text-center leading-tight uppercase tracking-wide">{title}</span>
            <span className="text-4xl font-black">{value}</span>
        </div>
    );
}
