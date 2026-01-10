import React from 'react';
import { PedimentoHeader } from '../services/pedimentoParser';
import { Calendar, DollarSign, FileText, TrendingUp } from 'lucide-react';

interface PedimentoSummaryProps {
    header: PedimentoHeader;
}

export const PedimentoSummary: React.FC<PedimentoSummaryProps> = ({ header }) => {
    if (!header.pedimentoNo) return null;

    const formatCurrency = (val?: number) => val ? `$${val.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '-';

    return (
        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm mb-6">
            <h3 className="text-sm font-bold text-slate-800 uppercase mb-4 flex items-center gap-2">
                <FileText size={16} className="text-blue-600" />
                Pedimento Stats: {header.pedimentoNo}
                {header.isSimplified && <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded">Simplified</span>}
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
                {/* Dates & Exchange */}
                <div className="space-y-2">
                    <p className="text-slate-500 text-xs font-semibold uppercase">Dates & Exchange</p>
                    <div className="flex items-center gap-2">
                        <Calendar size={14} className="text-slate-400" />
                        <div>
                            <p className="text-xs text-slate-500">Entry: <span className="text-slate-700 font-medium">{header.fechaEntrada || '-'}</span></p>
                            <p className="text-xs text-slate-500">Payment: <span className="text-slate-700 font-medium">{header.fechaPago || '-'}</span></p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <TrendingUp size={14} className="text-slate-400" />
                        <p className="text-slate-700">TC: <span className="font-mono font-bold">{header.tipoCambio?.toFixed(4) || '-'}</span></p>
                    </div>
                </div>

                {/* Values (User specific request) */}
                <div className="space-y-2">
                    <p className="text-slate-500 text-xs font-semibold uppercase">Global Values</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        <span className="text-slate-500 text-xs">USD Value:</span>
                        <span className="text-slate-700 font-mono text-right">{formatCurrency(header.valorDolares)}</span>

                        <span className="text-slate-500 text-xs">Customs Val:</span>
                        <span className="text-slate-700 font-mono text-right">{formatCurrency(header.valorAduana)}</span>

                        <span className="text-slate-500 text-xs">Comm. Value:</span>
                        <span className="text-slate-700 font-mono text-right font-bold">{formatCurrency(header.valorComercial)}</span>
                    </div>
                </div>

                {/* Global Taxes (Liquidation) */}
                <div className="space-y-2">
                    <p className="text-slate-500 text-xs font-semibold uppercase">Liquidation (Taxes)</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        <span className="text-slate-500 text-xs">DTA:</span>
                        <span className="text-slate-700 font-mono text-right">{formatCurrency(header.importes.dta)}</span>

                        <span className="text-slate-500 text-xs">PRV / CNT:</span>
                        <span className="text-slate-700 font-mono text-right">{formatCurrency(header.importes.prv)}</span>

                        <span className="text-slate-500 text-xs">IVA:</span>
                        <span className="text-slate-700 font-mono text-right">{formatCurrency(header.importes.iva)}</span>

                        <span className="text-slate-500 text-xs">IGI:</span>
                        <span className="text-slate-700 font-mono text-right">{formatCurrency(header.importes.igi)}</span>
                    </div>
                </div>

                {/* Total */}
                <div className="flex flex-col justify-end">
                    <div className="bg-slate-50 p-3 rounded border border-slate-100">
                        <p className="text-slate-500 text-xs uppercase mb-1">Total Cash (Efectivo)</p>
                        <p className="text-xl font-bold text-emerald-600 font-mono">
                            {formatCurrency(header.importes.totalEfectivo)}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
