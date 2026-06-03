import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUnit } from '../api.js';
import { ChevronLeft, Search, User, Clock, MessageSquare, AlertCircle } from 'lucide-react';

export default function LookupScreen() {
    const navigate = useNavigate();
    const [barcode, setBarcode] = useState('');
    const [data, setData] = useState(null); // { vehicle, lastTransfer }
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const inputRef = useRef(null);

    useEffect(() => {
        if (!data) {
            inputRef.current?.focus();
        }
    }, [data]);

    const handleSearch = async (e) => {
        e?.preventDefault();
        const vin = barcode.trim().toUpperCase();
        if (!vin) return;

        setLoading(true);
        setError('');
        try {
            const result = await getUnit(vin);
            setData(result);
        } catch (err) {
            setError(err.response?.data?.error || 'VIN not found');
            setTimeout(() => setError(''), 3000);
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (isoStr) => {
        if (!isoStr) return 'N/A';
        const d = new Date(isoStr);
        return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="flex flex-col min-h-screen bg-[#1a1a2e]">
            {/* Header */}
            <div className="bg-slate-800 p-3 shadow-md flex items-center gap-3">
                <button onClick={() => navigate('/home')} className="p-3 bg-slate-700 rounded-lg text-white">
                    <ChevronLeft size={28} />
                </button>
                <div className="flex-1">
                    <div className="text-sm text-slate-400 font-bold uppercase">LOOKUP MODE</div>
                    <div className="text-lg font-bold text-white">Search Database</div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 p-4 flex flex-col gap-4">
                
                {/* Search Bar */}
                <form onSubmit={handleSearch} className="flex gap-2">
                    <input
                        ref={inputRef}
                        type="text"
                        value={barcode}
                        onChange={(e) => setBarcode(e.target.value)}
                        placeholder="ENTER VIN..."
                        className="flex-1 bg-slate-900 border-2 border-slate-600 text-white text-xl p-4 rounded-xl outline-none uppercase font-mono placeholder-slate-600 focus:border-blue-500"
                        autoComplete="off"
                    />
                    <button 
                        type="submit" 
                        disabled={loading || !barcode}
                        className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 px-6 rounded-xl flex items-center justify-center text-white"
                    >
                        <Search size={28} />
                    </button>
                </form>

                {error && (
                    <div className="bg-red-900/50 border border-red-500 text-red-400 p-4 rounded-xl flex items-center gap-3 font-bold">
                        <AlertCircle size={24} />
                        {error}
                    </div>
                )}

                {/* Read Only Data Card */}
                {data && data.vehicle && (
                    <div className="flex-1 bg-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-5 overflow-y-auto">
                        
                        <div>
                            <div className="flex justify-between items-start mb-2">
                                <span className="text-sm text-slate-400 font-bold">VIN</span>
                                <span className={`px-2 py-1 text-xs font-black rounded ${data.vehicle.status === 'REJECTED' ? 'bg-red-500/20 text-red-400' : data.vehicle.status === 'SHIPPED' ? 'bg-purple-500/20 text-purple-400' : 'bg-green-500/20 text-green-400'}`}>
                                    {data.vehicle.status}
                                </span>
                            </div>
                            <div className="text-2xl font-mono font-black text-white break-all leading-tight">{data.vehicle.vin}</div>
                        </div>

                        <div className="bg-slate-900 rounded-lg p-4 grid grid-cols-2 gap-y-4 gap-x-2">
                            <div>
                                <div className="text-[10px] text-slate-500 font-bold">PRODUCT NO.</div>
                                <div className="text-base font-bold text-slate-200">{data.vehicle.product_no || 'N/A'}</div>
                            </div>
                            <div>
                                <div className="text-[10px] text-slate-500 font-bold">ENGINE NO.</div>
                                <div className="text-base font-bold text-slate-200">{data.vehicle.engine_no || 'N/A'}</div>
                            </div>
                            <div>
                                <div className="text-[10px] text-slate-500 font-bold">COLOR</div>
                                <div className="text-base font-bold text-slate-200">{data.vehicle.color || 'N/A'}</div>
                            </div>
                            <div>
                                <div className="text-[10px] text-slate-500 font-bold">CURRENT LOC.</div>
                                <div className="text-base font-black text-blue-400">{data.vehicle.current_location}</div>
                            </div>
                            <div className="col-span-2">
                                <div className="text-[10px] text-slate-500 font-bold">PRODUCTION DATE</div>
                                <div className="text-base font-bold text-slate-200">{data.vehicle.production_date || 'N/A'}</div>
                            </div>
                        </div>

                        {data.lastTransfer && (
                            <div>
                                <div className="text-sm text-slate-400 font-bold mb-3 border-b border-slate-700 pb-2">LAST TRANSFER</div>
                                
                                <div className="flex flex-col gap-3">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-slate-700 rounded-lg text-slate-300"><Clock size={16} /></div>
                                        <div>
                                            <div className="text-[10px] text-slate-500 font-bold">TIMESTAMP</div>
                                            <div className="text-sm font-bold text-slate-200">{formatDate(data.lastTransfer.timestamp)}</div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-slate-700 rounded-lg text-slate-300"><User size={16} /></div>
                                        <div>
                                            <div className="text-[10px] text-slate-500 font-bold">OPERATOR ID</div>
                                            <div className="text-sm font-bold text-slate-200">{data.lastTransfer.operator_id}</div>
                                        </div>
                                    </div>

                                    <div className="flex items-start gap-3">
                                        <div className="p-2 bg-slate-700 rounded-lg text-slate-300"><MessageSquare size={16} /></div>
                                        <div className="flex-1">
                                            <div className="text-[10px] text-slate-500 font-bold">OBSERVATIONS</div>
                                            <div className="text-sm text-slate-300 italic bg-slate-900 p-2 rounded mt-1">
                                                {data.lastTransfer.observations || 'No observations'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                        
                    </div>
                )}
            </div>
        </div>
    );
}
