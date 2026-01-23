import React, { useState, useEffect } from 'react';
import { storageService } from '../services/storageService.ts';
import { AuditLog } from '../types.ts';
import { Clock, User, Activity, Search, RefreshCcw, Calendar } from 'lucide-react';

export const ActionLogs = () => {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [filter, setFilter] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const loadLogs = () => {
            setIsLoading(true);
            setLogs(storageService.getAuditLogs());
            setIsLoading(false);
        };

        loadLogs();
        const unsub = storageService.subscribe(loadLogs);
        return unsub;
    }, []);

    const filteredLogs = logs.filter(log =>
        log.action.toLowerCase().includes(filter.toLowerCase()) ||
        log.user.toLowerCase().includes(filter.toLowerCase()) ||
        log.details.toLowerCase().includes(filter.toLowerCase())
    );

    return (
        <div className="p-6 space-y-6 bg-slate-50 min-h-screen">
            <header className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <Activity className="text-blue-600" /> Historial de Auditoría (Logs)
                    </h1>
                    <p className="text-slate-500">Monitorea quién ha realizado transacciones y el uso del sistema.</p>
                </div>
                <div className="flex gap-4">
                    <button
                        onClick={async () => {
                            // @ts-ignore
                            await storageService.logAction('TEST_TRACE', 'Manual diagnostic check from UI');
                            alert('Trace sent. If it doesn\'t appear, check console or check if quota is exceeded.');
                        }}
                        className="bg-white border text-slate-600 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-50 transition-all text-sm shadow-sm"
                    >
                        <Activity size={16} /> Test Trace
                    </button>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="Buscar por usuario o acción..."
                            className="pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none w-64 shadow-sm"
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                        />
                    </div>
                </div>
            </header>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th className="px-6 py-4 font-semibold text-slate-700">Fecha y Hora</th>
                            <th className="px-6 py-4 font-semibold text-slate-700">Usuario</th>
                            <th className="px-6 py-4 font-semibold text-slate-700">Acción</th>
                            <th className="px-6 py-4 font-semibold text-slate-700">Detalles de la Transacción</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {isLoading ? (
                            <tr>
                                <td colSpan={4} className="px-6 py-10 text-center text-slate-400">
                                    <RefreshCcw className="animate-spin inline mr-2" /> Cargando registros...
                                </td>
                            </tr>
                        ) : filteredLogs.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="px-6 py-10 text-center text-slate-400">
                                    No se encontraron registros de auditoría.
                                </td>
                            </tr>
                        ) : (
                            filteredLogs.map((log) => (
                                <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2 text-slate-600">
                                            <Calendar size={14} className="text-slate-400" />
                                            {new Date(log.timestamp).toLocaleString()}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2 font-medium text-slate-900 border border-slate-200 px-3 py-1 rounded-full w-fit bg-slate-50">
                                            <User size={14} className="text-blue-500" />
                                            {log.user}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${log.action.includes('REPAIR') ? 'bg-amber-100 text-amber-700' :
                                            log.action.includes('DELETE') ? 'bg-red-100 text-red-700' :
                                                log.action.includes('SYNC') ? 'bg-blue-100 text-blue-700' :
                                                    'bg-slate-100 text-slate-700'
                                            }`}>
                                            {log.action}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 font-mono text-sm text-slate-600">
                                        {log.details}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ActionLogs;
