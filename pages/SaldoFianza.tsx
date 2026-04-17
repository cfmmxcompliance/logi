import React, { useState, useEffect, useRef } from 'react';
import { storageService } from '../services/storageService.ts';
import { FianzaRecord } from '../types/fianza.ts';
import { Upload, DollarSign, Calendar, Search, PlusCircle, CheckCircle2 } from 'lucide-react';
import * as xlsx from 'xlsx';

export const SaldoFianza: React.FC = () => {
    const [records, setRecords] = useState<FianzaRecord[]>([]);
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [isNewRecordModalOpen, setIsNewRecordModalOpen] = useState(false);
    
    // Payment Modal State
    const [selectedPedimentoId, setSelectedPedimentoId] = useState<string>('');
    const [paymentAmount, setPaymentAmount] = useState<number | ''>('');

    // New Record Modal State
    const [newPedi, setNewPedi] = useState('');
    const [newNombre, setNewNombre] = useState('');
    const [newProv, setNewProv] = useState<number | ''>('');
    
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const unsub = storageService.subscribe(() => {
            setRecords(storageService.getFianzas());
        });
        setRecords(storageService.getFianzas());
        return unsub;
    }, []);

    // Sort records chronologically (by creation or generic ID if no strict date)
    // We assume the ID generated has timestamp (e.g., fza_172... ) or we rely on imported array order
    const sortedRecords = [...records].sort((a, b) => {
        // If imported from Excel, they might have specific ordering, but we ensure timestamp order
        const timeA = a.id.split('_')[1] ? parseInt(a.id.split('_')[1]) : 0;
        const timeB = b.id.split('_')[1] ? parseInt(b.id.split('_')[1]) : 0;
        return timeA - timeB;
    });

    const saldoActual = sortedRecords.length > 0 ? sortedRecords[sortedRecords.length - 1].saldoFinal : 0;

    const unpaidRecords = sortedRecords.filter(r => !r.pagado || r.pagado === 0);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = xlsx.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                
                // Read from row 3 (index 2) as header
                const data = xlsx.utils.sheet_to_json<any>(ws, { header: 2 });
                // Note: xlsx converts to array of objects but header 2 means row 2 is the header
                // We need to parse exactly matching the format. The first row in output might be the correct data if header was on index 2.
                // Let's parse securely.
                const json_data = xlsx.utils.sheet_to_json<any>(ws); 
                
                const parsedRecords: Partial<FianzaRecord>[] = [];
                let foundHeaders = false;
                
                for (let i = 0; i < json_data.length; i++) {
                    const row: any = Object.values(json_data[i]);
                    if (!foundHeaders) {
                        // Detect headers manually: Pedimento, Nombre, Provisionado...
                        if (row.includes('Pedimento') || row.includes('Provisionado')) {
                            foundHeaders = true;
                        }
                        continue;
                    }
                    
                    // Parse data row (Assuming exact order: Pedimento, Nombre, Provisionado, Pagado, Saldo Inicial, Saldo Final)
                    if (row.length >= 6) {
                        const rec: Partial<FianzaRecord> = {
                            id: `fza_${Date.now() + i}_${Math.random().toString(36).substring(2,7)}`,
                            pedimento: String(row[0] || ''),
                            nombre: String(row[1] || ''),
                            provisionado: Number(row[2]) || 0,
                            fechaRegistro: new Date().toISOString().split('T')[0], // Defaults to today for imported
                            pagado: Number(row[3]) || 0,
                            saldoInicial: Number(row[4]) || 0,
                            saldoFinal: Number(row[5]) || 0,
                        };
                        
                        // If it has pagado, set fechaPago to today as fallback
                        if (rec.pagado && rec.pagado > 0) {
                            rec.fechaPago = new Date().toISOString().split('T')[0];
                        }
                        
                        if (rec.pedimento) {
                            parsedRecords.push(rec);
                        }
                    }
                }
                
                if (parsedRecords.length > 0) {
                    await storageService.upsertFianzas(parsedRecords);
                    alert(`Importados ${parsedRecords.length} registros exitosamente.`);
                }
            } catch (err) {
                console.error("Error importando Excel:", err);
                alert("Error importando Excel. Verifica el formato.");
            }
        };
        reader.readAsBinaryString(file);
        setIsUploadModalOpen(false);
    };

    const handleRegisterPayment = async () => {
        if (!selectedPedimentoId || !paymentAmount) return;
        
        const record = records.find(r => r.id === selectedPedimentoId);
        if (!record) return;

        const updatedRecord: Partial<FianzaRecord> = {
            id: record.id,
            pagado: Number(paymentAmount),
            fechaPago: new Date().toISOString().split('T')[0] // Fecha del evento (Hoy)
        };

        await storageService.upsertFianzas([updatedRecord]);
        setIsPaymentModalOpen(false);
        setSelectedPedimentoId('');
        setPaymentAmount('');
    };

    const handleCreateNewRecord = async () => {
        if (!newPedi || !newNombre || !newProv) return;
        
        const provAmount = Number(newProv);
        const slInicial = saldoActual; // Takes from the last known actual balance
        const slFinal = slInicial - provAmount;

        const newRecord: Partial<FianzaRecord> = {
            pedimento: newPedi,
            nombre: newNombre,
            provisionado: provAmount,
            fechaRegistro: new Date().toISOString().split('T')[0], // Se llena automáticamente con la fecha en que se registre
            pagado: 0,
            saldoInicial: slInicial,
            saldoFinal: slFinal
        };

        await storageService.upsertFianzas([newRecord]);
        setIsNewRecordModalOpen(false);
        setNewPedi(''); setNewNombre(''); setNewProv('');
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* Header area */}
            <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg">
                        <DollarSign size={24} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Control de Saldo Fianza</h1>
                        <p className="text-sm text-slate-500">Gestión contable y estado de pedimentos provisionados.</p>
                    </div>
                </div>
                <div className="flex gap-3">
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 font-medium"
                    >
                        <Upload size={16} /> Importar Excel Base
                    </button>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileUpload} 
                        accept=".xlsx, .xls" 
                        className="hidden" 
                    />
                    <button 
                        onClick={() => setIsNewRecordModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 shadow-md font-medium"
                    >
                        <PlusCircle size={16} /> Nuevo Pedimento
                    </button>
                    <button 
                        onClick={() => setIsPaymentModalOpen(true)}
                        className="flex items-center gap-2 px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 shadow-lg shadow-emerald-200 font-bold transition-all"
                    >
                        <CheckCircle2 size={18} /> Registrar Pago
                    </button>
                </div>
            </div>

            {/* Top Indicator Widget */}
            <div className="bg-gradient-to-br from-indigo-900 to-slate-900 rounded-3xl p-8 text-white relative overflow-hidden shadow-xl">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
                <div className="relative z-10 flex flex-col items-center text-center">
                    <span className="uppercase tracking-[0.2em] text-indigo-200 font-bold text-xs mb-3">Saldo Actual de Fianza</span>
                    <span className="text-6xl font-black font-mono tracking-tight">
                        ${saldoActual.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <p className="text-indigo-300 mt-4 text-sm max-w-md">
                        Este indicador se actualiza en tiempo real con el dato de la columna saldo final del último pedimento procesado.
                    </p>
                </div>
            </div>

            {/* Main Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                    <h3 className="font-bold text-slate-700">Histórico de Movimientos</h3>
                    <div className="text-xs text-slate-500 font-medium bg-white px-3 py-1.5 rounded-full border border-slate-200">
                        {sortedRecords.length} Registros detectados
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left whitespace-nowrap">
                        <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold sticky top-0 z-10 border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-4">Pedimento</th>
                                <th className="px-6 py-4">Nombre</th>
                                <th className="px-6 py-4 text-right">Provisionado</th>
                                <th className="px-6 py-4 bg-indigo-50/50 text-indigo-700">Fecha de Registro</th>
                                <th className="px-6 py-4 text-right">Pagado</th>
                                <th className="px-6 py-4 bg-emerald-50/50 text-emerald-700">Fecha de Pago</th>
                                <th className="px-6 py-4 text-right">Saldo Inicial</th>
                                <th className="px-6 py-4 text-right">Saldo Final</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {sortedRecords.map((record, idx) => (
                                <tr key={record.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-3 font-mono font-medium text-slate-700">{record.pedimento}</td>
                                    <td className="px-6 py-3">{record.nombre}</td>
                                    <td className="px-6 py-3 text-right font-mono">${record.provisionado.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                    <td className="px-6 py-3 text-indigo-600 font-medium flex items-center gap-2">
                                        {record.fechaRegistro ? <><Calendar size={14} />{record.fechaRegistro}</> : <span className="text-slate-300">-</span>}
                                    </td>
                                    <td className="px-6 py-3 text-right font-mono font-bold text-emerald-600">
                                        {record.pagado > 0 ? `$${record.pagado.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '-'}
                                    </td>
                                    <td className="px-6 py-3 text-emerald-600 font-medium whitespace-nowrap">
                                        {record.fechaPago ? <div className="flex items-center gap-2"><Calendar size={14} />{record.fechaPago}</div> : <span className="text-slate-300">-</span>}
                                    </td>
                                    <td className="px-6 py-3 text-right font-mono text-slate-500">${record.saldoInicial.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                    <td className="px-6 py-3 text-right font-mono font-bold text-slate-800 bg-slate-50/50">${record.saldoFinal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                </tr>
                            ))}
                            {sortedRecords.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="p-12 text-center text-slate-400">
                                        Aún no hay registros. Importa el archivo de Excel base para arrancar.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Payment Modal */}
            {isPaymentModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-slate-100 bg-emerald-50">
                            <h3 className="text-xl font-bold text-emerald-900 flex items-center gap-2">
                                <CheckCircle2 size={24} className="text-emerald-600" />
                                Registrar Pago
                            </h3>
                            <p className="text-sm text-emerald-700/80 mt-1">
                                Selecciona un pedimento sin pagar para asentar su pago. Se llenará automáticamente la fecha de hoy.
                            </p>
                        </div>
                        <div className="p-6 space-y-5">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Pedimento Sin Pagar</label>
                                <select 
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-slate-700 font-medium"
                                    value={selectedPedimentoId}
                                    onChange={(e) => {
                                        setSelectedPedimentoId(e.target.value);
                                        const r = unpaidRecords.find(x => x.id === e.target.value);
                                        if (r) setPaymentAmount(r.provisionado);
                                    }}
                                >
                                    <option value="">-- Seleccionar --</option>
                                    {unpaidRecords.map(r => (
                                        <option key={r.id} value={r.id}>{r.pedimento} - {r.nombre} (Prov: ${r.provisionado})</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Monto Pagado</label>
                                <input 
                                    type="number" 
                                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-slate-800 font-mono font-bold text-lg"
                                    value={paymentAmount}
                                    onChange={(e) => setPaymentAmount(Number(e.target.value))}
                                    placeholder="0.00"
                                />
                            </div>
                        </div>
                        <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                            <button onClick={() => setIsPaymentModalOpen(false)} className="px-5 py-2.5 rounded-xl font-medium text-slate-600 hover:bg-slate-200 transition-colors">Cancelar</button>
                            <button 
                                onClick={handleRegisterPayment} 
                                disabled={!selectedPedimentoId || !paymentAmount}
                                className="px-6 py-2.5 bg-emerald-600 text-white font-bold rounded-xl shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-colors disabled:opacity-50"
                            >
                                Confirmar Pago
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* New Record Modal */}
            {isNewRecordModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-slate-100 bg-slate-800">
                            <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                <PlusCircle size={24} className="text-indigo-400" />
                                Nuevo Registro de Pedimento
                            </h3>
                            <p className="text-sm text-slate-400 mt-1">
                                Captura el nuevo pedimento provisionado. El Saldo Inicial se calculará en automático desde el saldo actual.
                            </p>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Pedimento</label>
                                <input 
                                    type="text" 
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                                    value={newPedi}
                                    onChange={(e) => setNewPedi(e.target.value)}
                                    placeholder="Ej. 26 24 3153 6005834"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Nombre</label>
                                <input 
                                    type="text" 
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                                    value={newNombre}
                                    onChange={(e) => setNewNombre(e.target.value)}
                                    placeholder="Ej. Luis"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Provisionado</label>
                                <input 
                                    type="number" 
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-mono font-bold"
                                    value={newProv}
                                    onChange={(e) => setNewProv(Number(e.target.value))}
                                    placeholder="0.00"
                                />
                            </div>
                            
                            <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 mt-2">
                                <div className="text-xs text-indigo-800 flex justify-between mb-1">
                                    <span>Saldo Inicial Previsto:</span>
                                    <span className="font-mono font-bold">${saldoActual.toLocaleString()}</span>
                                </div>
                                <div className="text-xs text-indigo-900 flex justify-between pt-1 border-t border-indigo-200/50 mt-1">
                                    <span>Saldo Final Resultante:</span>
                                    <span className="font-mono font-black">${(saldoActual - Number(newProv)).toLocaleString()}</span>
                                </div>
                            </div>
                        </div>
                        <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                            <button onClick={() => setIsNewRecordModalOpen(false)} className="px-5 py-2.5 rounded-xl font-medium text-slate-600 hover:bg-slate-200 transition-colors">Cancelar</button>
                            <button 
                                onClick={handleCreateNewRecord} 
                                disabled={!newPedi || !newNombre || !newProv}
                                className="px-6 py-2.5 bg-slate-800 text-white font-bold rounded-xl shadow-lg shadow-slate-300 hover:bg-slate-900 transition-colors disabled:opacity-50"
                            >
                                Registrar y Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
