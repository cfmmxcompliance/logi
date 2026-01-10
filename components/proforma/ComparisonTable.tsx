
import React from 'react';
import { Check, X, AlertTriangle, Edit2 } from 'lucide-react';
import { PedimentoItem } from '../../services/pedimentoParser';
import { CommercialInvoiceItem } from '../../types';

export interface ComparisonRow {
    partNo: string;
    pdfItem?: PedimentoItem;
    dbItem?: CommercialInvoiceItem;
    status: 'MATCH' | 'MISMATCH' | 'MISSING_IN_DB' | 'MISSING_IN_PDF';
    manualMatch?: boolean;
}

interface ComparisonTableProps {
    rows: ComparisonRow[];
    onManualMap: (partNo: string) => void;
}

const getNumberColor = (pdfQty?: number, dbQty?: number) => {
    if (!pdfQty || !dbQty) return 'text-slate-500';
    return pdfQty === dbQty ? 'text-emerald-600 font-bold' : 'text-red-600 font-bold';
};

export const ComparisonTable: React.FC<ComparisonTableProps> = ({ rows, onManualMap }) => {
    return (
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-700 font-bold uppercase text-xs">
                    <tr>
                        <th className="px-4 py-3 border-b text-center w-12">#</th>
                        <th className="px-4 py-3 border-b">Part Number</th>
                        <th className="px-4 py-3 border-b text-center" colSpan={2}>Quantity</th>
                        {/* ... */}
                    </tr>
                    <tr>
                        <th className="px-4 py-2 border-b bg-slate-100"></th>
                        <th className="px-4 py-2 border-b bg-slate-100"></th>
                        <th className="px-2 py-2 border-b text-center text-slate-500 bg-slate-100 w-24">PDF</th>
                        {/* ... */}
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {rows.map((row, idx) => {
                        const qtyMatch = row.pdfItem?.qty === row.dbItem?.qty;
                        const priceMatch = row.pdfItem?.unitPrice === row.dbItem?.unitPrice;

                        // Heuristic: If missing in PDF but present in DB, it's critical. 
                        // If missing in DB, it's "Extra Item".

                        return (
                            <tr key={row.partNo} className="hover:bg-slate-50">
                                <td className="px-4 py-3 font-mono text-xs text-slate-400 text-center">
                                    {row.pdfItem?.secuencia || idx + 1}
                                </td>
                                <td className="px-4 py-3 font-medium text-slate-800">
                                    {row.partNo}
                                </td>

                                {/* Description */}
                                <td className="px-4 py-3 text-xs text-slate-500 max-w-[200px] truncate" title={row.pdfItem?.description}>
                                    {row.pdfItem?.description || '-'}
                                </td>

                                {/* Qty & UMC */}
                                <td className="px-2 py-3 text-center border-r border-slate-100">
                                    <div className="flex flex-col items-center">
                                        <span className={getNumberColor(row.pdfItem?.qty, row.dbItem?.qty)}>{row.pdfItem?.qty || '-'}</span>
                                        <span className="text-[10px] text-slate-400">PDF ({row.pdfItem?.umc || '?'})</span>
                                    </div>
                                </td>
                                <td className="px-2 py-3 text-center">
                                    <div className="flex flex-col items-center">
                                        <span className="text-slate-700">{row.dbItem?.qty || '-'}</span>
                                        <span className="text-[10px] text-slate-400">DB ({row.dbItem?.um || '?'})</span>
                                    </div>
                                </td>

                                {/* Unit Price */}
                                <td className={`px-2 py-3 text-center ${!priceMatch && row.pdfItem ? 'bg-red-50 text-red-600 font-bold' : ''}`}>
                                    {row.pdfItem?.unitPrice ? `$${row.pdfItem.unitPrice.toFixed(2)}` : '-'}
                                </td>
                                <td className="px-2 py-3 text-center">
                                    {row.dbItem?.unitPrice ? `$${row.dbItem.unitPrice.toFixed(2)} ${row.dbItem.currency || 'USD'}` : '-'}
                                </td>

                                {/* Identifiers & Regulations */}
                                <td className="px-4 py-3 text-xs text-slate-500">
                                    <div className="flex flex-col gap-1">
                                        {/* Identifiers */}
                                        {row.pdfItem?.identifiers && row.pdfItem.identifiers.length > 0 && (
                                            <div className="flex flex-wrap gap-1">
                                                {row.pdfItem.identifiers.map(i => (
                                                    <span key={i.code} className="bg-slate-100 px-1 py-0.5 rounded border border-slate-200">
                                                        {i.code}{i.complemento1 ? `:${i.complemento1}` : ''}
                                                    </span>
                                                ))}
                                            </div>
                                        )}

                                        {/* Regulations (Permits) */}
                                        {row.pdfItem?.regulaciones && row.pdfItem.regulaciones.length > 0 && (
                                            <div className="mt-1">
                                                {row.pdfItem.regulaciones.map((r, idx) => (
                                                    <div key={idx} className="text-[10px] text-blue-600 font-mono whitespace-nowrap">
                                                        {r.clave}: {r.permiso}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </td>

                                {/* Taxes (IGI/IVA) */}
                                <td className="px-2 py-3 text-xs text-slate-500 text-center">
                                    {/* Display only IGI and IVA for conciseness */}
                                    {row.pdfItem?.contribuciones?.length ? (
                                        <div className="flex flex-col gap-1">
                                            {row.pdfItem.contribuciones.filter(c => ['IGI', 'IVA'].includes(c.clave)).map(c => (
                                                <span key={c.clave} className="whitespace-nowrap">
                                                    {c.clave}: ${c.importe.toFixed(2)}
                                                </span>
                                            ))}
                                            {/* Check for missing IVA if it should exist? */}
                                        </div>
                                    ) : '-'}
                                </td>

                                {/* Status */}
                                <td className="px-4 py-3">
                                    {row.status === 'MATCH' && <span className="inline-flex items-center gap-1 text-emerald-600 font-medium text-xs bg-emerald-50 px-2 py-1 rounded-full"><Check size={12} /> Match</span>}
                                    {row.status === 'MISMATCH' && <span className="inline-flex items-center gap-1 text-red-600 font-medium text-xs bg-red-50 px-2 py-1 rounded-full"><AlertTriangle size={12} /> Mismatch</span>}
                                    {row.status === 'MISSING_IN_DB' && <span className="inline-flex items-center gap-1 text-amber-600 font-medium text-xs bg-amber-50 px-2 py-1 rounded-full">Not in DB</span>}
                                    {row.status === 'MISSING_IN_PDF' && <span className="inline-flex items-center gap-1 text-slate-500 font-medium text-xs bg-slate-100 px-2 py-1 rounded-full">Not in PDF</span>}
                                </td>

                                {/* Action */}
                                <td className="px-4 py-3">
                                    {(row.status === 'MISSING_IN_DB' || row.status === 'MISMATCH') && (
                                        <button
                                            onClick={() => onManualMap(row.partNo)}
                                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                                            title="Manually Map / Correct"
                                        >
                                            <Edit2 size={16} />
                                        </button>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};
