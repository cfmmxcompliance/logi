import React, { useState, useEffect } from 'react';
import { storageService } from '../services/storageService.ts';
import { DailyChange, MasterDataReport, UserRole } from '../types.ts';
import { Activity, RefreshCcw, Download, FileText, User, Calendar, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.tsx';
import * as XLSX from 'xlsx';

export const DailyAudit = () => {
    const { user } = useAuth();
    const [changes, setChanges] = useState<DailyChange[]>([]);
    const [reports, setReports] = useState<MasterDataReport[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            setIsLoading(true);
            await Promise.all([
                storageService.fetchDailyChanges(),
                storageService.fetchDailyReports()
            ]);
            setChanges(storageService.getDailyChanges());
            setReports((storageService as any).getDailyReports());
            setIsLoading(false);
        };

        loadData();
        const unsub = storageService.subscribe(() => {
            setChanges(storageService.getDailyChanges());
            setReports((storageService as any).getDailyReports());
        });
        return unsub;
    }, []);

    // EXACT ORDER FROM MASTER DATA TEMPLATE
    const CSV_ORDER_KEYS = [
        'PART_NUMBER', 'REGIMEN', 'TypeMaterial', 'DESCRIPTION_EN', 'DESCRIPCION_ES',
        'UMC', 'UMT', 'HTSMX', 'HTSMXBASE', 'HTSMXNICO', 'IGI_DUTY', 'PROSEC', 'R8',
        'DESCRIPCION_R8', 'RRYNA_NON_DUTY_REQUIREMENTS', 'REMARKS', 'NETWEIGHT',
        'IMPORTED_OR_NOT', 'SENSIBLE', 'HTS_SerialNo', 'CLAVESAT', 'DESCRIPCION_CN',
        'MATERIAL_CN', 'MATERIAL_EN', 'FUNCTION_CN', 'FUNCTION_EN', 'COMPANY', 'ESTIMATED'
    ];

    const handleDownload = (type: 'full' | 'changes', dateContext?: string) => {
        const date = dateContext || new Date().toISOString().split('T')[0];
        let rawData: any[] = [];
        let filename = '';

        if (type === 'full') {
            rawData = storageService.getParts();
            filename = `MasterData_Full_${date}.csv`;
        } else {
            const targetDateStr = date;
            const dailyChanges = changes.filter(c => c.timestamp.split('T')[0] === targetDateStr);
            const changedPartNumbers = Array.from(new Set(dailyChanges.map(c => c.partNumber)));
            rawData = storageService.getParts().filter(p => changedPartNumbers.includes(p.PART_NUMBER));
            filename = `MasterData_Changes_${date}.csv`;
        }

        if (rawData.length === 0 && type === 'changes') {
            alert('No hay cambios registrados para esta fecha.');
            return;
        }

        // Map data to EXACT columns and order
        const formattedData = rawData.map(item => {
            const row: any = {};
            CSV_ORDER_KEYS.forEach(key => {
                row[key] = item[key] !== undefined ? item[key] : '';
            });
            return row;
        });

        try {
            const worksheet = XLSX.utils.json_to_sheet(formattedData, { header: CSV_ORDER_KEYS });
            const csvOutput = XLSX.utils.sheet_to_csv(worksheet);
            const blob = new Blob([csvOutput], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (e) {
            console.error('Error generating CSV:', e);
            alert('Error al generar el archivo CSV.');
        }
    };

    const getReportForDate = (timestamp: string) => {
        const dateStr = new Date(timestamp).toISOString().split('T')[0];
        return reports.find(r => r.id === dateStr);
    };

    return (
        <div className="p-6 space-y-6 bg-slate-50 min-h-screen">
            <header className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <Activity className="text-blue-600" /> Control de Cambios (Daily Audit)
                    </h1>
                    <p className="text-slate-500 text-sm">Monitorea quién ha realizado cambios en el Master Data y accede a los respaldos diarios.</p>
                </div>
            </header>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <p className="text-lg text-slate-700">
                    Hoy se han adicionado o enmendado <span className="font-bold underline decoration-blue-500 decoration-2 underline-offset-4">{changes.filter(c => c.timestamp.split('T')[0] === new Date().toISOString().split('T')[0]).length} items</span> en el Master Data.
                </p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-4 font-bold text-slate-700 text-xs">Fecha y Hora</th>
                                <th className="px-6 py-4 font-bold text-slate-700 text-xs">Usuario</th>
                                <th className="px-6 py-4 font-bold text-slate-700 text-xs italic">Acción</th>
                                <th className="px-6 py-4 font-bold text-slate-700 text-xs">Detalles de la Transacción</th>
                                <th className="px-6 py-4 font-bold text-slate-700 text-xs">Anexos (CSV)</th>
                                <th className="px-6 py-4 font-bold text-slate-700 text-xs text-center">Enlace</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-10 text-center text-slate-400">
                                        <RefreshCcw className="animate-spin inline mr-2" /> Cargando registros de auditoría...
                                    </td>
                                </tr>
                            ) : changes.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                                        No se encontraron registros de cambios hoy.
                                    </td>
                                </tr>
                            ) : (
                                [...changes]
                                    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                                    .map((change) => {
                                        const report = getReportForDate(change.timestamp);
                                        const dateStr = change.timestamp.split('T')[0];

                                        return (
                                            <tr key={change.id} className={`hover:bg-slate-50 transition-colors ${(change as any).reported ? 'opacity-80' : 'bg-blue-50/20'}`}>
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col gap-1">
                                                        <div className="flex items-center gap-2 text-slate-600 text-[10px] font-mono">
                                                            <Calendar size={12} className="text-slate-400" />
                                                            {new Date(change.timestamp).toLocaleString()}
                                                        </div>
                                                        {(change as any).reported && (
                                                            <span className="text-[9px] text-emerald-600 font-bold flex items-center gap-1">
                                                                ✓ Reportado el {new Date((change as any).reportedAt || change.timestamp).toLocaleDateString()}
                                                            </span>
                                                        )}
                                                        {!(change as any).reported && (
                                                            <span className="text-[9px] text-amber-600 font-bold flex items-center gap-1 italic">
                                                                Pending Report (Next 1 AM)
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
                                                        <User size={12} className="text-blue-500" />
                                                        {change.user}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${change.action === 'UPDATE' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                        change.action === 'UPSERT' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                            'bg-slate-50 text-slate-700 border-slate-200'
                                                        }`}>
                                                        {change.action}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-xs text-slate-600 whitespace-nowrap">
                                                    {change.partNumber === 'SYSTEM' ? 'Reporte Automatizado Generado' : `Modificación: ${change.partNumber}`}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        {/* Primary Action: Direct Local CSV Generation for the transaction's date */}
                                                        <div className="flex gap-1.5">
                                                            <button
                                                                onClick={() => handleDownload('changes', dateStr)}
                                                                className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded text-[9px] border border-emerald-200 hover:bg-emerald-100 transition-colors flex items-center gap-1 font-bold"
                                                                title="Descargar Cambios de este día"
                                                            >
                                                                <Download size={10} /> CSV
                                                            </button>
                                                            <button
                                                                onClick={() => handleDownload('full', dateStr)}
                                                                className="bg-slate-50 text-slate-700 px-1.5 py-0.5 rounded text-[9px] border border-slate-200 hover:bg-slate-100 transition-colors flex items-center gap-1 font-bold"
                                                                title="Descargar Backup Completo"
                                                            >
                                                                <FileText size={10} /> FULL
                                                            </button>

                                                            {/* Optional: Actual Drive Link if available (e.g. from 1:00 AM job) */}
                                                            {report?.fullCsvUrl && !report.fullCsvUrl.includes('test') && (
                                                                <a
                                                                    href={report.fullCsvUrl}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="text-blue-500 hover:text-blue-700"
                                                                    title="Ver en Google Drive"
                                                                >
                                                                    <ExternalLink size={10} />
                                                                </a>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    {change.partNumber !== 'SYSTEM' && (
                                                        <Link
                                                            to={`/database?search=${change.partNumber}`}
                                                            className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2.5 py-1 rounded border border-blue-200 text-[10px] font-bold hover:bg-blue-100 transition-colors shadow-sm"
                                                        >
                                                            <ExternalLink size={10} /> VER PIEZA
                                                        </Link>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {user?.role === UserRole.ADMIN && (
                <div className="flex justify-end pt-4">
                    <button
                        onClick={async () => {
                            const timestamp = new Date().toISOString();
                            const mockChange: DailyChange = {
                                id: `system_${Date.now()}`,
                                timestamp: timestamp,
                                action: 'UPSERT',
                                user: 'SYSTEM_BOT',
                                partNumber: 'SYSTEM'
                            };

                            try {
                                const { collection, doc, setDoc } = await import('firebase/firestore');
                                const { db } = await import('../services/firebaseConfig');

                                // 1. Add mock change to DB
                                await setDoc(doc(collection(db, 'daily_changes'), mockChange.id), mockChange);

                                // 2. Trigger real Email delivery via Cloud Function
                                const result = await storageService.triggerManualAuditReport();

                                if (result.success) {
                                    alert(`Evento detonado: Se ha simulado el reporte y el servidor indica: ${result.message}`);
                                } else {
                                    alert(`Error en servidor: ${result.message}`);
                                }
                                storageService.fetchDailyChanges();
                            } catch (e) {
                                console.error(e);
                            }
                        }}
                        className="text-slate-200 hover:text-blue-400 text-[8px] font-mono px-2 py-1"
                    >
                        [ DETONAR LÍNEA DE PRUEBA ]
                    </button>
                </div>
            )}
        </div>
    );
};

export default DailyAudit;
