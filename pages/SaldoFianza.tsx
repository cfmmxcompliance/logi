import React, { useState, useEffect, useRef, useCallback } from 'react';
import { storageService } from '../services/storageService.ts';
import { authService } from '../services/authService.ts';
import { FianzaRecord, UserRole } from '../types.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useLanguage } from '../context/LanguageContext';
import { Upload, DollarSign, Calendar, Search, PlusCircle, CheckCircle2, Filter, Download, Trash2, X, Plus, ChevronDown, Lock, FileSpreadsheet, Edit2, Monitor, FileText, Loader2, ExternalLink, AlertTriangle } from 'lucide-react';
import { uploadFileToDrive } from '../services/googleDriveService.ts';
import * as xlsx from 'xlsx';

interface QueryCondition {
    id: string;
    column: keyof FianzaRecord;
    operator: string;
    type: 'string' | 'number' | 'boolean';
    input: string;
}

const validatePedimentoFormat = (ped: string): string | null => {
    if (!ped) return "El pedimento está vacío.";
    if (ped.length !== 18) return `El pedimento debe tener exactamente 18 caracteres (incluyendo espacios). Actualmente tiene ${ped.length} caracteres. Estructura requerida: "XX XX XXXX XXXXXXX"`;

    const regex = /^\d{2} \d{2} \d{4} \d{7}$/;
    if (!regex.test(ped)) {
        return `El pedimento "${ped}" tiene caracteres inválidos o espacios mal colocados. Debe seguir la estructura "XX XX XXXX XXXXXXX" (sólo números y 3 espacios, ej. "26 16 1614 6002166").`;
    }
    return null;
};

