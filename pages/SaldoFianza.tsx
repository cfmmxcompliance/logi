import React, { useState, useEffect, useRef } from 'react';
import { storageService } from '../services/storageService.ts';
import { authService } from '../services/authService.ts';
import { FianzaRecord, UserRole } from '../types.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { Upload, DollarSign, Calendar, Search, PlusCircle, CheckCircle2, Filter, Download, Trash2, X, Plus, ChevronDown, Lock, FileSpreadsheet, Edit2, Monitor } from 'lucide-react';
import * as xlsx from 'xlsx';

interface QueryCondition {
    id: string;
    column: keyof FianzaRecord;
    operator: string;
    type: 'string' | 'number' | 'boolean';
    input: string;
}

export const SaldoFianza: React.FC = () => {
    const { user } = useAuth();
    const [records, setRecords] = useState<FianzaRecord[]>([]);
    const [editorNames, setEditorNames] = useState<string[]>([]);

    // Modals
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [isNewRecordModalOpen, setIsNewRecordModalOpen] = useState(false);
    const [isQueryBuilderOpen, setIsQueryBuilderOpen] = useState(false);

    // Selection State
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Mass Query State
    const [queryConditions, setQueryConditions] = useState<QueryCondition[]>([]);
    const [activeMassQuery, setActiveMassQuery] = useState<QueryCondition[]>([]);

    // Payment Modal State
    const [selectedPaymentPedimentos, setSelectedPaymentPedimentos] = useState<string[]>([]);
    const [paymentAmount, setPaymentAmount] = useState<number | ''>('');
    const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);

    // New Record Modal State
    const [newPedi, setNewPedi] = useState('');
    const [newNombre, setNewNombre] = useState('');
    const [showNameDropdown, setShowNameDropdown] = useState(false);
    const [newProv, setNewProv] = useState<number | ''>('');
    const [newFechaRegistro, setNewFechaRegistro] = useState<string>(new Date().toISOString().split('T')[0]);
    const [editingRecord, setEditingRecord] = useState<FianzaRecord | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const unsub = storageService.subscribe(() => {
            setRecords(storageService.getFianzas());
        });
        setRecords(storageService.getFianzas());
        
        // Fetch editors and admins
        authService.getUsers().then(users => {
            setEditorNames(users.filter(u => u.role === UserRole.EDITOR || u.role === UserRole.ADMIN).map(u => u.name || u.username));
        }).catch(err => console.warn("Could not fetch users for Fianza", err));

        return unsub;
    }, []);

    // Sort original records chronologically to calculate actual balance accurately
    const BASE_BALANCE = 82032341.66;
    let runningBalance = BASE_BALANCE;

    const sortedRecordsOriginalMap = [...records]
        .sort((a, b) => {
            const timeA = a.id.split('_')[1] ? parseInt(a.id.split('_')[1]) : 0;
            const timeB = b.id.split('_')[1] ? parseInt(b.id.split('_')[1]) : 0;
            return timeA - timeB;
        })
        .map(r => {
            const discountAmount = (r.pagado && r.pagado > 0) ? r.pagado : (r.provisionado || 0);
            const slInicial = runningBalance;
            const slFinal = slInicial - discountAmount;
            runningBalance = slFinal;
            
            return { ...r, saldoInicial: slInicial, saldoFinal: slFinal };
        });

    const saldoActual = sortedRecordsOriginalMap.length > 0 ? sortedRecordsOriginalMap[sortedRecordsOriginalMap.length - 1].saldoFinal : BASE_BALANCE;
    const unpaidRecords = sortedRecordsOriginalMap.filter(r => (!r.pagado || r.pagado === 0) && r.id !== 'fza_0000000_iniciabase');
    const impuestosPagados = sortedRecordsOriginalMap.reduce((acc, r) => acc + (Number(r.pagado) || 0), 0);
    const pendientePago = BASE_BALANCE - saldoActual;

    // Filter application
    const filteredRecords = sortedRecordsOriginalMap.filter(r => {
        if (!activeMassQuery || activeMassQuery.length === 0) return true;

        return activeMassQuery.every(cond => {
            let val = (r[cond.column] ?? '').toString().toLowerCase();
            let target = cond.input.toLowerCase();

            if (cond.type === 'number') {
                const numVal = Number(r[cond.column] || 0);
                const numTarget = Number(cond.input || 0);
                switch (cond.operator) {
                    case '==': return numVal === numTarget;
                    case '!=': return numVal !== numTarget;
                    case '>': return numVal > numTarget;
                    case '>=': return numVal >= numTarget;
                    case '<': return numVal < numTarget;
                    case '<=': return numVal <= numTarget;
                    default: return true;
                }
            }

            switch (cond.operator) {
                case 'in':
                    const targets = target.split('\n').map(t => t.trim()).filter(t => t);
                    return targets.includes(val);
                case '==': return val === target;
                case '!=': return val !== target;
                case 'contains': return val.includes(target);
                case 'not_contains': return !val.includes(target);
                case 'empty': return !val || val === '' || val === '0';
                case 'not_empty': return !!val && val !== '' && val !== '0';
                default: return true;
            }
        });
    });

    // Mass Query Controllers
    const addQueryCondition = () => {
        setQueryConditions([...queryConditions, { id: Math.random().toString(), column: 'pedimento', operator: 'contains', type: 'string', input: '' }]);
    };
    const removeQueryCondition = (id: string) => {
        setQueryConditions(queryConditions.filter(c => c.id !== id));
    };
    const updateQueryCondition = (id: string, updates: Partial<QueryCondition>) => {
        setQueryConditions(queryConditions.map(c => c.id === id ? { ...c, ...updates } : c));
    };
    const applyMassQuery = () => {
        setActiveMassQuery(queryConditions.filter(c => c.operator === 'empty' || c.operator === 'not_empty' || c.input.trim() !== ''));
        setIsQueryBuilderOpen(false);
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedIds(new Set(filteredRecords.filter(r => r.id !== 'fza_0000000_iniciabase').map(r => r.id)));
        } else {
            setSelectedIds(new Set());
        }
    };
    const handleSelectRow = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    // Actions
    const handleDownloadTemplate = () => {
        const headers = [['Pedimento', 'Nombre', 'Provisionado', 'Pagado', 'Saldo Inicial', 'Saldo Final']];
        const dummyData = [['EJEMPLO26018FRN00572', 'Juan Perez', 5000.00, 0, 0, 0]];
        const ws = xlsx.utils.aoa_to_sheet([...headers, ...dummyData]);
        const wb = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(wb, ws, "Plantilla");
        xlsx.writeFile(wb, `Plantilla_Carga_Fianza.xlsx`);
    };

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

                const json_data = xlsx.utils.sheet_to_json<any>(ws);
                const parsedRecords: Partial<FianzaRecord>[] = [];
                let foundHeaders = false;

                for (let i = 0; i < json_data.length; i++) {
                    const row: any = Object.values(json_data[i]);
                    if (!foundHeaders) {
                        if (row.includes('Pedimento') || row.includes('Provisionado')) foundHeaders = true;
                        continue;
                    }

                    if (row.length >= 6) {
                        const rec: Partial<FianzaRecord> = {
                            id: `fza_${Date.now() + i}_${Math.random().toString(36).substring(2, 7)}`,
                            pedimento: String(row[0] || ''),
                            nombre: String(row[1] || ''),
                            provisionado: Number(row[2]) || 0,
                            fechaRegistro: new Date().toISOString().split('T')[0],
                            pagado: Number(row[3]) || 0,
                            saldoInicial: Number(row[4]) || 0,
                            saldoFinal: Number(row[5]) || 0,
                        };

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
    };

    const handleExportCSV = () => {
        const itemsToExport = selectedIds.size > 0
            ? filteredRecords.filter(r => selectedIds.has(r.id))
            : filteredRecords;

        if (itemsToExport.length === 0) return alert("No hay datos para exportar");

        const data = itemsToExport.map(r => ({
            Pedimento: r.pedimento,
            Nombre: r.nombre,
            Provisionado: r.provisionado,
            'Fecha de Registro': r.fechaRegistro || '',
            Pagado: r.pagado,
            'Fecha de Pago': r.fechaPago || '',
            'Saldo Inicial': r.saldoInicial,
            'Saldo Final': r.saldoFinal
        }));

        const ws = xlsx.utils.json_to_sheet(data);
        const wb = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(wb, ws, "SaldoFianza");
        xlsx.writeFile(wb, `SaldoFianza_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const handleDeleteSelected = async () => {
        if (user?.role !== UserRole.ADMIN) return;
        if (!confirm(`¿Estás seguro de que deseas eliminar ${selectedIds.size} registros de fianza? Esto alterará los saldos calculados.`)) return;

        try {
            await storageService.deleteFianzas(Array.from(selectedIds));
            setSelectedIds(new Set());
            alert(`${selectedIds.size} registros eliminados exitosamente.`);
        } catch (e: any) {
            alert(`Error al eliminar: ${e.message}`);
        }
    };

    const handleRegisterPayment = async () => {
        if (selectedPaymentPedimentos.length === 0 || !paymentAmount) return;

        const dateToSave = paymentDate || new Date().toISOString().split('T')[0];
        const updates: Partial<FianzaRecord>[] = [];

        if (selectedPaymentPedimentos.length === 1) {
            updates.push({
                id: selectedPaymentPedimentos[0],
                pagado: Number(paymentAmount),
                fechaPago: dateToSave
            });
        } else {
            selectedPaymentPedimentos.forEach(id => {
                const r = unpaidRecords.find(x => x.id === id);
                if (r) {
                    updates.push({
                        id: r.id,
                        pagado: r.provisionado,
                        fechaPago: dateToSave
                    });
                }
            });
        }

        await storageService.upsertFianzas(updates);
        setIsPaymentModalOpen(false);
        setSelectedPaymentPedimentos([]);
        setPaymentAmount('');
    };

    const handleCreateNewRecord = async () => {
        if (newPedi.trim() === '' || newNombre.trim() === '' || newProv === '') return;

        const provAmount = Number(newProv);
        const slInicial = saldoActual;
        const slFinal = slInicial - provAmount;

        try {
            const newRecord: Partial<FianzaRecord> = {
                id: `fza_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                pedimento: newPedi,
                nombre: newNombre,
                provisionado: provAmount,
                fechaRegistro: newFechaRegistro || new Date().toISOString().split('T')[0],
                pagado: 0,
                saldoInicial: slInicial,
                saldoFinal: slFinal
            };

            await storageService.upsertFianzas([newRecord]);
            setIsNewRecordModalOpen(false);
            setNewPedi(''); setNewNombre(''); setNewProv('');
        } catch (e: any) {
            console.error(e);
            alert(`Error guardando pedimento: ${e.message}`);
        }
    };

    const handleSaveEdit = async () => {
        if (!editingRecord) return;
        try {
            await storageService.upsertFianzas([editingRecord]);
            setEditingRecord(null);
        } catch (e: any) {
            console.error(e);
            alert(`Error guardando edición: ${e.message}`);
        }
    };

    const handleDeleteRow = async (id: string, pedimento: string) => {
        if (confirm(`¿Estás seguro de eliminar el pedimento ${pedimento}? Esta acción no se puede deshacer.`)) {
            try {
                await storageService.deleteFianzas([id]);
                // Remove from local selection if selected
                const newSelectedIds = new Set(selectedIds);
                newSelectedIds.delete(id);
                setSelectedIds(newSelectedIds);
            } catch (e: any) {
                alert(`Error al eliminar: ${e.message}`);
            }
        }
    };

    return (
        <div className="w-full">
            {/* Mobile Block */}
            <div className="block lg:hidden flex-col items-center justify-center p-12 text-center bg-white rounded-3xl border border-slate-200 shadow-sm mx-auto max-w-md mt-[10vh]">
                <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-6 text-indigo-500">
                    <Monitor size={40} />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-3">Solo Versión de Escritorio</h3>
                <p className="text-slate-500 text-sm">
                    El módulo de Saldo Fianza requiere una resolución de pantalla más amplia.
                    Por favor, accede desde una computadora para utilizar estas herramientas.
                </p>
            </div>

            {/* Desktop UI */}
            <div className="hidden lg:block space-y-6 animate-in fade-in duration-300">
            {/* Top Indicator Widget */}
            <div className="bg-gradient-to-br from-indigo-900 to-slate-900 rounded-3xl p-6 md:p-8 text-white relative overflow-hidden shadow-xl">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
                
                <div className="relative z-10 flex flex-col xl:flex-row items-center justify-between gap-8">
                    {/* Left: Metadata */}
                    <div className="flex-1 flex flex-col gap-4 w-full">
                        {/* Fila 1 */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="bg-slate-800/50 p-4 rounded-xl border border-indigo-500/20 backdrop-blur-sm overflow-hidden">
                                <div className="text-[10px] text-indigo-300 font-bold tracking-wider mb-1 truncate">FORMA DE PAGO</div>
                                <div className="text-lg font-mono font-bold">22</div>
                            </div>
                            <div className="bg-slate-800/50 p-4 rounded-xl border border-indigo-500/20 backdrop-blur-sm overflow-hidden lg:col-span-2 xl:col-span-1">
                                <div className="text-[10px] text-indigo-300 font-bold tracking-wider mb-1 truncate">INSTITUCIÓN EMISORA</div>
                                <div className="text-xs md:text-sm font-bold text-slate-100 truncate" title="Dorama Institución de Garantías, S.A.">Dorama Institución de Garantías, S.A.</div>
                            </div>
                            <div className="bg-slate-800/50 p-4 rounded-xl border border-indigo-500/20 backdrop-blur-sm overflow-hidden">
                                <div className="text-[10px] text-indigo-300 font-bold tracking-wider mb-1 truncate">FIANZA</div>
                                <div className="text-sm md:text-base font-mono font-bold truncate">26018FRN00572</div>
                            </div>
                            <div className="bg-slate-800/50 p-4 rounded-xl border border-indigo-500/20 backdrop-blur-sm overflow-hidden">
                                <div className="text-[10px] text-indigo-300 font-bold tracking-wider mb-1 truncate">FECHA AUTORIZACIÓN</div>
                                <div className="text-sm md:text-base font-mono font-bold truncate">23/09/2025</div>
                            </div>
                        </div>

                        {/* Fila 2 */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="bg-slate-800/50 p-4 rounded-xl border border-emerald-500/20 backdrop-blur-sm">
                                <div className="text-[10px] text-emerald-300 font-bold tracking-wider mb-1 truncate">IMPORTE DEL DOCUMENTO</div>
                                <div className="text-base md:text-xl font-mono font-black text-emerald-400">$82,032,341.66</div>
                            </div>
                            <div className="bg-slate-800/50 p-4 rounded-xl border border-orange-500/20 backdrop-blur-sm">
                                <div className="text-[10px] text-orange-300 font-bold tracking-wider mb-1 truncate">IMPUESTOS PAGADOS</div>
                                <div className="text-base md:text-xl font-mono font-bold text-orange-400">${impuestosPagados.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                            </div>
                            <div className="bg-slate-800/50 p-4 rounded-xl border border-yellow-500/20 backdrop-blur-sm">
                                <div className="text-[10px] text-yellow-300 font-bold tracking-wider mb-1 truncate">PENDIENTE DE PAGO</div>
                                <div className="text-base md:text-xl font-mono font-bold text-yellow-400">${pendientePago.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                            </div>
                        </div>
                    </div>

                    {/* Right: Main Balance */}
                    <div className="flex flex-col items-center xl:items-end text-center xl:text-right border-t xl:border-t-0 xl:border-l border-indigo-700/50 pt-8 xl:pt-0 xl:pl-8 w-full xl:w-auto">
                        <span className="uppercase tracking-[0.2em] text-indigo-200 font-bold text-xs mb-3">Saldo Actual de Fianza</span>
                        <span className="text-5xl md:text-6xl font-black font-mono tracking-tight text-white drop-shadow-md">
                            ${saldoActual.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <p className="text-indigo-300 mt-4 text-xs max-w-[280px] xl:max-w-[320px]">
                            Se actualiza en tiempo real con el dato de la columna saldo final del último pedimento procesado.
                        </p>
                    </div>
                </div>
            </div>

            {/* Header area */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-2xl border border-slate-200 shadow-sm gap-4 mb-6">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg">
                        <DollarSign size={24} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Control de Saldo Fianza</h1>
                        <p className="text-sm text-slate-500">Gestión contable y estado de pedimentos provisionados.</p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => {
                            setQueryConditions(activeMassQuery.length > 0 ? activeMassQuery : [{ id: Math.random().toString(), column: 'pedimento', operator: 'contains', type: 'string', input: '' }]);
                            setIsQueryBuilderOpen(true);
                        }}
                        className={`flex items-center gap-2 px-4 py-2 border rounded-lg font-medium transition-colors ${activeMassQuery.length > 0 ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                        <Filter size={16} />
                        {activeMassQuery.length > 0 ? `Filtros Activos (${activeMassQuery.length})` : 'Mass Query'}
                    </button>
                    {activeMassQuery.length > 0 && (
                        <button onClick={() => setActiveMassQuery([])} className="px-3 py-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Limpiar Búsqueda">
                            <X size={16} />
                        </button>
                    )}

                    <button
                        onClick={handleDownloadTemplate}
                        className="flex items-center gap-1.5 px-3 py-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg text-sm transition-colors border border-transparent hover:border-emerald-200 font-medium"
                        title="Descargar Plantilla Excel"
                    >
                        <FileSpreadsheet size={16} /> Plantilla
                    </button>

                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 font-medium shadow-sm transition-all hover:border-slate-300"
                    >
                        <Upload size={16} /> Cargar Datos
                    </button>
                    <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".xlsx, .xls, .csv" className="hidden" />

                    <button
                        onClick={handleExportCSV}
                        className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 font-medium"
                    >
                        <Download size={16} /> Exportar {selectedIds.size > 0 && `(${selectedIds.size})`}
                    </button>

                    <button
                        onClick={() => setIsNewRecordModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 shadow-md font-medium"
                    >
                        <PlusCircle size={16} /> Nuevo
                    </button>
                    <button
                        onClick={() => setIsPaymentModalOpen(true)}
                        className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 shadow-lg shadow-emerald-200 font-bold transition-all"
                    >
                        <CheckCircle2 size={18} /> Pago
                    </button>

                    {user?.role === UserRole.ADMIN && selectedIds.size > 0 && (
                        <button
                            onClick={handleDeleteSelected}
                            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 shadow-md font-medium ml-2 animate-in fade-in"
                        >
                            <Trash2 size={16} /> Borrar {selectedIds.size}
                        </button>
                    )}
                </div>
            </div>

            {/* Main Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                    <h3 className="font-bold text-slate-700">Histórico de Movimientos</h3>
                    <div className="text-xs text-slate-500 font-medium bg-white px-3 py-1.5 rounded-full border border-slate-200">
                        Mostrando {filteredRecords.length} de {records.length}
                    </div>
                </div>
                <div className="overflow-x-auto max-h-[600px]">
                    <table className="w-full text-sm text-left whitespace-nowrap">
                        <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold sticky top-0 z-10 border-b border-slate-200 shadow-sm">
                            <tr>
                                <th className="px-4 py-4 w-10 text-center">
                                    <input
                                        type="checkbox"
                                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                        checked={filteredRecords.length > 0 && selectedIds.size === filteredRecords.length}
                                        onChange={handleSelectAll}
                                    />
                                </th>
                                {user?.role === UserRole.ADMIN && (
                                    <th className="px-6 py-4 text-center">Acciones</th>
                                )}
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
                            {filteredRecords.map((record) => {
                                const isSelected = selectedIds.has(record.id);
                                return (
                                    <tr key={record.id} className={`transition-colors ${isSelected ? 'bg-indigo-50/50' : 'hover:bg-slate-50'}`}>
                                        <td className="px-4 py-3 text-center">
                                            {record.id === 'fza_0000000_iniciabase' ? (
                                                <div className="flex justify-center text-slate-300" title="Registro Base Bloqueado"><Lock size={16} /></div>
                                            ) : (
                                                <input
                                                    type="checkbox"
                                                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                    checked={isSelected}
                                                    onChange={() => handleSelectRow(record.id)}
                                                />
                                            )}
                                        </td>
                                        {user?.role === UserRole.ADMIN && (
                                            <td className="px-6 py-3 text-center">
                                                {record.id !== 'fza_0000000_iniciabase' && (
                                                    <div className="flex items-center justify-center gap-2">
                                                        <button 
                                                            onClick={() => setEditingRecord({...record})} 
                                                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                            title="Editar Fila"
                                                        >
                                                            <Edit2 size={16} />
                                                        </button>
                                                        <button 
                                                            onClick={() => handleDeleteRow(record.id, record.pedimento)} 
                                                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                            title="Eliminar Fila"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        )}
                                        <td className="px-6 py-3 font-mono font-medium text-slate-700">{record.pedimento}</td>
                                        <td className="px-6 py-3">{record.nombre}</td>
                                        <td className="px-6 py-3 text-right font-mono">${record.provisionado.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                        <td className="px-6 py-3 text-indigo-600 font-medium flex items-center gap-2">
                                            {record.fechaRegistro ? <><Calendar size={14} />{record.fechaRegistro}</> : <span className="text-slate-300">-</span>}
                                        </td>
                                        <td className="px-6 py-3 text-right font-mono font-bold text-emerald-600">
                                            {record.pagado > 0 ? `$${record.pagado.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '-'}
                                        </td>
                                        <td className="px-6 py-3 text-emerald-600 font-medium">
                                            {record.fechaPago ? <div className="flex items-center gap-2"><Calendar size={14} />{record.fechaPago}</div> : <span className="text-slate-300">-</span>}
                                        </td>
                                        <td className="px-6 py-3 text-right font-mono text-slate-500">${record.saldoInicial.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                        <td className="px-6 py-3 text-right font-mono font-bold text-slate-800 bg-slate-50/50">${record.saldoFinal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                    </tr>
                                );
                            })}
                            {filteredRecords.length === 0 && (
                                <tr>
                                    <td colSpan={user?.role === UserRole.ADMIN ? 10 : 9} className="p-12 text-center text-slate-400">
                                        No se encontraron registros que coincidan con la búsqueda.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Mass Query Modal */}
            {isQueryBuilderOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
                        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-3xl">
                            <div>
                                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                    <Filter size={20} className="text-indigo-600" /> Advanced Query Builder
                                </h3>
                                <p className="text-sm text-slate-500 mt-1">Configura múltiples condiciones para filtrar los pedimentos de Fianza.</p>
                            </div>
                            <button onClick={() => setIsQueryBuilderOpen(false)} className="text-slate-400 hover:text-slate-600 hover:bg-slate-200 p-2 rounded-full transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1 bg-white space-y-4">
                            {queryConditions.map((cond, index) => (
                                <div key={cond.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200 relative group animate-in slide-in-from-top-2 duration-200">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold">{index + 1}</div>
                                        <div className="h-px flex-1 bg-slate-200"></div>
                                        {queryConditions.length > 1 && (
                                            <button onClick={() => removeQueryCondition(cond.id)} className="text-slate-400 hover:text-red-500 transition-colors">
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Column</label>
                                            <select className="w-full border border-slate-300 rounded-lg p-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500"
                                                value={cond.column} onChange={(e) => updateQueryCondition(cond.id, { column: e.target.value as any })}>
                                                <option value="pedimento">Pedimento</option>
                                                <option value="nombre">Nombre</option>
                                                <option value="provisionado">Provisionado</option>
                                                <option value="fechaRegistro">Fecha Registro</option>
                                                <option value="pagado">Pagado</option>
                                                <option value="fechaPago">Fecha Pago</option>
                                                <option value="saldoInicial">Saldo Inicial</option>
                                                <option value="saldoFinal">Saldo Final</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Operator</label>
                                            <select className="w-full border border-slate-300 rounded-lg p-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500"
                                                value={cond.operator} onChange={(e) => updateQueryCondition(cond.id, { operator: e.target.value })}>
                                                <option value="in">(in) in list</option>
                                                <option value="==">(==) equal to</option>
                                                <option value="!=">(!=) not equal to</option>
                                                <option value="contains">contains</option>
                                                <option value="not_contains">not contains</option>
                                                <option value="empty">is empty / null</option>
                                                <option value="not_empty">is NOT empty</option>
                                                <option value=">">( &gt; ) greater than</option>
                                                <option value=">=">( &gt;= ) greater or equal</option>
                                                <option value="<">( &lt; ) less than</option>
                                                <option value="<=">( &lt;= ) less or equal</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Data Type</label>
                                            <select className="w-full border border-slate-300 rounded-lg p-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:bg-slate-50"
                                                value={cond.type} disabled={cond.operator === 'empty' || cond.operator === 'not_empty'}
                                                onChange={(e) => updateQueryCondition(cond.id, { type: e.target.value as any })}>
                                                <option value="string">String (Text/Date)</option>
                                                <option value="number">Number (Amounts)</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                                            {cond.operator === 'empty' || cond.operator === 'not_empty' ? 'Value (Not required)' : cond.operator === 'in' ? 'Values (One per line)' : 'Target Value'}
                                        </label>
                                        <textarea
                                            className="w-full border border-slate-300 rounded-lg p-3 font-mono text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none min-h-[80px]"
                                            disabled={cond.operator === 'empty' || cond.operator === 'not_empty'}
                                            placeholder={cond.operator === 'in' ? "Val 1\nVal 2" : "Enter value..."}
                                            value={cond.operator === 'empty' || cond.operator === 'not_empty' ? '' : cond.input}
                                            onChange={(e) => updateQueryCondition(cond.id, { input: e.target.value })}
                                        />
                                    </div>
                                </div>
                            ))}

                            <button onClick={addQueryCondition} className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 transition-all flex items-center justify-center gap-2 font-medium">
                                <Plus size={18} /> Add Condition
                            </button>
                        </div>

                        <div className="px-6 py-5 border-t border-slate-100 bg-slate-50 rounded-b-3xl flex justify-end gap-3 shrink-0">
                            <button onClick={() => { setQueryConditions([]); setActiveMassQuery([]); setIsQueryBuilderOpen(false); }} className="px-5 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-colors">
                                Clear All
                            </button>
                            <button onClick={applyMassQuery} className="px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-colors flex items-center gap-2">
                                <Search size={18} /> Run Query
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modals from previous implementation remain */}
            {/* Payment Modal */}
            {isPaymentModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-slate-100 bg-emerald-50">
                            <h3 className="text-xl font-bold text-emerald-900 flex items-center gap-2">
                                <CheckCircle2 size={24} className="text-emerald-600" /> Registrar Pago
                            </h3>
                            <p className="text-sm text-emerald-700/80 mt-1">Selecciona un pedimento sin pagar para asentar su pago. Selecciona la fecha de liquidación.</p>
                        </div>
                        <div className="p-6 space-y-5">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Pedimento(s) Sin Pagar</label>
                                <select
                                    multiple
                                    size={6}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-slate-700 font-medium whitespace-break-spaces"
                                    value={selectedPaymentPedimentos}
                                    onChange={(e) => {
                                        const options = Array.from(e.target.selectedOptions, option => option.value);
                                        setSelectedPaymentPedimentos(options);
                                        
                                        let sum = 0;
                                        options.forEach(id => {
                                            const r = unpaidRecords.find(x => x.id === id);
                                            if (r) sum += (r.provisionado || 0);
                                        });
                                        setPaymentAmount(sum);
                                    }}
                                >
                                    {unpaidRecords.map(r => (
                                        <option key={r.id} value={r.id} className="py-2 px-2 border-b border-white/50">{r.pedimento} - {r.nombre} (Prov: ${r.provisionado})</option>
                                    ))}
                                </select>
                                <p className="text-[10px] text-slate-400 mt-1">Usa Cmd o Ctrl para selección múltiple.</p>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Fecha de Pago</label>
                                <input
                                    type="date"
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-slate-700 font-medium"
                                    value={paymentDate}
                                    onChange={(e) => setPaymentDate(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Monto Pagado {selectedPaymentPedimentos.length > 1 && '(Suma Total)'}</label>
                                <input
                                    type="number"
                                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-slate-800 font-mono font-bold text-lg disabled:bg-slate-100 disabled:text-slate-500"
                                    value={paymentAmount}
                                    disabled={selectedPaymentPedimentos.length > 1}
                                    onChange={(e) => setPaymentAmount(Number(e.target.value))}
                                    placeholder="0.00"
                                />
                            </div>
                        </div>
                        <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                            <button onClick={() => setIsPaymentModalOpen(false)} className="px-5 py-2.5 rounded-xl font-medium text-slate-600 hover:bg-slate-200 transition-colors">Cancelar</button>
                            <button
                                onClick={handleRegisterPayment}
                                disabled={selectedPaymentPedimentos.length === 0 || !paymentAmount}
                                className="px-6 py-2.5 bg-emerald-600 text-white font-bold rounded-xl shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-colors disabled:opacity-50"
                            >Confirmar Pago</button>
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
                                <PlusCircle size={24} className="text-indigo-400" /> Nuevo Registro de Pedimento
                            </h3>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Pedimento</label>
                                <input type="text" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" value={newPedi} onChange={(e) => setNewPedi(e.target.value)} placeholder="Ej. 26 24 3153 6005834" />
                            </div>
                            <div className="relative z-50">
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Nombre</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none pr-10"
                                        value={newNombre}
                                        onChange={(e) => { setNewNombre(e.target.value); setShowNameDropdown(true); }}
                                        onFocus={() => setShowNameDropdown(true)}
                                        onBlur={() => setTimeout(() => setShowNameDropdown(false), 200)}
                                        placeholder="Ej. Luis"
                                    />
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                                        <ChevronDown size={18} />
                                    </div>
                                </div>
                                {showNameDropdown && editorNames.filter(n => n.toLowerCase().includes(newNombre.toLowerCase())).length > 0 ? (
                                    <div className="absolute left-0 mt-2 w-full bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto z-[150] animate-in slide-in-from-top-1 fade-in duration-100">
                                        {editorNames
                                            .filter(n => n.toLowerCase().includes(newNombre.toLowerCase()))
                                            .map(nombre => (
                                            <div 
                                                key={nombre}
                                                className="px-4 py-2.5 hover:bg-indigo-50 cursor-pointer text-sm text-slate-700 transition-colors border-b border-slate-50 last:border-0 font-medium"
                                                onClick={() => { setNewNombre(nombre); setShowNameDropdown(false); }}
                                            >
                                                {nombre}
                                            </div>
                                        ))}
                                    </div>
                                ) : showNameDropdown && editorNames.length === 0 ? (
                                    <div className="absolute left-0 mt-2 w-full bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto z-[150] animate-in slide-in-from-top-1 fade-in duration-100">
                                        <div className="px-4 py-4 text-center text-sm text-slate-400">
                                            No hay usuarios disponibles
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Provisionado</label>
                                <input type="number" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-mono font-bold" value={newProv} onChange={(e) => setNewProv(Number(e.target.value))} placeholder="0.00" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Fecha de Registro</label>
                                <input
                                    type="date"
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-700 font-medium"
                                    value={newFechaRegistro}
                                    onChange={(e) => setNewFechaRegistro(e.target.value)}
                                />
                            </div>

                            <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 mt-2">
                                <div className="text-xs text-indigo-800 flex justify-between mb-1">
                                    <span>Saldo Inicial Previsto:</span><span className="font-mono font-bold">${saldoActual.toLocaleString()}</span>
                                </div>
                                <div className="text-xs text-indigo-900 flex justify-between pt-1 border-t border-indigo-200/50 mt-1">
                                    <span>Saldo Final Resultante:</span><span className="font-mono font-black">${(saldoActual - Number(newProv)).toLocaleString()}</span>
                                </div>
                            </div>
                        </div>
                        <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                            <button onClick={() => setIsNewRecordModalOpen(false)} className="px-5 py-2.5 rounded-xl font-medium text-slate-600 hover:bg-slate-200 transition-colors">Cancelar</button>
                            <button 
                                onClick={handleCreateNewRecord} 
                                disabled={newPedi.trim() === '' || newNombre.trim() === '' || newProv === ''} 
                                className="px-6 py-2.5 bg-slate-800 text-white font-bold rounded-xl shadow-lg shadow-slate-300 hover:bg-slate-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >Registrar y Guardar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {editingRecord && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-slate-100 bg-indigo-50">
                            <h3 className="text-xl font-bold text-indigo-900 flex items-center gap-2">
                                <Edit2 size={24} className="text-indigo-600" /> Editar Registro
                            </h3>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Pedimento</label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-700 font-medium"
                                    value={editingRecord.pedimento}
                                    onChange={(e) => setEditingRecord({ ...editingRecord, pedimento: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Nombre Responsable</label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-700 font-medium"
                                    value={editingRecord.nombre}
                                    onChange={(e) => setEditingRecord({ ...editingRecord, nombre: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Provisionado</label>
                                    <input
                                        type="number"
                                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800 font-mono font-bold"
                                        value={editingRecord.provisionado}
                                        onChange={(e) => setEditingRecord({ ...editingRecord, provisionado: Number(e.target.value) })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Fecha Reg.</label>
                                    <input
                                        type="date"
                                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800"
                                        value={editingRecord.fechaRegistro || ''}
                                        onChange={(e) => setEditingRecord({ ...editingRecord, fechaRegistro: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Pagado</label>
                                    <input
                                        type="number"
                                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-slate-800 font-mono font-bold"
                                        value={editingRecord.pagado || ''}
                                        onChange={(e) => setEditingRecord({ ...editingRecord, pagado: Number(e.target.value) })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Fecha Pago</label>
                                    <input
                                        type="date"
                                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-slate-800"
                                        value={editingRecord.fechaPago || ''}
                                        onChange={(e) => setEditingRecord({ ...editingRecord, fechaPago: e.target.value })}
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                            <button onClick={() => setEditingRecord(null)} className="px-5 py-2.5 rounded-xl font-medium text-slate-600 hover:bg-slate-200 transition-colors">Cancelar</button>
                            <button onClick={handleSaveEdit} className="px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-colors">Guardar Editado</button>
                        </div>
                    </div>
                </div>
            )}
            </div>
        </div>
    );
};
