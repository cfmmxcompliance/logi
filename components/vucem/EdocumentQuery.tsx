
import React, { useState } from 'react';
import { VucemConfig, Cove } from '../../services/vucem/types';
import { vucemService } from '../../services/vucem/vucemService';

interface Props {
    config: VucemConfig | null;
}

export const EdocumentQuery: React.FC<Props> = ({ config }) => {
    const [edocument, setEdocument] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<Cove | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleSearch = async () => {
        if (!config) {
            setError("Por favor configure la FIEL primero.");
            return;
        }
        if (!edocument) {
            setError("Ingrese un eDocument.");
            return;
        }

        setLoading(true);
        setError(null);
        setResult(null);

        try {
            const resp = await vucemService.consultarEdocument(edocument, config);
            if (resp.contieneError) {
                setError("Error VUCEM: " + (resp.errores?.join(', ') || "Desconocido"));
            } else if (resp.resultadoBusqueda?.cove) {
                setResult(resp.resultadoBusqueda.cove);
            } else {
                setError("No se encontró información para este eDocument.");
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Search Input */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-lg font-semibold mb-4 text-slate-800">Consultar COVE por eDocument</h3>
                <div className="flex gap-4">
                    <input
                        type="text"
                        value={edocument}
                        onChange={e => setEdocument(e.target.value)}
                        placeholder="Ej: 00000123456"
                        className="flex-1 rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                    <button
                        onClick={handleSearch}
                        disabled={loading || !config}
                        className={`px-6 py-2 rounded-md font-medium text-white shadow transition-colors flex items-center gap-2 ${loading ? 'bg-slate-400' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                    >
                        {loading && <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>}
                        {loading ? 'Consultando...' : 'Buscar'}
                    </button>
                </div>
                {error && (
                    <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-lg border border-red-200 flex items-start gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg>
                        {error}
                    </div>
                )}
            </div>

            {/* Results */}
            {result && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="bg-indigo-50 px-6 py-4 border-b border-indigo-100 flex justify-between items-center">
                        <h3 className="font-bold text-indigo-900">Resultados del COVE</h3>
                        <span className="px-3 py-1 bg-white text-indigo-700 rounded-full text-xs font-mono shadow-sm border border-indigo-100">
                            {result.eDocument}
                        </span>
                    </div>

                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                            <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">Información General</h4>
                            <dl className="space-y-2 text-sm">
                                <Row label="Tipo Operación" value={result.tipoOperacion} />
                                <Row label="Fecha Expedición" value={result.fechaExpedicion} />
                                <Row label="Tipo Figura" value={result.tipoFigura} />
                                <Row label="Factura/Relación" value={result.numeroFacturaRelacionFacturas} />
                            </dl>
                        </div>
                        <div>
                            <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">Partes</h4>
                            <div className="space-y-4">
                                <div>
                                    <span className="text-xs font-semibold text-slate-400 block">Emisor</span>
                                    <p className="font-medium text-slate-800">{result.emisor.nombre || result.emisor.razonSocial}</p>
                                    <p className="text-xs text-slate-500">{result.emisor.identificacion}</p>
                                </div>
                                <div>
                                    <span className="text-xs font-semibold text-slate-400 block">Destinatario</span>
                                    <p className="font-medium text-slate-800">{result.destinatario.nombre || result.destinatario.razonSocial}</p>
                                    <p className="text-xs text-slate-500">{result.destinatario.identificacion}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Mercancias Table (Placeholder if needed, assuming facturas > mercancias) */}
                    <div className="border-t border-slate-100 p-6 bg-slate-50">
                        <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">Contenido JSON Completo</h4>
                        <pre className="text-xs bg-slate-100 p-4 rounded-lg overflow-auto max-h-96 border border-slate-200 text-slate-600">
                            {JSON.stringify(result, null, 2)}
                        </pre>
                    </div>
                </div>
            )}
        </div>
    );
};

const Row: React.FC<{ label: string, value: string }> = ({ label, value }) => (
    <div className="flex justify-between border-b border-slate-100 pb-1">
        <dt className="text-slate-500">{label}</dt>
        <dd className="font-medium text-slate-900">{value || '-'}</dd>
    </div>
);