export const SaldoFianza: React.FC = () => {
    const { user } = useAuth();
    const { t } = useLanguage();
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
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');

    // Duplicate detection modal
    const [duplicateWarning, setDuplicateWarning] = useState<{
        pedimento: string;
        existingRecord: FianzaRecord | null;
        context: string;
    } | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const pdfInputRef = useRef<HTMLInputElement>(null);

    // PDF Upload State
    const PEDIMENTO_FOLDER_ID = '1Bm3j5BDSvZwRCQG5kbv_vbKXU7a4qI99';
    const [uploadingPdfForId, setUploadingPdfForId] = useState<string | null>(null);
    const [paymentPdfFile, setPaymentPdfFile] = useState<File | null>(null);

    const handleUploadPedimentoPdf = useCallback(async (recordId: string, file: File, pedimento: string) => {
        setUploadingPdfForId(recordId);
        try {
            const ts = Date.now();
            const filename = `Pedimento_${pedimento.replace(/\s/g, '')}_${ts}.pdf`;
            const result = await uploadFileToDrive(file, filename, PEDIMENTO_FOLDER_ID);
            const url = result?.webViewLink || '';
            if (!url) throw new Error('Drive no devolvió URL para el PDF.');
            // 1. Guarda en Firestore (con merge)
            await storageService.upsertFianzas([{ id: recordId, pedimentoPdfUrl: url } as any]);
            // 2. Optimistic update local — el ícono cambia a azul INMEDIATAMENTE sin esperar subscribe
            setRecords(prev => prev.map(r => r.id === recordId ? { ...r, pedimentoPdfUrl: url } : r));
        } catch (err: any) {
            alert('Error subiendo PDF: ' + (err.message || 'Desconocido'));
        } finally {
            setUploadingPdfForId(null);
        }
    }, []);


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

    // Bug #3 Fix: ordenar por fechaRegistro (ISO string) con tiebreak por timestamp del ID.
    // Antes se usaba solo el timestamp del ID, lo que fallaba para registros importados via Excel
    // (todos tienen Date.now() + i, potencialmente el mismo segundo) o IDs con formato diferente.
    const BASE_BALANCE = 82032341.66;
    let runningBalance = BASE_BALANCE;

    const sortedRecordsOriginalMap = [...records]
        .sort((a, b) => {
            // Primary: fechaRegistro ISO (lexicographic = chronological for YYYY-MM-DD)
            const dA = a.fechaRegistro || '';
            const dB = b.fechaRegistro || '';
            if (dA !== dB) return dA.localeCompare(dB);
            // Tiebreak: timestamp embebido en el ID (fza_<ts>_xxx)
            const tA = parseInt(a.id.split('_')[1] || '0') || 0;
            const tB = parseInt(b.id.split('_')[1] || '0') || 0;
            return tA - tB;
        })
        .map(r => {
            // Bug #2 Fix: saldoInicial/saldoFinal se calculan aquí en render, nunca se leen de Firestore.
            // El valor en Firestore puede ser stale — la fuente de verdad es siempre este cálculo.
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
        // AGENT Role SCAC Restriction
        if (user?.role === UserRole.AGENT) {
            if (!user?.scac || !r.pedimento || !r.pedimento.toLowerCase().includes(user.scac.toLowerCase())) {
                return false;
            }
        }

        // Date Range Filter
        if (startDate && r.fechaRegistro && r.fechaRegistro < startDate) return false;
        if (endDate && r.fechaRegistro && r.fechaRegistro > endDate) return false;

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

                    if (row.length >= 3) {
                        // Bug #2 Fix: saldoInicial/saldoFinal no se persisten — se calculan en render.
                        // El Excel puede tenerlos, pero los ignoramos; la fuente de verdad es el balance corrido.
                        const rec: Partial<FianzaRecord> = {
                            id: `fza_${Date.now() + i}_${Math.random().toString(36).substring(2, 7)}`,
                            pedimento: String(row[0] || ''),
                            nombre: String(row[1] || ''),
                            provisionado: Number(row[2]) || 0,
                            fechaRegistro: new Date().toISOString().split('T')[0],
                            pagado: Number(row[3]) || 0,
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
                    // Format Validation
                    for (const pr of parsedRecords) {
                        if (!pr.pedimento) continue;
                        const formatError = validatePedimentoFormat(pr.pedimento);
                        if (formatError) {
                            alert(`Error de formato en Excel: ${formatError}`);
                            return;
                        }
                    }

                    const existingPedimentosSet = new Set(records.filter(r => r.id !== 'fza_0000000_iniciabase').map(r => r.pedimento.trim().toLowerCase()));
                    const firstConflict = parsedRecords.find(pr => pr.pedimento && existingPedimentosSet.has(pr.pedimento.trim().toLowerCase()));
                    if (firstConflict) {
                        const existing = records.find(r => r.pedimento.trim().toLowerCase() === firstConflict.pedimento!.trim().toLowerCase()) || null;
                        setDuplicateWarning({ pedimento: firstConflict.pedimento!, existingRecord: existing, context: 'Carga Excel — pedimento ya existe en el sistema' });
                        return;
                    }

                    // Check for duplicates within the uploaded file itself
                    const uploadedPedimentosSet = new Set<string>();
                    let internalDupPedimento = '';
                    for (const pr of parsedRecords) {
                        if (!pr.pedimento) continue;
                        const ped = pr.pedimento.trim().toLowerCase();
                        if (uploadedPedimentosSet.has(ped)) {
                            internalDupPedimento = pr.pedimento;
                            break;
                        }
                        uploadedPedimentosSet.add(ped);
                    }

                    if (internalDupPedimento) {
                        setDuplicateWarning({ pedimento: internalDupPedimento, existingRecord: null, context: 'Pedimento duplicado dentro del mismo archivo Excel' });
                        return;
                    }

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

        // Bug #4 Fix: el pago múltiple ignoraba paymentAmount y siempre usaba r.provisionado.
        // Ahora: si se ingresa un monto único, ese monto se aplica a CADA pedimento seleccionado.
        // Si se quiere pagar cada uno en su totalidad (provisionado), se deja el campo en blanco
        // (el botón queda disabled por la guarda `!paymentAmount`, por eso agregamos el path de pago completo).
        const dateToSave = paymentDate || new Date().toISOString().split('T')[0];
        const amount = Number(paymentAmount);
        const updates: Partial<FianzaRecord>[] = selectedPaymentPedimentos
            .map(id => {
                const r = unpaidRecords.find(x => x.id === id);
                if (!r) return null;
                return {
                    id: r.id,
                    pagado: amount,        // mismo monto para cada uno — el usuario lo controla
                    fechaPago: dateToSave
                };
            })
            .filter(Boolean) as Partial<FianzaRecord>[];

        if (updates.length === 0) return;
        await storageService.upsertFianzas(updates);
        setIsPaymentModalOpen(false);
        setSelectedPaymentPedimentos([]);
        setPaymentAmount('');
    };

    const handleCreateNewRecord = async () => {
        if (newPedi.trim() === '' || newNombre.trim() === '' || newProv === '') return;

        const formatError = validatePedimentoFormat(newPedi);
        if (formatError) {
            alert(formatError);
            return;
        }

        const isDuplicate = records.some(r => r.pedimento.trim().toLowerCase() === newPedi.trim().toLowerCase() && r.id !== 'fza_0000000_iniciabase');
        if (isDuplicate) {
            const existing = records.find(r => r.pedimento.trim().toLowerCase() === newPedi.trim().toLowerCase() && r.id !== 'fza_0000000_iniciabase') || null;
            setDuplicateWarning({ pedimento: newPedi, existingRecord: existing, context: 'Captura manual — Nuevo Registro' });
            return;
        }

        const provAmount = Number(newProv);
        const slInicial = saldoActual;
        const slFinal = slInicial - provAmount;

        try {
            // Bug #2 Fix: NO guardamos saldoInicial/saldoFinal en Firestore.
            // Son valores derivados calculados en render desde el balance corrido.
            // Guardar un snapshot aquí causaba drift cuando se insertaban registros fuera de orden.
            const newRecord: Partial<FianzaRecord> = {
                id: `fza_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                pedimento: newPedi,
                nombre: newNombre,
                provisionado: provAmount,
                fechaRegistro: newFechaRegistro || new Date().toISOString().split('T')[0],
                pagado: 0,
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

        const formatError = validatePedimentoFormat(editingRecord.pedimento);
        if (formatError) {
            alert(formatError);
            return;
        }

        const isDuplicate = records.some(r => r.pedimento.trim().toLowerCase() === editingRecord.pedimento.trim().toLowerCase() && r.id !== editingRecord.id && r.id !== 'fza_0000000_iniciabase');
        if (isDuplicate) {
            const existing = records.find(r => r.pedimento.trim().toLowerCase() === editingRecord.pedimento.trim().toLowerCase() && r.id !== editingRecord.id && r.id !== 'fza_0000000_iniciabase') || null;
            setDuplicateWarning({ pedimento: editingRecord.pedimento, existingRecord: existing, context: 'Edición de registro existente' });
            return;
        }

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

    const filteredImpuestosPagados = filteredRecords.reduce((acc, r) => acc + (Number(r.pagado) || 0), 0);
    const filteredProvisionado = filteredRecords.reduce((acc, r) => acc + (Number(r.provisionado) || 0), 0);
    const filteredImpuestosProvisionados = filteredProvisionado - filteredImpuestosPagados;

    return (
        <div className="w-full">
            {/* Mobile Block */}
            <div className="block lg:hidden flex-col items-center justify-center p-12 text-center bg-white rounded-3xl border border-slate-200 shadow-sm mx-auto max-w-md mt-[10vh]">
                <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-6 text-indigo-500">
                    <Monitor size={40} />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-3">{t('sf.desktop_only')}</h3>
                <p className="text-slate-500 text-sm">
                    {t('sf.desktop_msg')}
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
                        {/* Fila 1: Metadata Integrada */}
                        <div className="bg-slate-900/40 p-5 rounded-2xl border border-indigo-500/20 backdrop-blur-md">
                            <div className="flex flex-wrap items-center justify-between gap-6 md:gap-4">
                                <div className="flex-1 min-w-[120px]">
                                    <div className="text-[10px] text-indigo-300 font-bold tracking-wider mb-1 uppercase">{t('sf.forma_pago')}</div>
                                    <div className="text-lg font-mono font-bold text-white">22</div>
                                </div>
                                <div className="hidden md:block w-px h-8 bg-indigo-500/20"></div>
                                <div className="flex-[2] min-w-[200px]">
                                    <div className="text-[10px] text-indigo-300 font-bold tracking-wider mb-1 uppercase">{t('sf.inst_emisora')}</div>
                                    <div className="text-xs font-bold text-slate-100 leading-tight">Dorama Institución de Garantías, S.A.</div>
                                </div>
                                <div className="hidden md:block w-px h-8 bg-indigo-500/20"></div>
                                <div className="flex-1 min-w-[150px]">
                                    <div className="text-[10px] text-indigo-300 font-bold tracking-wider mb-1 uppercase">{t('sf.fianza')}</div>
                                    <div className="text-xs md:text-sm font-mono font-bold text-white">26018FRN00572</div>
                                </div>
                                <div className="hidden md:block w-px h-8 bg-indigo-500/20"></div>
                                <div className="flex-1 min-w-[120px]">
                                    <div className="text-[10px] text-indigo-300 font-bold tracking-wider mb-1 uppercase">{t('sf.fecha_auth')}</div>
                                    <div className="text-xs md:text-sm font-mono font-bold text-white">23/09/2025</div>
                                </div>
                                <div className="hidden md:block w-px h-8 bg-indigo-500/20"></div>
                                <div className="flex-1 min-w-[150px]">
                                    <div className="text-[10px] text-emerald-400 font-bold tracking-wider mb-1 uppercase">{t('sf.importe_doc')}</div>
                                    <div className="text-sm md:text-base font-mono font-black text-emerald-400">$82,032,341.66</div>
                                </div>
                            </div>
                        </div>

                            {/* Fila 2 */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div className="bg-slate-800/50 p-4 rounded-xl border border-rose-500/20 backdrop-blur-sm">
                                    <div className="text-[10px] text-rose-300 font-bold tracking-wider mb-1 leading-tight min-h-[24px]">{t('sf.imp_provisionados')}</div>
                                    <div className="text-sm md:text-base font-mono font-bold text-rose-400">${filteredImpuestosProvisionados.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                </div>
                                <div className="bg-slate-800/50 p-4 rounded-xl border border-orange-500/20 backdrop-blur-sm">
                                    <div className="text-[10px] text-orange-300 font-bold tracking-wider mb-1 leading-tight min-h-[24px]">{t('sf.imp_pagados')}</div>
                                    <div className="text-sm md:text-base font-mono font-bold text-orange-400">${filteredImpuestosPagados.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                </div>
                                <div className="bg-slate-800/50 p-4 rounded-xl border border-yellow-500/20 backdrop-blur-sm">
                                    <div className="text-[10px] text-yellow-300 font-bold tracking-wider mb-1 leading-tight min-h-[24px]">{t('sf.saldo_utilizado')}</div>
                                    <div className="text-sm md:text-base font-mono font-bold text-yellow-400">${filteredProvisionado.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                </div>
                            </div>
                        </div>
                        {/* Right: Main Balance */}
                        <div className="flex flex-col items-center xl:items-end text-center xl:text-right border-t xl:border-t-0 xl:border-l border-indigo-700/50 pt-8 xl:pt-0 xl:pl-8 w-full xl:w-auto">
                            <span className="uppercase tracking-[0.2em] text-indigo-200 font-bold text-xs mb-3">{t('sf.saldo_actual')}</span>
                            <span className="text-5xl md:text-6xl font-black font-mono tracking-tight text-white drop-shadow-md">
                                ${saldoActual.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <p className="text-indigo-300 mt-4 text-xs max-w-[280px] xl:max-w-[320px]">
                                {t('sf.saldo_desc')}
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
                            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">{t('sf.title')}</h1>
                            <p className="text-sm text-slate-500">{t('sf.subtitle')}</p>
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
                            {activeMassQuery.length > 0 ? `${t('sf.active_filters')} (${activeMassQuery.length})` : t('sf.mass_query')}
                        </button>
                        {activeMassQuery.length > 0 && (
                            <button onClick={() => setActiveMassQuery([])} className="px-3 py-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Limpiar Búsqueda">
                                <X size={16} />
                            </button>
                        )}

                        <div className="flex items-center gap-2 px-3 py-1.5 border border-slate-200 rounded-lg bg-slate-50/50">
                            <Calendar size={14} className="text-slate-400" />
                            <div className="flex items-center gap-1">
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="bg-transparent border-none text-xs font-medium focus:ring-0 p-0 text-slate-600"
                                    title={t('sf.start_date')}
                                />
                                <span className="text-slate-300">-</span>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="bg-transparent border-none text-xs font-medium focus:ring-0 p-0 text-slate-600"
                                    title={t('sf.end_date')}
                                />
                            </div>
                            {(startDate || endDate) && (
                                <button
                                    onClick={() => { setStartDate(''); setEndDate(''); }}
                                    className="ml-1 text-slate-400 hover:text-red-500"
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </div>

                        {user?.role !== UserRole.AGENT && user?.role !== UserRole.FINANZAS && (
                            <>
                                <button
                                    onClick={handleDownloadTemplate}
                                    className="flex items-center gap-1.5 px-3 py-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg text-sm transition-colors border border-transparent hover:border-emerald-200 font-medium"
                                    title={t('sf.plantilla')}
                                >
                                    <FileSpreadsheet size={16} /> {t('sf.plantilla')}
                                </button>

                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 font-medium shadow-sm transition-all hover:border-slate-300"
                                >
                                    <Upload size={16} /> {t('sf.cargar_datos')}
                                </button>
                                <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".xlsx, .xls, .csv" className="hidden" />
                            </>
                        )}

                        <button
                            onClick={handleExportCSV}
                            className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 font-medium"
                        >
                            <Download size={16} /> {t('sf.exportar')} {selectedIds.size > 0 && `(${selectedIds.size})`}
                        </button>

                        {user?.role !== UserRole.AGENT && user?.role !== UserRole.FINANZAS && (
                            <>
                                <button
                                    onClick={() => setIsNewRecordModalOpen(true)}
                                    className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 shadow-md font-medium"
                                >
                                    <PlusCircle size={16} /> {t('sf.nuevo')}
                                </button>
                                <button
                                    onClick={() => setIsPaymentModalOpen(true)}
                                    className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 shadow-lg shadow-emerald-200 font-bold transition-all"
                                >
                                    <CheckCircle2 size={18} /> {t('sf.pago')}
                                </button>
                            </>
                        )}

                        {user?.role === UserRole.ADMIN && selectedIds.size > 0 && (
                            <button
                                onClick={handleDeleteSelected}
                                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 shadow-md font-medium ml-2 animate-in fade-in"
                            >
                                <Trash2 size={16} /> {t('sf.borrar')} {selectedIds.size}
                            </button>
                        )}
                    </div>
                </div>

                {/* Main Table */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                        <h3 className="font-bold text-slate-700">{t('sf.historico')}</h3>
                        <div className="text-xs text-slate-500 font-medium bg-white px-3 py-1.5 rounded-full border border-slate-200">
                            {t('sf.mostrando')} {filteredRecords.length} {t('sf.de')} {records.length}
                        </div>
                    </div>
                    <div className="overflow-x-auto max-h-[600px]">
                        <input
                            type="file"
                            ref={pdfInputRef}
                            accept="application/pdf"
                            className="hidden"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) setPaymentPdfFile(file);
                                e.target.value = '';
                            }}
                        />
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
                                        <th className="px-6 py-4 text-center">{t('sf.col_acciones')}</th>
                                    )}
                                    <th className="px-6 py-4">{t('sf.col_pedimento')}</th>
                                    <th className="px-4 py-4 text-center text-indigo-700 bg-indigo-50/40">PEDIMENTO</th>
                                    <th className="px-6 py-4">{t('sf.col_nombre')}</th>
                                    <th className="px-6 py-4 text-right">{t('sf.col_provisionado')}</th>
                                    <th className="px-6 py-4 bg-indigo-50/50 text-indigo-700">{t('sf.col_fecha_reg')}</th>
                                    <th className="px-6 py-4 text-right">{t('sf.col_pagado')}</th>
                                    <th className="px-6 py-4 bg-emerald-50/50 text-emerald-700">{t('sf.col_fecha_pago')}</th>
                                    <th className="px-6 py-4 text-right">{t('sf.col_saldo_ini')}</th>
                                    <th className="px-6 py-4 text-right">{t('sf.col_saldo_fin')}</th>
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
                                                                onClick={() => setEditingRecord({ ...record })}
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
                                            {/* ── PEDIMENTO PDF COLUMN ── */}
                                            <td className="px-4 py-3 text-center bg-indigo-50/20">
                                                {record.id !== 'fza_0000000_iniciabase' && (
                                                    uploadingPdfForId === record.id ? (
                                                        <Loader2 size={18} className="animate-spin text-indigo-400 mx-auto" />
                                                    ) : record.pedimentoPdfUrl ? (
                                                        // Ya tiene PDF — ícono azul clicable que abre el Drive
                                                        <a
                                                            href={record.pedimentoPdfUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center justify-center p-1.5 rounded-lg text-blue-600 hover:bg-blue-100 transition-colors"
                                                            title="Ver PDF del Pedimento en Drive"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <FileText size={18} />
                                                        </a>
                                                    ) : (
                                                        // Sin PDF — ícono gris que abre el file picker
                                                        <label
                                                            className="inline-flex items-center justify-center p-1.5 rounded-lg text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 transition-colors cursor-pointer"
                                                            title="Subir PDF del Pedimento"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <FileText size={18} />
                                                            <input
                                                                type="file"
                                                                accept="application/pdf"
                                                                className="hidden"
                                                                onChange={(e) => {
                                                                    const file = e.target.files?.[0];
                                                                    if (file) handleUploadPedimentoPdf(record.id, file, record.pedimento);
                                                                    e.target.value = '';
                                                                }}
                                                            />
                                                        </label>
                                                    )
                                                )}
                                            </td>
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
                                        <Filter size={20} className="text-indigo-600" /> {t('sf.query_title')}
                                    </h3>
                                    <p className="text-sm text-slate-500 mt-1">{t('sf.query_desc')}</p>
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
                                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{t('sf.q_column')}</label>
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
                                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{t('sf.q_operator')}</label>
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
                                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{t('sf.q_datatype')}</label>
                                                <select className="w-full border border-slate-300 rounded-lg p-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:bg-slate-50"
                                                    value={cond.type} disabled={cond.operator === 'empty' || cond.operator === 'not_empty'}
                                                    onChange={(e) => updateQueryCondition(cond.id, { type: e.target.value as any })}>
                                                    <option value="string">{t('sf.q_string')}</option>
                                                    <option value="number">{t('sf.q_number')}</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                                                {cond.operator === 'empty' || cond.operator === 'not_empty' ? t('sf.q_not_required') : cond.operator === 'in' ? t('sf.q_values_per_line') : t('sf.q_target')}
                                            </label>
                                            <textarea
                                                className="w-full border border-slate-300 rounded-lg p-3 font-mono text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none min-h-[80px]"
                                                disabled={cond.operator === 'empty' || cond.operator === 'not_empty'}
                                                placeholder={cond.operator === 'in' ? `Val 1\nVal 2` : t('sf.q_target')}
                                                value={cond.operator === 'empty' || cond.operator === 'not_empty' ? '' : cond.input}
                                                onChange={(e) => updateQueryCondition(cond.id, { input: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                ))}

                                <button onClick={addQueryCondition} className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 transition-all flex items-center justify-center gap-2 font-medium">
                                    <Plus size={18} /> {t('sf.add_condition')}
                                </button>
                            </div>

                            <div className="px-6 py-5 border-t border-slate-100 bg-slate-50 rounded-b-3xl flex justify-end gap-3 shrink-0">
                                <button onClick={() => { setQueryConditions([]); setActiveMassQuery([]); setIsQueryBuilderOpen(false); }} className="px-5 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-colors">
                                    {t('sf.clear_all')}
                                </button>
                                <button onClick={applyMassQuery} className="px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-colors flex items-center gap-2">
                                    <Search size={18} /> {t('sf.run_query')}
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
                                    <CheckCircle2 size={24} className="text-emerald-600" /> {t('sf.pay_title')}
                                </h3>
                                <p className="text-sm text-emerald-700/80 mt-1">{t('sf.pay_desc')}</p>
                            </div>
                            <div className="p-6 space-y-5">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t('sf.pay_pedimentos')}</label>
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
                                    <p className="text-[10px] text-slate-400 mt-1">{t('sf.pay_hint')}</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t('sf.pay_fecha')}</label>
                                    <input
                                        type="date"
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-slate-700 font-medium"
                                        value={paymentDate}
                                        onChange={(e) => setPaymentDate(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t('sf.pay_monto')} {selectedPaymentPedimentos.length > 1 && `(${t('sf.pay_monto_sum')})`}</label>
                                    <input
                                        type="number"
                                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-slate-800 font-mono font-bold text-lg disabled:bg-slate-100 disabled:text-slate-500"
                                        value={paymentAmount}
                                        disabled={selectedPaymentPedimentos.length > 1}
                                        onChange={(e) => setPaymentAmount(Number(e.target.value))}
                                        placeholder="0.00"
                                    />
                                </div>

                                {/* ── PDF DEL PEDIMENTO (opcional al registrar pago) ── */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">PDF del Pedimento (opcional)</label>
                                    <div
                                        className={`w-full flex items-center gap-3 px-4 py-3 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
                                            paymentPdfFile ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 hover:border-indigo-200 hover:bg-indigo-50/50 text-slate-500'
                                        }`}
                                        onClick={() => pdfInputRef.current?.click()}
                                    >
                                        <FileText size={18} className={paymentPdfFile ? 'text-indigo-500' : 'text-slate-400'} />
                                        <span className="text-sm font-medium truncate">
                                            {paymentPdfFile ? paymentPdfFile.name : 'Seleccionar PDF del pedimento...'}
                                        </span>
                                        {paymentPdfFile && (
                                            <button
                                                type="button"
                                                className="ml-auto text-slate-400 hover:text-red-500"
                                                onClick={(e) => { e.stopPropagation(); setPaymentPdfFile(null); }}
                                            >
                                                <X size={16} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                                <button onClick={() => { setIsPaymentModalOpen(false); setPaymentPdfFile(null); }} className="px-5 py-2.5 rounded-xl font-medium text-slate-600 hover:bg-slate-200 transition-colors">{t('sf.cancelar')}</button>
                                <button
                                    onClick={async () => {
                                        await handleRegisterPayment();
                                        // Si hay PDF adjunto, subirlo a Drive para cada pedimento seleccionado
                                        if (paymentPdfFile && selectedPaymentPedimentos.length > 0) {
                                            for (const id of selectedPaymentPedimentos) {
                                                const r = unpaidRecords.find(x => x.id === id);
                                                if (r) await handleUploadPedimentoPdf(id, paymentPdfFile, r.pedimento);
                                            }
                                            setPaymentPdfFile(null);
                                        }
                                    }}
                                    disabled={selectedPaymentPedimentos.length === 0 || !paymentAmount}
                                    className="px-6 py-2.5 bg-emerald-600 text-white font-bold rounded-xl shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                                >
                                    {uploadingPdfForId ? <Loader2 size={16} className="animate-spin" /> : null}
                                    {t('sf.confirmar_pago')}
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
                                    <PlusCircle size={24} className="text-indigo-400" /> {t('sf.new_record_title')}
                                </h3>
                            </div>
                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t('sf.pedimento_label')}</label>
                                    <input type="text" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" value={newPedi} onChange={(e) => setNewPedi(e.target.value)} placeholder="Ej. 26 24 3153 6005834" />
                                </div>
                                <div className="relative z-50">
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t('sf.col_nombre')}</label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none pr-10"
                                            value={newNombre}
                                            onChange={(e) => { setNewNombre(e.target.value); setShowNameDropdown(true); }}
                                            onFocus={() => setShowNameDropdown(true)}
                                            onBlur={() => setTimeout(() => setShowNameDropdown(false), 200)}
                                            placeholder={t('sf.nombre_placeholder')}
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
                                                {t('sf.no_users')}
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Provisionado</label>
                                    <input type="number" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-mono font-bold" value={newProv} onChange={(e) => setNewProv(Number(e.target.value))} placeholder="0.00" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t('sf.fecha_registro')}</label>
                                    <input
                                        type="date"
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-700 font-medium"
                                        value={newFechaRegistro}
                                        onChange={(e) => setNewFechaRegistro(e.target.value)}
                                    />
                                </div>

                                <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 mt-2">
                                    <div className="text-xs text-indigo-800 flex justify-between mb-1">
                                        <span>{t('sf.saldo_previsto')}:</span><span className="font-mono font-bold">${saldoActual.toLocaleString()}</span>
                                    </div>
                                    <div className="text-xs text-indigo-900 flex justify-between pt-1 border-t border-indigo-200/50 mt-1">
                                        <span>{t('sf.saldo_resultante')}:</span><span className="font-mono font-black">${(saldoActual - Number(newProv)).toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                                <button onClick={() => setIsNewRecordModalOpen(false)} className="px-5 py-2.5 rounded-xl font-medium text-slate-600 hover:bg-slate-200 transition-colors">{t('sf.cancelar')}</button>
                                <button
                                    onClick={handleCreateNewRecord}
                                    disabled={newPedi.trim() === '' || newNombre.trim() === '' || newProv === ''}
                                    className="px-6 py-2.5 bg-slate-800 text-white font-bold rounded-xl shadow-lg shadow-slate-300 hover:bg-slate-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >{t('sf.registrar_guardar')}</button>
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
                                    <Edit2 size={24} className="text-indigo-600" /> {t('sf.edit_title')}
                                </h3>
                            </div>
                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t('sf.pedimento_label')}</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-700 font-medium"
                                        value={editingRecord.pedimento}
                                        onChange={(e) => setEditingRecord({ ...editingRecord, pedimento: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t('sf.nombre_resp')}</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-700 font-medium"
                                        value={editingRecord.nombre}
                                        onChange={(e) => setEditingRecord({ ...editingRecord, nombre: e.target.value })}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t('sf.provisionado')}</label>
                                        <input
                                            type="number"
                                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800 font-mono font-bold"
                                            value={editingRecord.provisionado}
                                            onChange={(e) => setEditingRecord({ ...editingRecord, provisionado: Number(e.target.value) })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t('sf.fecha_reg_short')}</label>
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
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t('sf.pagado')}</label>
                                        <input
                                            type="number"
                                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-slate-800 font-mono font-bold"
                                            value={editingRecord.pagado || ''}
                                            onChange={(e) => setEditingRecord({ ...editingRecord, pagado: Number(e.target.value) })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t('sf.fecha_pago_short')}</label>
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
                                <button onClick={() => setEditingRecord(null)} className="px-5 py-2.5 rounded-xl font-medium text-slate-600 hover:bg-slate-200 transition-colors">{t('sf.cancelar')}</button>
                                <button onClick={handleSaveEdit} className="px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-colors">{t('sf.guardar_edit')}</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

                {/* ── DUPLICATE WARNING MODAL ── */}
                {duplicateWarning && (
                    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
                        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">

                            {/* Header */}
                            <div className="p-6 border-b border-red-100 bg-gradient-to-br from-red-50 to-orange-50 flex items-center gap-4">
                                <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm">
                                    <AlertTriangle size={24} className="text-red-600" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-red-900">Pedimento Duplicado</h3>
                                    <p className="text-sm text-red-500/80 mt-0.5">El registro ya existe — guardado bloqueado</p>
                                </div>
                            </div>

                            {/* Body */}
                            <div className="p-6 space-y-4">
                                <div className="bg-red-50 rounded-xl p-4 border border-red-200">
                                    <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-1">Pedimento Conflictivo</p>
                                    <p className="font-mono text-xl font-black text-red-700 tracking-wide">{duplicateWarning.pedimento}</p>
                                </div>

                                {duplicateWarning.existingRecord ? (
                                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-2.5">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Registro Existente en Sistema</p>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-slate-400">Nombre</span>
                                            <span className="font-semibold text-slate-700">{duplicateWarning.existingRecord.nombre}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-slate-400">Provisionado</span>
                                            <span className="font-mono font-bold text-slate-700">${(duplicateWarning.existingRecord.provisionado || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-slate-400">Fecha Registro</span>
                                            <span className="font-medium text-indigo-600">{duplicateWarning.existingRecord.fechaRegistro || '—'}</span>
                                        </div>
                                        {(duplicateWarning.existingRecord.pagado || 0) > 0 && (
                                            <div className="flex justify-between items-center text-sm border-t border-slate-200 pt-2">
                                                <span className="text-slate-400">Pagado</span>
                                                <span className="font-mono font-bold text-emerald-600">${(duplicateWarning.existingRecord.pagado || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
                                        <p className="text-sm text-amber-700 font-medium">⚠️ El pedimento aparece más de una vez dentro del mismo archivo Excel. Corrige el archivo antes de importar.</p>
                                    </div>
                                )}

                                <p className="text-[10px] text-slate-400 flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 bg-slate-300 rounded-full inline-block"></span>
                                    Origen: {duplicateWarning.context}
                                </p>
                            </div>

                            {/* Footer */}
                            <div className="p-5 bg-slate-50 border-t border-slate-100 flex justify-end">
                                <button
                                    onClick={() => setDuplicateWarning(null)}
                                    className="px-6 py-2.5 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors shadow-lg shadow-red-200 flex items-center gap-2"
                                >
                                    <X size={16} /> Entendido — No Guardar
                                </button>
                            </div>
                        </div>
                    </div>
                )}
        </div>
    );
};
