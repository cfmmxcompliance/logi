import React, { useState, useEffect, useRef } from 'react';
import { 
    FileCheck, History, FolderOpen, Upload, Download, Search, 
    Database, ShieldCheck, AlertTriangle, FileText, Trash2, RefreshCw, BarChart2, Filter, CheckCircle2, ChevronsUpDown
} from 'lucide-react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { uploadFileToDrive } from '../services/googleDriveService';
import { geminiService } from '../services/geminiService';
import { parseCSV } from '../utils/csvParser';
import { useAuth } from '../context/AuthContext';

export interface BalanceR8 {
    id: string;
    folio: string;
    rfcImportador: string;
    inicioVigencia: string;
    finVigencia: string;
    fraccion: string;
    
    // Exactly from Firebase Production
    montoAutorizadoCant: number;
    montoAutorizadoValor: number;
    montoEjercidoCant: number;
    montoEjercidoValor: number;
    paises: string;
    pedimentos: string;
    regimen: string;
    regimenAutorizado: string;
    saldoCantidad: number;
    saldoValor: number;
    tipoPermiso: string;
    unidad: number;
    
    estatus: string;
}

export interface R8Detalle {
    id: string;
    folioR8: string;
    folioAut: string;
    num: number;
    descripcion: string;
    pais: string;
    fracBd: string;
    fracUnico: string;
    prosec: string;
    um: string;
    cantAut: number;
    valUnit: number;
    numeroRegla8va?: string;
    fraccionArancelaria?: string;
    fraccionProsec?: string;
    fraccionUnico?: string;
    paisProcedencia?: string;
    descripcion?: string;
    unidadMedida?: string;
    cantidadAutorizada?: number;
    cantidadEjercida?: number;
    valorAutorizado?: number;
    valorEjercido?: number;
    valorUnitario?: number;
    saldoCantidad?: string | number;
    saldoValor?: string | number;
    fechaVigencia?: string;
    fechaSolicitud?: string;
    fechaAutorizacion?: string;
    folioAutorizacion?: string;
    partida?: number;
    llave?: string;
    estatus?: string;
    
    // Fallbacks from previous hardcoded mapping
    folio?: string;
    fraccionOriginal?: string;
    fraccionDeclarar?: string;
    permisoPrevio?: boolean;
}

export interface PermisoR8 {
    id: string;
    folio?: string;
    permisoPrevio?: string;
    originalTariffFraction?: string;
    fraccionReglaOctava?: string;
    masterdataPartNumber?: string;
    description?: string;
    unidadMedida?: string;
    totalAuthorized?: number;
    consumed?: number;
    balance?: number;
    valorDolares?: number;
    issueDate?: string;
    expirationDate?: string;
    status?: string;
    pdfUrl?: string;

    // legacy
    regla?: string;
    fraccionOriginal?: string;
    fraccionDeclarar?: string;
    fracciones?: string;
    regimen?: string;
    tipo?: string;
}

