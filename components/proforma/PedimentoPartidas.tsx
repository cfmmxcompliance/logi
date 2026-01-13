import React from 'react';
import { PedimentoItem } from '../../services/pedimentoParser';

interface PedimentoPartidasProps {
    items: PedimentoItem[];
}

export const PedimentoPartidas: React.FC<PedimentoPartidasProps> = ({ items }) => {
    const fmtMoney = (val?: number) => val != null ? `$${val.toLocaleString('en-US', { minimumFractionDigits: 0 })}` : '';
    const fmtRate = (val?: number) => val != null ? `${val}%` : '';

    // "STRICT PDF 5005521" Styling - Partidas Block
    const Field = ({ label, value, className = '', highlight = false, width = 'auto', labelClass = '' }: any) => (
        <div className={`flex flex-col border-r border-black px-1 py-0.5 ${className} ${highlight ? 'bg-slate-100' : ''}`} style={{ width }}>
            <div className={`text-[7px] font-bold uppercase text-black leading-none mb-0.5 font-sans ${labelClass}`}>{label}</div>
            <div className="text-[10px] font-bold text-black leading-tight font-mono whitespace-nowrap overflow-hidden text-ellipsis h-3.5">
                {value || ''}
            </div>
        </div>
    );

    return (
        <div className="w-full max-w-5xl mx-auto bg-white text-black font-sans border-2 border-black border-t-0 relative bg-white">
            <div className="absolute -top-4 left-0 text-[9px] font-bold uppercase tracking-widest text-slate-500">ANEXO: PAGINA 3 (PARTIDAS)</div>

            {/* HEADERS FOR THE PARTIDAS SECTION (Repeated top of page usually, but here just once for the list) */}
            <div className="bg-black text-white text-[9px] font-bold px-1 text-center border-b border-black uppercase tracking-wide">
                PARTIDAS
            </div>

            {items.map((item, idx) => (
                <div key={idx} className="border-b-2 border-black break-inside-avoid">
                    {/* ROW 1: SEC | FRACC | NICO | VINC | MET | UMC | UMT */}
                    <div className="flex border-b border-black bg-slate-50">
                        <Field label="SEC" value={item.secuencia || idx + 1} className="w-12 text-center" />
                        <Field label="FRACCION" value={item.fraccion} className="w-24 text-center" />
                        <Field label="NICO" value="00" className="w-10 text-center" /> {/* Default NICO if missing text */}
                        <Field label="VINC" value={item.vinculacion} className="w-10 text-center" />
                        <Field label="MET VAL" value={item.metodoValoracion} className="w-14 text-center" />
                        <Field label="UMC" value={item.umc} className="w-14 text-center" />
                        <Field label="CANT UMC" value={item.cantidadUMC} className="w-20 text-center" />
                        <Field label="UMT" value={item.umt} className="w-14 text-center" />
                        <Field label="CANT UMT" value={item.cantidadUMT} className="flex-1 border-r-0 text-center" />
                    </div>

                    {/* ROW 2: DESCRIPTION (Full Width) */}
                    <div className="border-b border-black p-1 min-h-[40px]">
                        <div className="text-[7px] font-bold uppercase text-black leading-none mb-0.5">DESCRIPCION</div>
                        <div className="text-[10px] font-mono font-bold leading-tight whitespace-pre-wrap">
                            {item.description}
                        </div>
                    </div>

                    {/* ROW 3: VALUES & ORIGIN */}
                    <div className="flex border-b border-black">
                        {/* LEFT: Origin/Vendor */}
                        <div className="w-1/3 flex border-r border-black">
                            <Field label="P. VEND" value={item.paisVendedor || 'USA'} className="w-1/2 text-center" />
                            <Field label="P. ORIG" value={item.paisComprador || item.origen} className="w-1/2 border-r-0 text-center" />
                        </div>
                        {/* RIGHT: Values */}
                        <div className="w-2/3 flex">
                            <Field label="PRECIO UNIT." value={fmtMoney(item.precioUnitario)} className="w-1/3 text-right" />
                            <Field label="VAL. COMERCIAL" value={fmtMoney(item.precioPagado)} className="w-1/3 text-right" />
                            <Field label="VAL. ADUANA" value={fmtMoney(item.valorAduana)} className="w-1/3 border-r-0 text-right bg-slate-100" />
                        </div>
                    </div>

                    {/* ROW 4/5: TAXES & IDENTIFIERS GRID */}
                    <div className="grid grid-cols-2">
                        {/* LEFT: IDENTIFIERS (Placeholder for now as I extract generic IDs usually) */}
                        <div className="border-r border-black p-1">
                            <div className="text-[7px] font-bold uppercase mb-1">IDENTIF:</div>
                            <div className="text-[9px] font-mono">
                                {/* TODO: If item-level identifiers extracted, list here. */}
                            </div>
                        </div>

                        {/* RIGHT: TAXES (Contribuciones) */}
                        <div className="flex flex-col">
                            {(item.contribuciones || []).length > 0 ? (
                                item.contribuciones?.map((tax: any, tIdx: number) => (
                                    <div key={tIdx} className="flex border-b border-gray-200 last:border-0 last:border-b-0">
                                        <Field label="CONTR." value={tax.clave} className="w-12 border-b-0" />
                                        <Field label="TASA" value={fmtRate(tax.tasa)} className="w-12 border-b-0" />
                                        <Field label="F.P." value={tax.formaPago || '0'} className="w-10 border-b-0" />
                                        <Field label="IMPORTE" value={fmtMoney(tax.importe)} className="flex-1 border-r-0 border-b-0 text-right" />
                                    </div>
                                ))
                            ) : (
                                // Render critical taxes empty if missing (IGI/IVA/DTA)
                                <div className="flex">
                                    <Field label="IGI" value="TASA: 0%" className="w-1/2 border-b-0" />
                                    <Field label="IVA" value="TASA: 16%" className="w-1/2 border-r-0 border-b-0" />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ))}

            <div className="bg-slate-100 text-[8px] font-bold text-center border-t border-black p-0.5">
                FIN DE PARTIDAS
            </div>
        </div>
    );
};
