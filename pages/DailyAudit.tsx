import React, { useState, useEffect, useMemo } from 'react';
import { storageService } from '../services/storageService.ts';
import { DailyChange, MasterDataReport, UserRole } from '../types.ts';
import { Activity, RefreshCcw, Download, FileText, User, Calendar, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import * as XLSX from 'xlsx';

export const DailyAudit = () => {
    const { user } = useAuth();
    const [changes, setChanges] = useState<DailyChange[]>([]);
    const [reports, setReports] = useState<MasterDataReport[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // Data is already synced by storageService listeners (limited to 100/150)
        setChanges(storageService.getDailyChanges());
        setReports((storageService as any).getDailyReports());
        setIsLoading(false);

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
        'MATERIAL_CN', 'MATERIAL_EN', 'FUNCTION_CN', 'FUNCTION_EN', 'COMPANY', 'ESTIMATED', 'UPDATE_TIME'
    ];




    const handleDownload = async (type: 'full' | 'changes', dateContext?: string, specificChange?: DailyChange) => {
        const getTodayMX = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
        const date = dateContext || getTodayMX();
        let rawData: any[] = [];
        let filename = '';
        if (type === 'full') {
            if (storageService.getParts().length === 0) {
                await storageService.loadMasterData();
            }
            rawData = storageService.getParts();
            filename = `MasterData_Full_${date}.csv`;
        } else {
            // STRICT DATE-ONLY MODE (User Request)
            // Ensure DB is loaded (Hydration Safety)
            if (storageService.getParts().length === 0) await storageService.loadMasterData();

            // FIXED LOGIC: Priority to Part Numbers from the Change Record
            // This ensures we find the parts even if they were updated AGAIN on a later date.
            if (specificChange && specificChange.partNumbers && specificChange.partNumbers.length > 0) {
                const targetPNs = new Set(specificChange.partNumbers.map(p => String(p).trim().toUpperCase()));
                rawData = storageService.getParts().filter(p => {
                    const pAny = p as any;
                    const pName = (p.PART_NUMBER || pAny.PartNo || '').toString().trim().toUpperCase();
                    return targetPNs.has(pName);
                });
            } else {
                // Fallback: Filter strictly by the modification timestamp (Converted to MX Time)
                // This is only for legacy records or aggregated views without specific PN lists
                rawData = storageService.getParts().filter(p => {
                    if (!p.UPDATE_TIME) return false;
                    try {
                        const pDate = new Date(p.UPDATE_TIME).toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
                        return pDate === date;
                    } catch (e) { return false; }
                });
            }
            filename = `MD_Changes_${date}.csv`;
        }

        if (rawData.length === 0) {
            alert('No se encontraron registros para generar el reporte.\n\nPosible causa:\n1. Los items fueron eliminados del Master Data.\n2. No hay cambios registrados compatibles con la versión actual.');
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
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();

            setTimeout(() => {
                window.URL.revokeObjectURL(url);
                if (document.body.contains(link)) {
                    document.body.removeChild(link);
                }
            }, 3000); // 3s delay for robust cleanup
        } catch (e) {
            console.error('Error generating CSV:', e);
            alert('Error al generar el archivo CSV.');
        }
    };

    const getReportForDate = (timestamp: string) => {
        const dateStr = new Date(timestamp).toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
        return reports.find(r => r.id === dateStr);
    };

    // Aggregate everything by DATE (strictly one row per day)
    const groupedData = useMemo(() => {
        const dailyMap: Record<string, { changes: DailyChange[], report?: MasterDataReport }> = {};

        const getMXDateStr = (isoString: string) => {
            if (!isoString) return '';
            try {
                return new Date(isoString).toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
            } catch (e) { return ''; }
        };

        changes.forEach(c => {
            // Priority 1: ID is already YYYY-MM-DD (from storageService bucket)
            // Priority 2: Convert UTC timestamp to MX Date
            const d = (c.id.includes('-') && c.id.length === 10) ? c.id : getMXDateStr(c.timestamp);
            if (!d) return;
            if (!dailyMap[d]) dailyMap[d] = { changes: [] };
            dailyMap[d].changes.push(c);
        });

        reports.forEach(r => {
            const d = r.id;
            if (!dailyMap[d]) dailyMap[d] = { changes: [] };
            dailyMap[d].report = r;
        });

        return Object.entries(dailyMap)
            .sort((a, b) => b[0].localeCompare(a[0]))
            .map(([dateKey, data]) => {
                const report = data.report;
                const totalCount = data.changes.reduce((acc, curr) => {
                    const parts = Array.isArray(curr.partNumbers) ? curr.partNumbers : ((curr as any).partNumber ? [(curr as any).partNumber] : []);
                    return acc + Math.max(parts.length, curr.count || 1);
                }, 0);

                const uniquePartNumbers = Array.from(new Set(data.changes.flatMap(c => {
                    return Array.isArray(c.partNumbers) ? c.partNumbers : ((c as any).partNumber ? [(c as any).partNumber] : []);
                })));
                const lastUser = data.changes.sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0]?.user || 'System';

                return {
                    dateKey,
                    report,
                    totalCount,
                    uniquePartNumbers,
                    lastUser,
                    isReported: !!report
                };
            });
    }, [changes, reports]);

    return (
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50">
            <header className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <Activity className="text-blue-600" size={28} /> Control de Auditoría (Resumen Diario)
                    </h1>
                    <p className="text-slate-500 text-sm">Registro consolidado de cambios y respaldos del Master Data.</p>
                </div>
            </header>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <p className="text-lg text-slate-700">
                    Hoy se han adicionado o enmendado <span className="font-bold underline decoration-blue-500 decoration-2 underline-offset-4">{
                        changes.filter(c => {
                            const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
                            const cDate = (c.id.includes('-') && c.id.length === 10) ? c.id : new Date(c.timestamp).toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
                            return cDate === today;
                        }).reduce((acc, curr) => acc + (curr.count || 1), 0).toLocaleString()
                    } items</span> en el Master Data.
                </p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-4 font-bold text-slate-700 text-xs">Fecha</th>
                                <th className="px-6 py-4 font-bold text-slate-700 text-xs">Último Usuario</th>
                                <th className="px-6 py-4 font-bold text-slate-700 text-xs text-center">Actividad Diaria</th>
                                <th className="px-6 py-4 font-bold text-slate-700 text-xs text-center">Anexos (CSV)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-10 text-center text-slate-400">
                                        <RefreshCcw className="animate-spin inline mr-2" /> Cargando registros de auditoría...
                                    </td>
                                </tr>
                            ) : groupedData.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                                        No se encontraron registros de cambios o reportes.
                                    </td>
                                </tr>
                            ) : (
                                groupedData.map((data) => {
                                    const { dateKey, report, totalCount, uniquePartNumbers, lastUser, isReported } = data;

                                    // Virtual change object for handleDownload
                                    const daySummary: DailyChange = {
                                        id: dateKey,
                                        timestamp: dateKey + 'T00:00:00Z',
                                        action: 'UPSERT',
                                        user: lastUser,
                                        partNumbers: uniquePartNumbers,
                                        count: totalCount
                                    };

                                    return (
                                        <tr key={dateKey} className={`hover:bg-slate-50 transition-colors ${isReported ? 'opacity-80' : 'bg-blue-50/20'}`}>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex items-center gap-2 text-slate-700 font-bold text-sm">
                                                        <Calendar size={14} className="text-blue-500" />
                                                        {dateKey}
                                                    </div>
                                                    {isReported ? (
                                                        <span className="text-[9px] text-emerald-600 font-bold flex items-center gap-1">
                                                            ✓ Reporte Diario Generado
                                                        </span>
                                                    ) : (
                                                        <span className="text-[9px] text-amber-600 font-bold flex items-center gap-1 italic">
                                                            Transacciones del día (En proceso)
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2 text-slate-700 font-medium">
                                                    <User size={14} className="text-slate-400" />
                                                    {lastUser}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="text-sm text-slate-600">
                                                    {totalCount > 0 ? (
                                                        <span>Actividad: <span className="font-bold text-slate-900">{totalCount.toLocaleString()} registros</span></span>
                                                    ) : (
                                                        <span className="italic text-slate-400">Sin cambios registrados</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="flex items-center justify-center gap-3">
                                                    {/* CAMBIOS DEL DÍA */}
                                                    {/* CAMBIOS DEL DÍA */}
                                                    <button
                                                        onClick={() => handleDownload('changes', dateKey, daySummary)}
                                                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-all text-xs font-bold shadow-sm"
                                                        title="Descargar archivo con solo los cambios de este día"
                                                        disabled={totalCount === 0}
                                                    >
                                                        <Download size={14} /> Cambios (CSV)
                                                    </button>

                                                    {/* BACKUP COMPLETO */}
                                                    {report?.fullCsvUrl ? (
                                                        <a
                                                            href={report.fullCsvUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-all text-xs font-bold shadow-sm"
                                                            title="Descargar respaldo completo del Master Data generado automáticamente"
                                                        >
                                                            <FileText size={14} /> Full (Backup)
                                                        </a>
                                                    ) : (
                                                        <button
                                                            onClick={() => handleDownload('full', dateKey)}
                                                            className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-all text-xs font-bold border border-slate-300 shadow-sm"
                                                            title="Generar respaldo completo basado en el estado actual"
                                                        >
                                                            <FileText size={14} /> Full (Snapshot)
                                                        </button>
                                                    )}
                                                </div>
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
                            try {
                                const { collection, query, where, getDocs, setDoc, doc } = await import('firebase/firestore');
                                const { db } = await import('../services/firebaseConfig');

                                // DIAGNOSTIC: Check 24th Jan
                                const jan24Start = '2026-01-24T00:00:00';
                                const jan24End = '2026-01-24T23:59:59';

                                const q = query(collection(db, 'daily_changes'),
                                    where('timestamp', '>=', jan24Start),
                                    where('timestamp', '<=', jan24End)
                                );
                                const snap = await getDocs(q);
                                const total = snap.size;
                                const unreported = snap.docs.filter(d => !d.data().reported).length;

                                const userResp = prompt(`Diagnóstico 24 Enero:\nTotal: ${total}\nNo Reportados: ${unreported}\n\nSi quieres reenviar forzosamente lo pendiente, escribe "FORCE" para llamar al servidor.`);

                                if (userResp === 'FORCE') {
                                    const targetDate = prompt("Ingrese la fecha (YYYY-MM-DD) para forzar el reporte de ESE DÍA ESPECÍFICO (Ej: 2026-01-26). Deje vacío para 'Ayer':");
                                    const result = await storageService.triggerManualAuditReport(targetDate || undefined);
                                    alert(`Servidor: ${result.message}`);
                                }
                            } catch (e: any) {
                                console.error(e);
                                alert("Error: " + e.message);
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