export const ReglaOctavaR8 = () => {
    const { hasRole } = useAuth();
    const isAdmin = hasRole('admin');

    const [activeTab, setActiveTab] = useState<'activas' | 'historico' | 'permisos' | 'expediente'>('activas');
    
    // Data States
    const [balanceData, setBalanceData] = useState<BalanceR8[]>([]);
    const [detalleData, setDetalleData] = useState<R8Detalle[]>([]);
    const [permisosData, setPermisosData] = useState<PermisoR8[]>([]);
    
    // UI States
    const [searchTerm, setSearchTerm] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    
    // Filtros
    const [filtroActiva, setFiltroActiva] = useState<'Todos' | 'DISPONIBLE' | 'VENCIDA'>('Todos');
    const [filtroHist, setFiltroHist] = useState<'Todos' | 'VIGENTE' | 'RENOVAR' | 'VENCIDO'>('Todos');
    const [filtroHistRegimen, setFiltroHistRegimen] = useState<'Todos' | 'IMD' | 'ITE'>('Todos');
    const [filtroPais, setFiltroPais] = useState('Todos los países');

    const fileInputRef = useRef<HTMLInputElement>(null);
    const detailFileInputRef = useRef<HTMLInputElement>(null);

    // Setup Firestore listeners
    useEffect(() => {
        if (!db) return;
        
        const unsubBalance = onSnapshot(collection(db, 'balanceR8'), (snap) => {
            const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as BalanceR8));
            setBalanceData(data);
        });

        const unsubDetalle = onSnapshot(collection(db, 'r8Detalle'), (snap) => {
            const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as R8Detalle));
            setDetalleData(data);
        });
        
        const unsubPermisos = onSnapshot(collection(db, 'rule_8ths'), (snap) => {
            const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as PermisoR8));
            setPermisosData(data);
        });

        return () => {
            unsubBalance();
            unsubDetalle();
            unsubPermisos();
        };
    }, []);

    const filterBySearch = <T extends any>(data: T[], searchFields: (keyof T)[]): T[] => {
        if (!searchTerm.trim()) return data;
        const terms = searchTerm.split(',').map(t => t.trim().toLowerCase()).filter(t => t);
        return data.filter(item => {
            return terms.some(term => {
                return searchFields.some(field => {
                    const val = item[field];
                    return val && String(val).toLowerCase().includes(term);
                });
            });
        });
    };

    const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>, targetCollection: 'balanceR8' | 'r8Detalle') => {
        const file = e.target.files?.[0];
        if (!file || !db) return;
        
        setIsUploading(true);
        try {
            const text = await file.text();
            const rows = parseCSV(text);
            if (rows.length < 2) throw new Error("CSV vacío o sin suficientes datos");

            const headers = rows[0].map(h => h.trim().toLowerCase());
            const batch = writeBatch(db);
            let count = 0;

            const parseNumber = (val: any) => {
                if (!val) return 0;
                const num = parseFloat(String(val).replace(/[^\d.-]/g, ''));
                return isNaN(num) ? 0 : num;
            };

            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (row.length < headers.length) continue;
                
                if (targetCollection === 'r8Detalle') {
                    const id = `det_${Date.now()}_${i}`;
                    const docRef = doc(db, 'r8Detalle', id);
                    batch.set(docRef, {
                        folio: row[headers.indexOf('folio r8')] || row[headers.indexOf('folio')] || '',
                        numeroRegla8va: row[headers.indexOf('numero regla 8va')] || '',
                        descripcion: row[headers.indexOf('descripción')] || row[headers.indexOf('descripcion')] || '',
                        pais: row[headers.indexOf('país')] || row[headers.indexOf('pais')] || 'CHN',
                        fraccionArancelaria: row[headers.indexOf('fraccion arancelaria')] || '',
                        fraccionProsec: row[headers.indexOf('fraccion prosec')] || '',
                        cantidadAutorizada: parseNumber(row[headers.indexOf('cantidad autorizada')]),
                        cantidadEjercida: parseNumber(row[headers.indexOf('cantidad ejercida')]),
                        valorAutorizado: parseNumber(row[headers.indexOf('valor autorizado')]),
                        valorEjercido: parseNumber(row[headers.indexOf('valor ejercido')]),
                        fechaVigencia: row[headers.indexOf('fecha vigencia')] || '',
                        estatus: 'DISPONIBLE'
                    });
                    count++;
                } else {
                    const id = `bal_${Date.now()}_${i}`;
                    const docRef = doc(db, 'balanceR8', id);
                    
                    const montoAutorizadoCant = parseNumber(row[headers.indexOf('monto autorizado cant')] || row[headers.indexOf('monto aut cant')] || row[headers.indexOf('monto aut. cant.')]);
                    const montoEjercidoCant = parseNumber(row[headers.indexOf('monto ejercido cant')] || row[headers.indexOf('monto ej cant')] || row[headers.indexOf('monto ej. cant.')]);
                    
                    const montoAutorizadoValor = parseNumber(row[headers.indexOf('monto autorizado valor')] || row[headers.indexOf('monto aut valor')] || row[headers.indexOf('monto aut. valor.')]);
                    const montoEjercidoValor = parseNumber(row[headers.indexOf('monto ejercido valor')] || row[headers.indexOf('monto ej valor')] || row[headers.indexOf('monto ej. valor.')]);
                    
                    batch.set(docRef, {
                        folio: row[headers.indexOf('folio')] || '',
                        rfcImportador: row[headers.indexOf('rfc importador')] || row[headers.indexOf('rfc')] || 'CMP220712ND9',
                        inicioVigencia: row[headers.indexOf('inicio vigencia')] || row[headers.indexOf('inicio')] || '',
                        finVigencia: row[headers.indexOf('fin vigencia')] || row[headers.indexOf('fin')] || '',
                        fraccion: row[headers.indexOf('fracción')] || row[headers.indexOf('fraccion')] || '',
                        unidad: parseNumber(row[headers.indexOf('unidad')]) || 1,
                        
                        montoAutorizadoCant: montoAutorizadoCant,
                        montoEjercidoCant: montoEjercidoCant,
                        montoAutorizadoValor: montoAutorizadoValor,
                        montoEjercidoValor: montoEjercidoValor,
                        
                        paises: row[headers.indexOf('países')] || row[headers.indexOf('paises')] || 'Países',
                        pedimentos: row[headers.indexOf('pedimentos')] || 'Pedimentos',
                        regimen: row[headers.indexOf('régimen')] || row[headers.indexOf('regimen')] || 'IMPORTACION',
                        regimenAutorizado: row[headers.indexOf('regimen autorizado')] || row[headers.indexOf('regimen aut.')] || row[headers.indexOf('reg. autorizado')] || 'IMD',
                        tipoPermiso: row[headers.indexOf('tipo permiso')] || 'C1',
                        
                        saldoCantidad: parseNumber(row[headers.indexOf('saldo cantidad')] || row[headers.indexOf('saldo cant %')]) || (montoAutorizadoCant > 0 ? (montoAutorizadoCant - montoEjercidoCant)/montoAutorizadoCant : 0),
                        saldoValor: parseNumber(row[headers.indexOf('saldo valor')] || row[headers.indexOf('saldo valor %')]) || (montoAutorizadoValor > 0 ? (montoAutorizadoValor - montoEjercidoValor)/montoAutorizadoValor : 0),
                        
                        estatus: 'VIGENTE'
                    });
                    count++;
                }
                
                if (count > 0 && count % 400 === 0) await batch.commit();
            }
            if (count % 400 !== 0) await batch.commit();
            
            alert(`✅ ${count} registros importados exitosamente.`);
        } catch (error: any) {
            alert(`Error importando CSV: ${error.message}`);
        } finally {
            setIsUploading(false);
            if (e.target) e.target.value = '';
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            const fileData = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = () => resolve((reader.result as string).split(',')[1]);
                reader.onerror = error => reject(error);
            });
            const pdfUrl = await uploadFileToDrive(file.name, fileData, file.type || 'application/pdf', 'PermisosR8');

            const extractedData = await geminiService.extractR8Document(fileData, file.type);
            
            if (extractedData && extractedData.length > 0) {
                const batch = writeBatch(db);
                
                extractedData.forEach((item, index) => {
                    const id = `rule8_${Date.now()}_${index}`;
                    const docRef = doc(db, 'rule_8ths', id);
                    batch.set(docRef, {
                        folio: item.folio || 'SIN_FOLIO',
                        originalTariffFraction: item.originalTariffFraction || '',
                        fraccionReglaOctava: item.fraccionReglaOctava || '',
                        permisoPrevio: item.permisoPrevio || '',
                        description: item.description || '',
                        issueDate: item.issueDate || new Date().toISOString(),
                        expirationDate: item.expirationDate || '',
                        status: 'Vigente',
                        pdfUrl: pdfUrl
                    });
                });
                
                await batch.commit();
                alert(`✅ Documento procesado y guardado (${extractedData.length} fracciones encontradas).`);
            } else {
                alert("⚠️ No se encontraron fracciones en el documento.");
            }
        } catch (error: any) {
            console.error("Error al procesar PDF:", error);
            alert(`Error procesando documento: ${error.message}`);
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleExportCSV = () => {
        let dataToExport: any[] = [];
        let filename = 'export.csv';

        if (activeTab === 'activas') {
            dataToExport = detalleData;
            filename = 'R8_Activas.csv';
        } else if (activeTab === 'historico') {
            dataToExport = balanceData;
            filename = 'R8_Historico.csv';
        } else if (activeTab === 'permisos') {
            dataToExport = permisosData;
            filename = 'Permisos_R8.csv';
        }

        if (dataToExport.length === 0) return alert("No hay datos para exportar.");

        const headers = Object.keys(dataToExport[0]).filter(k => k !== 'id');
        const csvContent = [
            headers.join(','),
            ...dataToExport.map(row => headers.map(h => `"${String((row as any)[h] || '').replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
    };

    const handleDelete = async (collectionName: string, id: string) => {
        if (!confirm("¿Seguro que deseas eliminar este registro?")) return;
        try {
            await deleteDoc(doc(db, collectionName, id));
        } catch (error: any) {
            alert(`Error eliminando registro: ${error.message}`);
        }
    };

    const handleClearAll = async (collectionName: string, data: any[]) => {
        if (!confirm(`¿ALERTA: Seguro que deseas eliminar TODOS los ${data.length} registros de esta tabla? Esta acción no se puede deshacer.`)) return;
        setIsUploading(true);
        try {
            const batch = writeBatch(db);
            let count = 0;
            for (const item of data) {
                batch.delete(doc(db, collectionName, item.id));
                count++;
                if (count % 400 === 0) await batch.commit();
            }
            if (count % 400 !== 0) await batch.commit();
            alert("Limpieza completada.");
        } catch (e) {
            alert("Error al limpiar tabla.");
        } finally {
            setIsUploading(false);
        }
    }

    const getDetalleEstatus = (d: R8Detalle) => {
        if (d.estatus === 'VENCIDA') return 'VENCIDA';
        if (d.fechaVigencia) {
            const parts = d.fechaVigencia.split('/'); // DD/MM/YY
            if (parts.length === 3) {
                const year = parseInt(parts[2]) + 2000;
                const month = parseInt(parts[1]) - 1;
                const day = parseInt(parts[0]);
                if (new Date(year, month, day) < new Date()) {
                    return 'VENCIDA';
                }
            }
        }
        const st = d.estatus ? d.estatus.toUpperCase() : 'DISPONIBLE';
        return st === 'VENCIDO' ? 'VENCIDA' : st;
    };

    const filteredDetalle = filterBySearch(detalleData, ['folio', 'fraccionOriginal', 'fraccionDeclarar', 'numeroRegla8va', 'fraccionArancelaria', 'fraccionProsec', 'descripcion'])
        .filter(d => filtroActiva === 'Todos' ? true : getDetalleEstatus(d) === filtroActiva)
        .filter(d => filtroPais === 'Todos los países' ? true : (d.paisProcedencia || d.pais) === filtroPais);

    const activeFolios = new Set(detalleData.map(d => d.numeroRegla8va || d.folio).filter(Boolean));

    const getCalculatedEstatus = (b: BalanceR8) => {
        if (b.estatus === 'VENCIDO') return 'VENCIDO';
        if (!activeFolios.has(b.folio)) return 'VENCIDO';
        if (!b.finVigencia) return b.estatus || 'VIGENTE';
        
        let fin = new Date(b.finVigencia);
        const parts = b.finVigencia.split('/');
        if (parts.length === 3) {
            const day = parseInt(parts[0]);
            const month = parseInt(parts[1]) - 1;
            let year = parseInt(parts[2]);
            if (year < 100) year += 2000;
            fin = new Date(year, month, day);
        }
        
        const hoy = new Date();
        const diffDays = Math.ceil((fin.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
        
        if (diffDays < 0) return 'VENCIDO';
        
        const saldoCantPct = b.saldoCantidad * 100;
        const saldoValorPct = b.saldoValor * 100;
        
        if (saldoCantPct <= 0 || saldoValorPct <= 0) return 'AGOTADO';
        
        // Regla: si queda <= 30% de saldo en cantidad o valor
        if ((b.montoAutorizadoCant > 0 && saldoCantPct <= 30) || (b.montoAutorizadoValor > 0 && saldoValorPct <= 30)) {
            return 'RENOVAR';
        }
        
        return 'VIGENTE';
    };

    const filteredBalance = filterBySearch(balanceData, ['folio', 'rfcImportador', 'fraccion', 'regimen', 'paises', 'pedimentos'])
        .filter(b => {
            if (filtroHist === 'Todos') return true;
            return getCalculatedEstatus(b) === filtroHist;
        })
        .filter(b => {
            if (filtroHistRegimen === 'Todos') return true;
            return b.regimenAutorizado === filtroHistRegimen;
        });

    const filteredPermisos = filterBySearch(permisosData, ['folio', 'permisoPrevio', 'originalTariffFraction', 'fraccionReglaOctava', 'masterdataPartNumber', 'description', 'regla', 'fraccionOriginal', 'fraccionDeclarar']);
    
    // Agrupar documentos de Expediente por Permiso Previo para no duplicarlos
    const uniqueExpedienteDocs = Array.from(
        new Map(filteredPermisos.filter(p => p.pdfUrl).map(p => [p.permisoPrevio, p])).values()
    );

    const getDirectDownloadUrl = (url: string) => {
        if (!url) return '';
        try {
            if (url.includes('drive.google.com')) {
                const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
                if (match && match[1]) {
                    return `https://drive.google.com/uc?export=download&id=${match[1]}`;
                }
            }
            return url;
        } catch (e) {
            return url;
        }
    };

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0);
    };

    const formatNumber = (val: number) => {
        return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val || 0);
    };

    const uniqueCountries = ['Todos los países', ...Array.from(new Set(detalleData.map(d => d.paisProcedencia || d.pais).filter(Boolean)))];

    return (
        <div className="p-8 max-w-[1600px] mx-auto bg-slate-50 min-h-screen">
            <div className="mb-6">
                <div className="flex items-center gap-3 mb-1">
                    <FileCheck className="text-indigo-600" size={28} />
                    <h1 className="text-2xl font-bold text-slate-800">Control de Reglas 8vas</h1>
                </div>
                <p className="text-slate-500 text-sm ml-10">Gestión, control de saldos y vigencia de oficios de Regla 8va.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-8">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                    <p className="text-[11px] font-bold text-slate-500 mb-1 tracking-wider">TOTAL OFICIOS</p>
                    <h3 className="text-3xl font-bold text-slate-800">{balanceData.length}</h3>
                    <p className="text-[11px] text-slate-400 mt-1">oficios de importación</p>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-green-200">
                    <p className="text-[11px] font-bold text-green-600 mb-1 tracking-wider">VIGENTES</p>
                    <h3 className="text-3xl font-bold text-green-700">{balanceData.filter(b => getCalculatedEstatus(b) === 'VIGENTE').length}</h3>
                    <p className="text-[11px] text-green-600 mt-1 flex items-center gap-1"><ShieldCheck size={12}/> vigentes activos</p>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-amber-200">
                    <p className="text-[11px] font-bold text-amber-600 mb-1 tracking-wider">POR RENOVAR</p>
                    <h3 className="text-3xl font-bold text-amber-700">{balanceData.filter(b => getCalculatedEstatus(b) === 'RENOVAR').length}</h3>
                    <p className="text-[11px] text-amber-600 mt-1 flex items-center gap-1"><AlertTriangle size={12}/> requieren renovación</p>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-center">
                    <p className="text-[11px] font-bold text-slate-500 mb-1 tracking-wider">SALDO CANT. PROM.</p>
                    <h3 className="text-2xl font-bold text-indigo-700 mb-2">81.1%</h3>
                    <div className="w-full bg-slate-100 rounded-full h-1.5"><div className="bg-indigo-600 h-1.5 rounded-full" style={{width: '81.1%'}}></div></div>
                </div>

                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-center">
                    <p className="text-[11px] font-bold text-slate-500 mb-1 tracking-wider">SALDO VALOR PROM.</p>
                    <h3 className="text-2xl font-bold text-purple-600 mb-2">76.5%</h3>
                    <div className="w-full bg-slate-100 rounded-full h-1.5"><div className="bg-purple-600 h-1.5 rounded-full" style={{width: '76.5%'}}></div></div>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                    <p className="text-[11px] font-bold text-slate-500 mb-1 tracking-wider">MONTO AUTORIZADO</p>
                    <h3 className="text-lg font-bold text-slate-800">{formatCurrency(balanceData.reduce((acc, curr) => acc + (curr.montoAutorizadoValor || 0), 0))}</h3>
                    <p className="text-[11px] text-slate-500 mt-1">Ejercido: {formatCurrency(balanceData.reduce((acc, curr) => acc + (curr.montoEjercidoValor || 0), 0))}</p>
                </div>
            </div>

            <div className="flex border-b border-slate-200 mb-6 space-x-6 overflow-x-auto">
                <button 
                    className={`pb-3 font-medium flex items-center gap-2 whitespace-nowrap ${activeTab === 'activas' ? 'text-teal-600 border-b-2 border-teal-600' : 'text-slate-500 hover:text-slate-700'}`}
                    onClick={() => setActiveTab('activas')}
                >
                    <Database size={16} /> R8 Activas <span className="bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full text-[10px] font-bold">{detalleData.length}</span>
                </button>
                <button 
                    className={`pb-3 font-medium flex items-center gap-2 whitespace-nowrap ${activeTab === 'historico' ? 'text-purple-600 border-b-2 border-purple-600' : 'text-slate-500 hover:text-slate-700'}`}
                    onClick={() => setActiveTab('historico')}
                >
                    <BarChart2 size={16} /> R8 HISTORICO <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full text-[10px] font-bold">{balanceData.length}</span>
                </button>
                <button 
                    className={`pb-3 font-medium flex items-center gap-2 whitespace-nowrap ${activeTab === 'permisos' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                    onClick={() => setActiveTab('permisos')}
                >
                    <FileText size={16} /> Permisos R8 <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-[10px] font-bold">{permisosData.length}</span>
                </button>
                <button 
                    className={`pb-3 font-medium flex items-center gap-2 whitespace-nowrap ${activeTab === 'expediente' ? 'text-orange-600 border-b-2 border-orange-600' : 'text-slate-500 hover:text-slate-700'}`}
                    onClick={() => setActiveTab('expediente')}
                >
                    <FolderOpen size={16} /> Expediente Digital <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full text-[10px] font-bold">{uniqueExpedienteDocs.length}</span>
                </button>
            </div>

            {/* HEADER BLOCK */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-4">
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${activeTab === 'activas' ? 'bg-teal-500 text-white' : activeTab === 'historico' ? 'bg-indigo-500 text-white' : activeTab === 'permisos' ? 'bg-blue-600 text-white' : 'bg-orange-500 text-white'}`}>
                        {activeTab === 'activas' && <Database size={20} />}
                        {activeTab === 'historico' && <BarChart2 size={20} />}
                        {activeTab === 'permisos' && <FileCheck size={20} />}
                        {activeTab === 'expediente' && <FolderOpen size={20} />}
                    </div>
                    <div>
                        <h2 className="font-bold text-slate-800 text-lg leading-tight">
                            {activeTab === 'activas' && 'R8 Activas'}
                            {activeTab === 'historico' && 'Balance Regla 8va'}
                            {activeTab === 'permisos' && 'Control de Reglas 8vas'}
                            {activeTab === 'expediente' && 'Expediente Digital'}
                        </h2>
                        <p className="text-xs text-slate-400">
                            {activeTab === 'activas' && 'Importar desde REGLAS 8VAS-detalle.csv'}
                            {activeTab === 'historico' && 'Control de Oficios y Saldos de Regla Octava'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                    {isUploading && <span className="text-sm font-medium text-indigo-600 animate-pulse mr-2">Procesando...</span>}
                    
                    {(activeTab === 'permisos') && (
                        <button 
                            onClick={() => handleClearAll('rule_8ths', permisosData)}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-500 bg-red-50 border border-red-100 rounded-lg hover:bg-red-100 transition-colors"
                            disabled={isUploading}
                        >
                            <Trash2 size={16} /> Limpiar Todo
                        </button>
                    )}
                    
                    {(activeTab === 'activas' || activeTab === 'historico') && (
                        <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                            <RefreshCw size={14} /> Actualizar
                        </button>
                    )}

                    {activeTab === 'historico' && (
                        <button onClick={handleExportCSV} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                            <Download size={14} /> Exportar CSV
                        </button>
                    )}

                    {activeTab === 'activas' && (
                        <label className={`flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg cursor-pointer transition-colors ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                            <Upload size={16} /> Importar CSV Detalle
                            <input 
                                type="file" 
                                className="hidden" 
                                accept=".csv" 
                                onChange={(e) => handleImportCSV(e, 'r8Detalle')} 
                                disabled={isUploading}
                                ref={detailFileInputRef}
                            />
                        </label>
                    )}
                    
                    {activeTab === 'historico' && (
                        <label className={`flex items-center gap-2 px-4 py-2 text-sm font-bold text-white rounded-lg cursor-pointer transition-colors ${isUploading ? 'opacity-50 cursor-not-allowed' : ''} bg-indigo-600 hover:bg-indigo-700`}>
                            <Upload size={16} /> Importar CSV
                            <input 
                                type="file" 
                                className="hidden" 
                                accept=".csv" 
                                onChange={(e) => handleImportCSV(e, 'balanceR8')} 
                                disabled={isUploading}
                                ref={fileInputRef}
                            />
                        </label>
                    )}

                    {activeTab === 'permisos' && (
                        <label className={`flex items-center gap-2 px-4 py-2 text-sm font-bold text-white rounded-lg cursor-pointer transition-colors ${isUploading ? 'opacity-50 cursor-not-allowed' : ''} bg-blue-600 hover:bg-blue-700`}>
                            <Upload size={16} /> Cargar PDF
                            <input 
                                type="file" 
                                className="hidden" 
                                accept=".pdf" 
                                onChange={handleFileUpload} 
                                disabled={isUploading}
                                ref={fileInputRef}
                            />
                        </label>
                    )}
                </div>
            </div>

            {/* TOOLBAR BLOCK */}
            <div className="flex flex-col lg:flex-row items-center justify-between w-full border border-slate-200 rounded-2xl p-2 bg-white gap-4 mb-4 shadow-sm">
                <div className="flex gap-3 items-center w-full lg:w-auto flex-1">
                    <div className="relative flex-1 max-w-2xl w-full">
                        <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                        <input 
                            type="text" 
                            placeholder={
                                activeTab === 'activas' ? "Buscar folio, descripción, fracción..." : 
                                activeTab === 'historico' ? "Buscar folio, RFC, fracción..." : 
                                "Multibúsqueda (separa con comas)"
                            }
                            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    {activeTab === 'permisos' && (
                        <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors h-[42px]">
                            <Filter size={16} /> Filtros Avanzados
                        </button>
                    )}

                    {activeTab === 'activas' && (
                        <div className="flex bg-white border border-slate-200 rounded-xl p-1 shrink-0 h-[42px] items-center">
                            {['Todos', 'DISPONIBLE', 'VENCIDA'].map(f => (
                                <button 
                                    key={f}
                                    onClick={() => setFiltroActiva(f as any)}
                                    className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-colors ${filtroActiva === f ? 'bg-teal-600 text-white' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    {f}
                                </button>
                            ))}
                        </div>
                    )}
                    
                    {activeTab === 'historico' && (
                        <div className="flex bg-white border border-slate-200 rounded-xl p-1 shrink-0 h-[42px] items-center">
                            {['Todos', 'VIGENTE', 'RENOVAR', 'VENCIDO', 'AGOTADO'].map(f => (
                                <button 
                                    key={f}
                                    onClick={() => setFiltroHist(f as any)}
                                    className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-colors ${filtroHist === f ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    {f}
                                </button>
                            ))}
                        </div>
                    )}

                    {activeTab === 'historico' && (
                        <div className="flex bg-white border border-slate-200 rounded-xl p-1 shrink-0 h-[42px] items-center">
                            {['Todos', 'IMD', 'ITE'].map(f => (
                                <button 
                                    key={f}
                                    onClick={() => setFiltroHistRegimen(f as any)}
                                    className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-colors ${filtroHistRegimen === f ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    {f}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex gap-4 items-center shrink-0 pr-2">
                    {activeTab === 'activas' && (
                        <div className="relative h-[42px] flex items-center">
                            <select 
                                value={filtroPais} 
                                onChange={(e) => setFiltroPais(e.target.value)}
                                className="appearance-none h-full px-4 pr-8 text-xs font-bold border border-slate-200 rounded-xl text-slate-600 bg-white hover:bg-slate-50 cursor-pointer outline-none focus:ring-2 focus:ring-teal-500"
                            >
                                {uniqueCountries.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                                <ChevronsUpDown size={14} />
                            </div>
                        </div>
                    )}
                    
                    {activeTab === 'permisos' && (
                        <button onClick={handleExportCSV} className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-slate-800 rounded-xl hover:bg-slate-900 transition-colors h-[42px]">
                            <Download size={16} /> Exportar a CSV
                        </button>
                    )}

                    {(activeTab === 'activas' || activeTab === 'historico') && (
                        <span className="text-xs text-slate-400 font-medium">
                            Mostrando <span className="font-bold">{activeTab === 'activas' ? filteredDetalle.length : filteredBalance.length}</span> de {activeTab === 'activas' ? detalleData.length : balanceData.length}
                        </span>
                    )}
                </div>
            </div>

            {/* TABLE BLOCK */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs whitespace-nowrap font-medium text-slate-600">
                        <thead className="bg-white text-slate-400 font-bold uppercase tracking-wider border-b-2 border-slate-100">
                            {activeTab === 'activas' && (
                                <tr>
                                    {isAdmin && <th className="px-4 py-4 text-center w-10"><input type="checkbox" className="rounded border-slate-300 text-teal-600" /></th>}
                                    <th className="px-4 py-4">FOLIO</th>
                                    <th className="px-4 py-4">FRACCIÓN ORIGINAL</th>
                                    <th className="px-4 py-4">FRACCIÓN DECLARAR</th>
                                    <th className="px-4 py-4 text-center">PAÍS</th>
                                    <th className="px-4 py-4">DESCRIPCIÓN</th>
                                    <th className="px-4 py-4 text-right">CANT. AUT.</th>
                                    <th className="px-4 py-4 text-right">CANT. EJ.</th>
                                    <th className="px-4 py-4 text-right">VAL. AUT.</th>
                                    <th className="px-4 py-4 text-right">VAL. EJ.</th>
                                    <th className="px-4 py-4 text-center">VIGENCIA</th>
                                    <th className="px-4 py-4 text-center">PERMISO</th>
                                    <th className="px-4 py-4 text-center">ESTATUS</th>
                                    {isAdmin && <th className="px-4 py-4 text-center">ACCIONES</th>}
                                </tr>
                            )}
                            {activeTab === 'historico' && (
                                <tr>
                                    {isAdmin && <th className="px-4 py-4 text-center w-10"><input type="checkbox" className="rounded border-slate-300 text-purple-600 focus:ring-purple-500" /></th>}
                                    <th className="px-4 py-4 cursor-pointer hover:text-slate-600">FOLIO <span className="text-slate-300 inline-block rotate-180">▼</span></th>
                                    <th className="px-4 py-4 cursor-pointer hover:text-slate-600">RFC IMPORTADOR <span className="text-slate-300">▼</span></th>
                                    <th className="px-4 py-4 cursor-pointer hover:text-slate-600">INICIO VIGENCIA <span className="text-slate-300">▼</span></th>
                                    <th className="px-4 py-4 cursor-pointer hover:text-slate-600">FIN VIGENCIA <span className="text-slate-300">▼</span></th>
                                    <th className="px-4 py-4 cursor-pointer hover:text-slate-600 text-center">RÉGIMEN AUT. <span className="text-slate-300">▼</span></th>
                                    <th className="px-4 py-4 cursor-pointer hover:text-slate-600 text-center">TIPO PERMISO <span className="text-slate-300">▼</span></th>
                                    <th className="px-4 py-4 cursor-pointer hover:text-slate-600 text-center">FRACCIÓN <span className="text-slate-300">▼</span></th>
                                    <th className="px-4 py-4 cursor-pointer hover:text-slate-600 text-center">UNIDAD <span className="text-slate-300">▼</span></th>
                                    <th className="px-4 py-4 cursor-pointer hover:text-slate-600 text-right">MONTO AUT. CANT. <span className="text-slate-300">▼</span></th>
                                    <th className="px-4 py-4 cursor-pointer hover:text-slate-600 text-right">MONTO EJ. CANT. <span className="text-slate-300">▼</span></th>
                                    <th className="px-4 py-4 cursor-pointer hover:text-slate-600 text-right">MONTO AUT. VALOR. <span className="text-slate-300">▼</span></th>
                                    <th className="px-4 py-4 cursor-pointer hover:text-slate-600 text-right">MONTO EJ. VALOR <ChevronsUpDown size={14} className="inline text-slate-300 ml-1"/></th>
                                    <th className="px-4 py-4 cursor-pointer hover:text-slate-600 text-center">ESTATUS <ChevronsUpDown size={14} className="inline text-slate-300 ml-1"/></th>
                                    <th className="px-4 py-4 cursor-pointer hover:text-slate-600 text-right">SALDO CANT. % <ChevronsUpDown size={14} className="inline text-slate-300 ml-1"/></th>
                                    <th className="px-4 py-4 cursor-pointer hover:text-slate-600 text-right">SALDO VALOR % <ChevronsUpDown size={14} className="inline text-slate-300 ml-1"/></th>
                                    {isAdmin && <th className="px-4 py-4 text-center">ACCIONES</th>}
                                </tr>
                            )}
                            {activeTab === 'permisos' && (
                                <tr>
                                    {isAdmin && <th className="px-4 py-4 text-center w-10"><input type="checkbox" className="rounded border-slate-300 text-teal-600" /></th>}
                                    <th className="px-4 py-4 cursor-pointer hover:text-slate-600">FOLIO <ChevronsUpDown size={14} className="inline text-slate-300 ml-1"/></th>
                                    <th className="px-4 py-4 cursor-pointer hover:text-slate-600">R8 / PERMISO <ChevronsUpDown size={14} className="inline text-slate-300 ml-1"/></th>
                                    <th className="px-4 py-4 cursor-pointer hover:text-slate-600 text-left">DESCRIPCIÓN <ChevronsUpDown size={14} className="inline text-slate-300 ml-1"/></th>
                                    <th className="px-4 py-4 cursor-pointer hover:text-slate-600 text-center">FRAC. ORIGINAL <ChevronsUpDown size={14} className="inline text-slate-300 ml-1"/></th>
                                    <th className="px-4 py-4 cursor-pointer hover:text-slate-600 text-center">FRAC. R8 <ChevronsUpDown size={14} className="inline text-slate-300 ml-1"/></th>
                                    <th className="px-4 py-4 cursor-pointer hover:text-slate-600 text-center">INICIO <ChevronsUpDown size={14} className="inline text-slate-300 ml-1"/></th>
                                    <th className="px-4 py-4 cursor-pointer hover:text-slate-600 text-center">VIGENCIA <ChevronsUpDown size={14} className="inline text-slate-300 ml-1"/></th>
                                    <th className="px-4 py-4 cursor-pointer hover:text-slate-600 text-center">ESTATUS <ChevronsUpDown size={14} className="inline text-slate-300 ml-1"/></th>
                                    {isAdmin && <th className="px-4 py-4 text-center">ACCIONES</th>}
                                </tr>
                            )}
                            {activeTab === 'expediente' && (
                                <tr>
                                    <th className="px-4 py-4 font-bold text-slate-500 uppercase">Folio R8</th>
                                    <th className="px-4 py-4 font-bold text-slate-500 uppercase">Permiso Previo</th>
                                    <th className="px-4 py-4 font-bold text-slate-500 uppercase text-center">Estatus</th>
                                    <th className="px-4 py-4 font-bold text-slate-500 uppercase text-center">Descarga</th>
                                </tr>
                            )}
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {activeTab === 'activas' && filteredDetalle.map((d) => (
                                <tr key={d.id} className="hover:bg-slate-50 transition-colors border-b border-slate-50">
                                    {isAdmin && <td className="px-4 py-4 text-center"><input type="checkbox" className="rounded border-slate-300 text-teal-600 focus:ring-teal-500" /></td>}
                                    <td className="px-4 py-4 text-indigo-700 font-bold">{d.numeroRegla8va || d.folio}</td>
                                    <td className="px-4 py-4 text-slate-600 font-mono text-[11px] font-bold">{d.fraccionArancelaria || d.fraccionOriginal}</td>
                                    <td className="px-4 py-4 text-slate-600 font-mono text-[11px] font-bold">{d.fraccionProsec || d.fraccionDeclarar}</td>
                                    <td className="px-4 py-4 text-slate-600 font-bold text-center">{d.paisProcedencia || d.pais}</td>
                                    <td className="px-4 py-4 text-slate-500 text-[10px] max-w-[200px] truncate" title={d.descripcion}>{d.descripcion || '—'}</td>
                                    <td className="px-4 py-4 text-slate-600 font-mono text-[11px] text-right">{formatNumber(d.cantidadAutorizada || 0)}</td>
                                    <td className="px-4 py-4 text-slate-600 font-mono text-[11px] text-right">{formatNumber(d.cantidadEjercida || 0)}</td>
                                    <td className="px-4 py-4 text-slate-600 font-mono text-[11px] text-right font-bold">{formatCurrency(d.valorAutorizado || 0)}</td>
                                    <td className="px-4 py-4 text-slate-600 font-mono text-[11px] text-right">{formatCurrency(d.valorEjercido || 0)}</td>
                                    <td className="px-4 py-4 text-slate-600 text-center font-mono text-[11px]">{d.fechaVigencia || '—'}</td>
                                    <td className="px-4 py-4 text-center"><CheckCircle2 size={16} className="text-green-500 mx-auto" /></td>
                                    <td className="px-4 py-4 text-center">
                                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold ${getDetalleEstatus(d) === 'DISPONIBLE' ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
                                            {getDetalleEstatus(d)}
                                        </span>
                                    </td>
                                    {isAdmin && <td className="px-4 py-4 text-center">
                                        <button onClick={() => handleDelete('r8Detalle', d.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent"><Trash2 size={14}/></button>
                                    </td>}
                                </tr>
                            ))}
                            
                            {activeTab === 'historico' && filteredBalance.map((b) => {
                                const estatusCalc = getCalculatedEstatus(b);
                                return (
                                <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                                    {isAdmin && <td className="px-4 py-4 text-center"><input type="checkbox" className="rounded border-slate-300 text-purple-600 focus:ring-purple-500" /></td>}
                                    <td className="px-4 py-4 text-indigo-700 font-bold">{b.folio}</td>
                                    <td className="px-4 py-4 text-slate-600 font-mono text-[11px]">{b.rfcImportador}</td>
                                    <td className="px-4 py-4 text-slate-600">{b.inicioVigencia}</td>
                                    <td className={`px-4 py-4 ${estatusCalc === 'VENCIDO' ? 'text-red-600' : 'text-slate-600'}`}>{b.finVigencia}</td>
                                    <td className="px-4 py-4 text-center">
                                        <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full text-[10px] font-bold">{b.regimenAutorizado || 'IMD'}</span>
                                    </td>
                                    <td className="px-4 py-4 text-slate-600 text-center font-bold">{b.tipoPermiso || 'C1'}</td>
                                    <td className="px-4 py-4 font-mono text-[11px] text-center">{b.fraccion}</td>
                                    <td className="px-4 py-4 text-slate-600 text-center">{b.unidad || 1}</td>
                                    <td className="px-4 py-4 text-right font-mono text-[11px]">{formatNumber(b.montoAutorizadoCant)}</td>
                                    <td className="px-4 py-4 text-right font-mono text-[11px] text-slate-500">{formatNumber(b.montoEjercidoCant)}</td>
                                    <td className="px-4 py-4 text-right font-mono text-[11px] font-bold">{formatCurrency(b.montoAutorizadoValor)}</td>
                                    <td className="px-4 py-4 text-right font-mono text-[11px] text-slate-600">{formatCurrency(b.montoEjercidoValor)}</td>
                                    <td className="px-4 py-4 text-center">
                                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold ${
                                            estatusCalc === 'VIGENTE' ? 'bg-green-100 text-green-700 border border-green-200' : 
                                            estatusCalc === 'RENOVAR' ? 'bg-amber-100 text-amber-700 border border-amber-200' : 
                                            estatusCalc === 'AGOTADO' ? 'bg-slate-100 text-slate-700 border border-slate-300' :
                                            'bg-red-50 text-red-600 border border-red-200'
                                        }`}>
                                            {estatusCalc}
                                        </span>
                                    </td>
                                    <td className="px-4 py-4">
                                        <div className="flex items-center gap-3 justify-end">
                                            <div className="w-16 bg-slate-100 rounded-full h-1.5"><div className="bg-emerald-500 h-1.5 rounded-full" style={{width: `${(b.saldoCantidad * 100).toFixed(1)}%`}}></div></div>
                                            <span className="font-mono text-[11px] font-bold text-slate-600 w-10 text-right">{(b.saldoCantidad * 100).toFixed(1)}%</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4">
                                        <div className="flex items-center gap-3 justify-end">
                                            <div className="w-16 bg-slate-100 rounded-full h-1.5"><div className="bg-emerald-500 h-1.5 rounded-full" style={{width: `${(b.saldoValor * 100).toFixed(1)}%`}}></div></div>
                                            <span className="font-mono text-[11px] font-bold text-slate-600 w-10 text-right">{(b.saldoValor * 100).toFixed(1)}%</span>
                                        </div>
                                    </td>
                                    {isAdmin && <td className="px-4 py-4 text-center">
                                        <button onClick={() => handleDelete('balanceR8', b.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent"><Trash2 size={14}/></button>
                                    </td>}
                                </tr>
                            )})}
                            
                            {activeTab === 'permisos' && filteredPermisos.map((p) => (
                                <tr key={p.id} className="hover:bg-slate-50 transition-colors border-b border-slate-50">
                                    {isAdmin && <td className="px-4 py-4 text-center"><input type="checkbox" className="rounded border-slate-300 text-teal-600 focus:ring-teal-500" /></td>}
                                    <td className="px-4 py-4 text-indigo-700 font-bold font-mono text-[11px] truncate max-w-[150px]" title={p.folio}>{p.folio}</td>
                                    <td className="px-4 py-4 text-slate-600 font-bold">{p.permisoPrevio || p.regla}</td>
                                    <td className="px-4 py-4 text-slate-500 text-[10px] max-w-[200px] truncate" title={p.description || p.masterdataDescription}>{p.description || p.masterdataDescription || '—'}</td>
                                    <td className="px-4 py-4 text-slate-600 text-center font-mono text-[11px] font-bold">{p.originalTariffFraction || p.fraccionOriginal}</td>
                                    <td className="px-4 py-4 text-slate-600 text-center font-mono text-[11px] font-bold">{p.fraccionReglaOctava || p.fraccionDeclarar}</td>
                                    <td className="px-4 py-4 text-slate-600 text-center font-mono text-[11px]">{p.issueDate || '—'}</td>
                                    <td className="px-4 py-4 text-slate-600 text-center font-mono text-[11px] font-bold">{p.expirationDate || '—'}</td>
                                    <td className="px-4 py-4 text-center">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${p.status === 'Vigente' ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
                                            {p.status || 'VIGENTE'}
                                        </span>
                                    </td>
                                    {isAdmin && <td className="px-4 py-4 text-center">
                                        <button onClick={() => handleDelete('rule_8ths', p.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent"><Trash2 size={14}/></button>
                                    </td>}
                                </tr>
                            ))}
                            
                            {activeTab === 'expediente' && uniqueExpedienteDocs.map((p) => (
                                <tr key={p.id} className="hover:bg-slate-50 transition-colors border-b border-slate-100">
                                    <td className="px-4 py-4 flex items-center gap-2">
                                        <FileText size={16} className="text-orange-500" />
                                        <span className="text-indigo-800 font-mono font-bold text-xs">{p.folio}</span>
                                    </td>
                                    <td className="px-4 py-4 text-slate-500 font-mono text-xs">{p.permisoPrevio}</td>
                                    <td className="px-4 py-4 text-center">
                                        <span className="bg-green-100 text-green-600 px-3 py-1 rounded-full text-[11px] font-bold">{p.status || 'Vigente'}</span>
                                    </td>
                                    <td className="px-4 py-4 text-center">
                                        <a href={getDirectDownloadUrl(p.pdfUrl || '')} download target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-[#ea580c] text-white hover:bg-[#c2410c] rounded text-xs font-bold transition-colors">
                                            <Download size={14}/> Descargar PDF
                                        </a>
                                    </td>
                                </tr>
                            ))}
                            
                            {((activeTab === 'activas' && filteredDetalle.length === 0) || 
                              (activeTab === 'historico' && filteredBalance.length === 0) || 
                              (activeTab === 'permisos' && filteredPermisos.length === 0) || 
                              (activeTab === 'expediente' && uniqueExpedienteDocs.length === 0)) && (
                                <tr>
                                    <td colSpan={20} className="p-12 text-center text-slate-400">
                                        <div className="flex flex-col items-center justify-center space-y-3">
                                            <Database size={48} className="text-slate-200" />
                                            <p className="text-lg font-medium text-slate-500">No hay registros para mostrar</p>
                                            <p className="text-sm">Intenta ajustar tu búsqueda o utiliza el botón de importar/cargar.</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
