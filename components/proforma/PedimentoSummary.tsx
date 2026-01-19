import React from 'react';
import { FileText, Calendar, DollarSign, MapPin, Box, Truck, User } from 'lucide-react';

interface PedimentoSummaryProps {
    header: any;
}

export const PedimentoSummary: React.FC<PedimentoSummaryProps> = ({ header }) => {
    if (!header) return null;

    const Field = ({ label, value, icon: Icon }: any) => (
        <div className="bg-white p-3 rounded border border-slate-100 shadow-sm flex items-start gap-3">
            {Icon && <div className="mt-0.5 text-slate-400"><Icon size={14} /></div>}
            <div className="flex-1 min-w-0">
                <div className="text-[10px] text-slate-500 font-bold uppercase mb-0.5">{label}</div>
                <div className="font-mono text-xs font-bold text-slate-800 truncate" title={String(value)}>
                    {value || '-'}
                </div>
            </div>
        </div>
    );

    return (
        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-6">
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                <FileText size={16} /> Resumen de Encabezado
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Field label="Pedimento" value={header.pedimentoNo} />
                <Field label="Tipo Operación" value={header.tipoOperacion} />
                <Field label="Clave Doc." value={header.claveDocumento || header.cvePedimento} />
                <Field label="Régimen" value={header.regimen} />

                <Field label="Aduana" value={header.aduana} icon={MapPin} />
                <Field label="Peso Bruto" value={header.pesoBruto} icon={Box} />
                <Field label="Tipo Cambio" value={header.tipoCambio} icon={DollarSign} />
                <Field label="Transporte" value={header.transporte?.identificacion || 'N/A'} icon={Truck} />
            </div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-blue-50 p-3 rounded border border-blue-100 flex items-center justify-between">
                    <div>
                        <div className="text-[10px] text-blue-600 font-bold uppercase">Fecha Entrada</div>
                        <div className="font-mono text-sm font-bold text-blue-900">
                            {header.fechas?.find((f: any) => f.tipo === 'Entrada')?.fecha || '-'}
                        </div>
                    </div>
                    <Calendar className="text-blue-300" size={18} />
                </div>

                <div className="bg-emerald-50 p-3 rounded border border-emerald-100 flex items-center justify-between">
                    <div>
                        <div className="text-[10px] text-emerald-600 font-bold uppercase">Fecha Pago</div>
                        <div className="font-mono text-sm font-bold text-emerald-900">
                            {header.fechas?.find((f: any) => f.tipo === 'Pago')?.fecha || '-'}
                        </div>
                    </div>
                    <DollarSign className="text-emerald-300" size={18} />
                </div>

                {header.importador && (
                    <div className="bg-white p-3 rounded border border-slate-200">
                        <div className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1 mb-1">
                            <User size={10} /> Importador
                        </div>
                        <div className="text-xs font-bold truncate">{header.importador.nombre || header.nombre}</div>
                        <div className="text-[10px] font-mono text-slate-500">{header.importador.rfc || header.rfc}</div>
                    </div>
                )}
            </div>
        </div>
    );
};