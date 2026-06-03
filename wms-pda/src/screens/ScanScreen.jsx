import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getUnit, registerUnit, transferUnit, authorizeQA } from '../api.js';
import { ArrowRight, ChevronLeft, Check, AlertTriangle } from 'lucide-react';

export default function ScanScreen() {
    const navigate = useNavigate();
    const routeLocation = useLocation();
    const user = JSON.parse(sessionStorage.getItem('wms_user') || '{}');
    const activeLocation = routeLocation.state?.scanLocation || user.location || 'L1';
    const [barcode, setBarcode] = useState('');
    const [vehicle, setVehicle] = useState(null);
    const [loading, setLoading] = useState(false);
    const [flash, setFlash] = useState(null); // { type: 'success' | 'error', message: '' }
    const [reentryAlert, setReentryAlert] = useState(null);
    const [observations, setObservations] = useState('');
    const inputRef = useRef(null);

    // Auto-focus input continuously unless user is typing observations
    useEffect(() => {
        const interval = setInterval(() => {
            if (!flash && !vehicle && document.activeElement?.id !== 'obs-input') {
                inputRef.current?.focus();
            }
        }, 500);
        return () => clearInterval(interval);
    }, [flash, vehicle]);

    const showFlash = (type, message, timeout = 2000) => {
        if (type === 'error') {
            alert(message.replace(/\n/g, ' '));
            return;
        }
        
        setFlash({ type, message });
        setTimeout(() => {
            setFlash(null);
            if (type === 'success') {
                setVehicle(null);
                setBarcode('');
                inputRef.current?.focus();
            }
        }, timeout);
    };

    const handleScan = async (e) => {
        e.preventDefault();
        const vin = barcode.trim().toUpperCase();
        if (!vin) return;

        setLoading(true);
        try {
            const data = await getUnit(vin);
            
            if (data.vehicle.status === 'REJECTED') {
                const rejectedFrom = data.lastTransfer?.from_location || 'L1';
                const allowedReentryLocation = rejectedFrom === 'L3' ? 'L2' : 'L1';

                if (activeLocation === allowedReentryLocation || activeLocation === 'ALL') {
                    const reason = data.lastTransfer?.observations || 'Sin observación';
                    setReentryAlert({ vin, reason, allowedReentryLocation });
                    return;
                } else {
                    showFlash('error', `REJECTED VEHICLE\nMust re-enter through ${allowedReentryLocation}`, 3500);
                    return;
                }
            }

            // Unit exists normally
            setVehicle(data.vehicle);
        } catch (err) {
            if (err.response?.status === 404) {
                // Unit not found - Registration Flow
                if (activeLocation === 'L1' || activeLocation === 'ALL') {
                    try {
                        await registerUnit(vin, user.user_id, 'L1');
                        showFlash('success', `REGISTERED ✓\n${vin}`);
                    } catch (regErr) {
                        showFlash('error', regErr.response?.data?.error || 'Registration Failed', 3000);
                    }
                } else {
                    showFlash('error', `VIN NOT REGISTERED\nMust enter through L1 first`, 3500);
                }
            } else {
                showFlash('error', err.response?.data?.error || 'API Error', 3000);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleTransfer = async () => {
        setLoading(true);
        try {
            const data = await transferUnit(vehicle.vin, user.user_id, observations, activeLocation);
            showFlash('success', `TRANSFERRED ✓\n${vehicle.current_location} → ${data.vehicle.current_location}`);
        } catch (err) {
            showFlash('error', err.response?.data?.error || 'Transfer Failed', 4000);
        } finally {
            setLoading(false);
        }
    };

    const handleAuthorize = async (is_approved, action = is_approved ? 'APPROVE' : 'REJECT') => {
        let finalObservations = observations;
        
        if (!is_approved && !finalObservations.trim()) {
            const reason = window.prompt("OBSERVACIÓN OBLIGATORIA:\nPor favor, escriba el motivo:");
            if (!reason || !reason.trim()) {
                showFlash('error', 'ACCIÓN CANCELADA\nDebe proporcionar un motivo.', 3000);
                return;
            }
            finalObservations = reason.trim();
        }

        setLoading(true);
        try {
            await authorizeQA(vehicle.vin, user.user_id, is_approved, finalObservations, action);
            
            let flashMsg = is_approved ? `APPROVED ✓\nQA CLEARED` : `REJECTED\nREMOVED FROM PROCESS`;
            if (action === 'RETURN') flashMsg = `RETURNED ✓\nSENT TO PREVIOUS STATION`;
            
            showFlash(action === 'REJECT' ? 'error' : 'success', flashMsg, 3000);
        } catch (err) {
            showFlash('error', err.response?.data?.error || 'Authorization Failed', 4000);
        } finally {
            setLoading(false);
        }
    };

    // Rendering Flash overlay (Only used for success now)
    if (flash && flash.type === 'success') {
        return (
            <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 bg-green-600">
                <div className="bg-white/20 p-8 rounded-full mb-8">
                    <Check size={80} className="text-white" />
                </div>
                <div className="text-white text-4xl font-black text-center whitespace-pre-line leading-tight">
                    {flash.message}
                </div>
            </div>
        );
    }

    // Rendering Re-entry Alert Modal
    if (reentryAlert) {
        return (
            <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
                <div className="bg-[#1a1a2e] border-2 border-amber-500 p-8 rounded-3xl max-w-md w-full shadow-2xl flex flex-col items-center text-center">
                    <AlertTriangle size={64} className="text-amber-500 mb-4" />
                    <h2 className="text-2xl font-black text-white mb-2">VEHÍCULO RECHAZADO</h2>
                    <p className="text-slate-400 mb-6 text-sm leading-snug">Este vehículo fue previamente retirado por Calidad.</p>
                    
                    <div className="bg-slate-800/80 p-5 rounded-2xl w-full mb-8 border border-slate-700 shadow-inner">
                        <div className="text-xs text-amber-500 font-bold mb-2 tracking-wider">MOTIVO DEL RECHAZO:</div>
                        <div className="text-white text-xl font-bold leading-relaxed">"{reentryAlert.reason}"</div>
                    </div>

                    <button 
                        onClick={async () => {
                            setLoading(true);
                            try {
                                const regData = await registerUnit(reentryAlert.vin, user.user_id, reentryAlert.allowedReentryLocation);
                                setVehicle(regData.vehicle);
                                setReentryAlert(null);
                                showFlash('success', `RE-ENTERED ✓\n${reentryAlert.vin}`);
                            } catch (regErr) {
                                showFlash('error', regErr.response?.data?.error || 'Re-entry Failed', 3000);
                                setReentryAlert(null);
                            } finally {
                                setLoading(false);
                            }
                        }}
                        disabled={loading}
                        className="w-full bg-amber-600 hover:bg-amber-500 active:bg-amber-700 disabled:bg-slate-700 text-white font-black text-xl py-5 rounded-xl shadow-[0_0_15px_rgba(217,119,6,0.5)] transition-all"
                    >
                        {loading ? 'PROCESANDO...' : 'ENTERADO'}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-screen bg-[#1a1a2e]">
            {/* Header */}
            <div className="bg-slate-800 p-3 shadow-md flex items-center gap-3">
                <button onClick={() => navigate('/home')} className="p-3 bg-slate-700 rounded-lg text-white">
                    <ChevronLeft size={28} />
                </button>
                <div className="flex-1">
                    <div className="text-sm text-slate-400 font-bold uppercase">SCAN MODE</div>
                    <div className="text-lg font-bold text-white">{activeLocation}</div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 p-4 flex flex-col">
                
                {/* Barcode Input Form */}
                {!vehicle && (
                    <form onSubmit={handleScan} className="flex flex-col items-center justify-center flex-1">
                        <div className="text-center mb-6">
                            <AlertTriangle size={48} className="mx-auto text-yellow-500 mb-2" />
                            <h2 className="text-2xl font-bold text-slate-300">AWAITING SCAN</h2>
                        </div>
                        <input
                            ref={inputRef}
                            type="text"
                            value={barcode}
                            onChange={(e) => setBarcode(e.target.value)}
                            placeholder="SCAN BARCODE..."
                            className="w-full bg-slate-900 border-4 border-blue-500 text-white text-3xl p-6 rounded-2xl text-center outline-none uppercase font-mono shadow-[0_0_20px_rgba(59,130,246,0.3)] placeholder-slate-600 focus:border-blue-400"
                            autoFocus
                            disabled={loading}
                            autoComplete="off"
                        />
                        <button type="submit" className="hidden">Submit</button>
                    </form>
                )}

                {/* Vehicle Card & Transfer Form */}
                {vehicle && (
                    <div className="flex-1 flex flex-col gap-4">
                        <div className="bg-slate-800 rounded-xl p-5 shadow-lg border-2 border-slate-700">
                            <div className="text-sm text-slate-400 font-bold mb-1">VIN</div>
                            <div className="text-3xl font-mono font-black text-white mb-4 break-all leading-tight">{vehicle.vin}</div>
                            
                            <div className="grid grid-cols-2 gap-4 mb-5">
                                <div>
                                    <div className="text-xs text-slate-400 font-bold">PRODUCT NO.</div>
                                    <div className="text-lg font-bold text-slate-200">{vehicle.product_no || 'Pending'}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-slate-400 font-bold">ENGINE NO.</div>
                                    <div className="text-lg font-bold text-slate-200">{vehicle.engine_no || 'Pending'}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-slate-400 font-bold">COLOR</div>
                                    <div className="text-lg font-bold text-slate-200">{vehicle.color || 'Pending'}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-slate-400 font-bold">STATUS</div>
                                    <div className={`text-lg font-black ${vehicle.status === 'REJECTED' ? 'text-red-500' : 'text-blue-400'}`}>{vehicle.status}</div>
                                </div>
                            </div>

                            <div className="bg-slate-900 rounded-lg p-4 flex items-center justify-between">
                                <div className="flex flex-col items-center">
                                    <span className="text-xs text-slate-400 font-bold mb-1">CURRENT</span>
                                    <span className="bg-slate-700 text-white px-3 py-1 rounded font-black text-xl">{vehicle.current_location}</span>
                                </div>
                                <ArrowRight size={32} className="text-blue-500 animate-pulse" />
                                <div className="flex flex-col items-center">
                                    <span className="text-xs text-blue-400 font-bold mb-1">NEXT</span>
                                    <span className="bg-blue-600 text-white px-3 py-1 rounded font-black text-xl shadow-[0_0_15px_rgba(37,99,235,0.5)]">
                                        {vehicle.current_location === 'L1' ? 'L2' : vehicle.current_location === 'L2' ? 'L3' : 'SHIPPED'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <textarea
                            id="obs-input"
                            value={observations}
                            onChange={(e) => setObservations(e.target.value)}
                            placeholder="Add observations (optional)..."
                            className="w-full bg-slate-800 text-white text-lg p-4 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 resize-none h-24 placeholder-slate-500"
                        />

                        <div className="mt-auto flex flex-wrap gap-3">
                            <button 
                                onClick={() => { setVehicle(null); setBarcode(''); }}
                                className="flex-1 min-w-[100px] bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-white font-bold text-lg py-5 rounded-xl"
                            >
                                CANCEL
                            </button>
                            {activeLocation === 'QA' ? (
                                <>
                                    <button 
                                        onClick={() => handleAuthorize(false, 'REJECT')}
                                        disabled={loading}
                                        className="flex-1 min-w-[90px] bg-red-600 hover:bg-red-500 active:bg-red-700 disabled:bg-slate-700 disabled:text-slate-500 text-white font-black text-sm py-5 rounded-xl shadow-lg"
                                    >
                                        REJECT
                                    </button>
                                    
                                    {vehicle.current_location !== 'L1' && (
                                        <button 
                                            onClick={() => handleAuthorize(false, 'RETURN')}
                                            disabled={loading}
                                            className="flex-[1.2] min-w-[100px] bg-yellow-500 hover:bg-yellow-400 active:bg-yellow-600 disabled:bg-slate-700 disabled:text-slate-500 text-slate-900 font-black text-sm py-5 rounded-xl shadow-lg"
                                        >
                                            RETURN TO
                                        </button>
                                    )}

                                    <button 
                                        onClick={() => handleAuthorize(true, 'APPROVE')}
                                        disabled={loading}
                                        className="flex-[1.5] min-w-[110px] bg-green-600 hover:bg-green-500 active:bg-green-700 disabled:bg-slate-700 disabled:text-slate-500 text-white font-black text-sm py-5 rounded-xl shadow-lg"
                                    >
                                        APPROVE
                                    </button>
                                </>
                            ) : (
                                <button 
                                    onClick={handleTransfer}
                                    disabled={loading || vehicle.status === 'REJECTED' || vehicle.qa_cleared !== true}
                                    className="flex-[2] min-w-[150px] bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-500 text-white font-black text-xl py-5 rounded-xl shadow-lg flex flex-col items-center justify-center gap-1"
                                >
                                    <span>TRANSFER</span>
                                    {vehicle.qa_cleared !== true && vehicle.status !== 'REJECTED' && (
                                        <span className="text-[10px] font-bold text-amber-300 tracking-wide uppercase">Requires QA Clearance</span>
                                    )}
                                </button>
                            )}
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}
