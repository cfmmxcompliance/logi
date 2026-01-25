import React, { useState } from 'react';
import { VucemConfig, Cove } from '../../services/vucem/types';
import { vucemService } from '../../services/vucem/vucemService';
import { jsPDF } from 'jspdf';
import { generateCovePdf } from '../../utils/vucemPdfGenerator';
import { Download, FileText, Globe, AlertCircle, Search, Info } from 'lucide-react';

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
            setError("Por favor configure la FIEL primero en la pestaña de Configuración.");
            return;
        }
        if (!edocument) {
            setError("Ingrese un número de eDocument válido.");
            return;
        }

        setLoading(true);
        setError(null);
        setResult(null);

        try {
            const resp = await vucemService.consultarEdocument(edocument, config);
            if (resp.contieneError) {
                const msg = (resp.errores?.join(', ') || "").toLowerCase();
                let friendlyMsg = "VUCEM rechazó la consulta: " + (resp.errores?.join(', ') || "Error desconocido.");

                if (msg.includes('auth') || msg.includes('firm') || msg.includes('password') || msg.includes('credent')) {
                    friendlyMsg = "❌ ERROR DE AUTENTICACIÓN: La contraseña de VUCEM o los archivos de la FIEL son incorrectos. Por favor, verifícalos para evitar un bloqueo del RFC.";
                }
                setError(friendlyMsg);
            } else if (resp.resultadoBusqueda?.cove) {
                setResult(resp.resultadoBusqueda.cove);
            } else {
                setError("El eDocument no existe o no tiene información de COVE asociada.");
            }
        } catch (err: any) {
            setError(err.message || "Error de conexión con el servidor de VUCEM.");
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = () => {
        if (result) {
            generateCovePdf(result);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Search Input */}
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex items-center gap-3 mb-6">
                    <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600">
                        <Globe size={20} />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-slate-800">Consultar VUCEM</h3>
                        <p className="text-sm text-slate-500">Recupera expedientes digitales firmados con tu FIEL.</p>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            value={edocument}
                            onChange={e => setEdocument(e.target.value.trim())}
                            placeholder="Ingrese eDocument (13 caracteres)"
                            className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-mono"
                        />
                    </div>
                    <button
                        onClick={handleSearch}
                        disabled={loading || !config}
                        className={`px-8 py-3 rounded-xl font-bold text-white shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2 min-w-[160px] ${loading ? 'bg-slate-400' : 'bg-indigo-600 hover:bg-indigo-700 active:scale-95'}`}
                    >
                        {loading ? (
                            <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
                        ) : (
                            <>Consultar API</>
                        )}
                    </button>
                </div>

                {error && (
                    <div className="mt-6 p-4 bg-red-50 text-red-700 rounded-xl border border-red-100 flex items-start gap-3 animate-in shake duration-300">
                        <AlertCircle size={20} className="mt-0.5 flex-shrink-0" />
                        <div className="text-sm font-medium">{error}</div>
                    </div>
                )}
            </div>

            {/* Results */}
            {result && (
                <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-300">
                    <div className="bg-gradient-to-r from-indigo-600 to-blue-700 px-8 py-6 flex justify-between items-center text-white">
                        <div>
                            <div className="flex items-center gap-2 opacity-80 text-xs font-bold uppercase tracking-widest mb-1">
                                <FileText size={14} /> Expediente Digital Encontrado
                            </div>
                            <h3 className="text-2xl font-black">{result.eDocument}</h3>
                        </div>
                        <button
                            onClick={handleDownload}
                            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 backdrop-blur-md px-5 py-2.5 rounded-xl border border-white/20 transition-all font-bold group"
                        >
                            <Download size={18} className="group-hover:translate-y-0.5 transition-transform" />
                            Descargar PDF
                        </button>
                    </div>

                    <div className="p-8">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                            {/* Left Col: Parties */}
                            <div className="space-y-8">
                                <section>
                                    <div className="flex items-center gap-2 mb-4">
                                        <div className="w-1.5 h-6 bg-indigo-500 rounded-full"></div>
                                        <h4 className="font-black text-slate-800 uppercase text-sm tracking-wider">Entidades Participantes</h4>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                            <span className="text-[10px] font-black text-indigo-600 uppercase mb-2 block tracking-widest">Emisor</span>
                                            <p className="font-bold text-slate-800 leading-tight mb-1">{result.emisor.nombre || "RAZÓN SOCIAL NO DISPONIBLE"}</p>
                                            <p className="text-xs font-mono text-slate-500">{result.emisor.identificacion}</p>
                                        </div>
                                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                            <span className="text-[10px] font-black text-blue-600 uppercase mb-2 block tracking-widest">Destinatario</span>
                                            <p className="font-bold text-slate-800 leading-tight mb-1">{result.destinatario.nombre || "RAZÓN SOCIAL NO DISPONIBLE"}</p>
                                            <p className="text-xs font-mono text-slate-500">{result.destinatario.identificacion}</p>
                                        </div>
                                    </div>
                                </section>

                                <section>
                                    <div className="flex items-center gap-2 mb-4">
                                        <div className="w-1.5 h-6 bg-indigo-500 rounded-full"></div>
                                        <h4 className="font-black text-slate-800 uppercase text-sm tracking-wider">Detalles de Operación</h4>
                                    </div>
                                    <div className="bg-white rounded-xl border border-slate-100 p-4 space-y-3">
                                        <Row label="Tipo de Operación" value={result.tipoOperacion} />
                                        <Row label="Fecha de Expedición" value={result.fechaExpedicion} />
                                        <Row label="Figura que Declara" value={result.tipoFigura} />
                                        <Row label="Factura / Relación" value={result.numeroFacturaRelacionFacturas} />
                                    </div>
                                </section>
                            </div>

                            {/* Right Col: Items / Content */}
                            <div>
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="w-1.5 h-6 bg-indigo-500 rounded-full"></div>
                                    <h4 className="font-black text-slate-800 uppercase text-sm tracking-wider">Partidas y Observaciones</h4>
                                </div>
                                <div className="bg-slate-900 rounded-2xl p-6 shadow-inner text-indigo-300 font-mono text-xs overflow-auto max-h-[400px]">
                                    <div className="flex items-center gap-2 text-indigo-400 mb-4 pb-2 border-b border-indigo-800/50">
                                        <Info size={14} />
                                        <span>ESTRUCTURA XML DETECTADA</span>
                                    </div>
                                    <pre className="leading-relaxed">
                                        {JSON.stringify(result, null, 2)}
                                    </pre>
                                </div>
                                {result.observaciones && (
                                    <div className="mt-4 p-4 bg-amber-50 rounded-xl border border-amber-100">
                                        <span className="text-[10px] font-black text-amber-700 uppercase mb-1 block">Observaciones del COVE</span>
                                        <p className="text-xs text-amber-800 italic">{result.observaciones}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const Row: React.FC<{ label: string, value: string }> = ({ label, value }) => (
    <div className="flex justify-between items-center py-2 border-b border-slate-50 last:border-0">
        <dt className="text-slate-500 text-sm font-medium">{label}</dt>
        <dd className="font-bold text-slate-800 text-sm">{value || '-'}</dd>
    </div>
);
