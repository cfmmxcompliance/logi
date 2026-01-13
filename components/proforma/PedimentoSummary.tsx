import React from 'react';
import { PedimentoHeader } from '../../services/pedimentoParser';

interface PedimentoSummaryProps {
    header: PedimentoHeader;
}

export const PedimentoSummary: React.FC<PedimentoSummaryProps> = ({ header }) => {
    // Render skeleton/empty form if header is missing
    const safeHeader = header || {
        pedimentoNo: '', fechas: [], valores: {}, importes: {}, transporte: {}, guias: [], contenedores: [], proveedores: [], facturas: []
    } as any;
    const h = safeHeader;

    const fmtMoney = (val?: number) => val != null ? `$${val.toLocaleString('en-US', { minimumFractionDigits: 0 })}` : '';
    const date = (d: string) => d || '';

    // "STRICT PDF 5005521" Styling - High Density, Black Borders, Exact Layout
    const Field = ({ label, value, className = '', highlight = false, width = 'auto' }: any) => (
        <div className={`flex flex-col border-r border-black px-1 py-0.5 ${className} ${highlight ? 'bg-slate-100' : ''}`} style={{ width }}>
            <div className="text-[7px] font-bold uppercase text-black leading-none mb-0.5 font-sans">{label}</div>
            <div className="text-[10px] font-bold text-black leading-tight font-mono whitespace-nowrap overflow-hidden text-ellipsis h-3.5">
                {value || ''}
            </div>
        </div>
    );

    const SectionTitle = ({ title }: { title: string }) => (
        <div className="bg-black text-white text-[9px] font-bold px-1 text-center border-b border-black uppercase tracking-wide">
            {title}
        </div>
    );

    return (
        <div className="w-full max-w-5xl mx-auto bg-white text-black font-sans border-2 border-black selection:bg-yellow-200 shadow-xl">

            {/* --- HEADER STRIP (Row 1) --- */}
            <div className="flex border-b border-black">
                <Field label="NUM. PEDIMENTO" value={h.pedimentoNo} className="w-32 text-xs" />
                <Field label="T. OPER" value={h.tipoOperacion} className="w-12 text-center" />
                <Field label="CVE. PED" value={h.claveDocumento} className="w-12 text-center" />
                <Field label="REGIMEN" value={h.regimen} className="w-12 text-center" />
                <Field label="DESTINO" value={h.destino} className="w-12 text-center" />
                <Field label="TIPO CAMBIO" value={h.tipoCambio} className="w-20 text-right" />
                <Field label="PESO BRUTO" value={h.pesoBruto} className="w-24 text-right" />
                <Field label="BULTOS" value={h.bultos} className="w-12 text-right" />
                <Field label="ADUANA E/S" value={h.aduana} className="flex-1 border-r-0 text-right" />
            </div>

            {/* --- MIDDLE SECTION (Split Layout) --- */}
            <div className="flex border-b border-black">
                {/* LEFT: IMPORTER / EXPORTER (7/12) */}
                <div className="w-7/12 border-r border-black flex flex-col">
                    {/* IMPORTER */}
                    <div className="flex-1 flex flex-col">
                        <SectionTitle title="IMPORTADOR / EXPORTADOR" />
                        <div className="p-1 flex-1">
                            <div className="flex text-[10px]">
                                <span className="font-bold w-16">RFC:</span>
                                <span className="font-mono">{h.rfc || ''}</span>
                            </div>
                            <div className="flex text-[10px]">
                                <span className="font-bold w-16">CURP:</span>
                                <span className="font-mono">{h.curp || ''}</span>
                            </div>
                            <div className="flex text-[10px] mt-1">
                                <span className="font-bold w-16">NOMBRE:</span>
                                <span className="font-mono leading-tight">{h.nombre || h.proveedores?.[0]?.nombre || ''}</span>
                            </div>
                            <div className="flex text-[10px]">
                                <span className="font-bold w-16">DOMICILIO:</span>
                                <span className="font-mono leading-tight">{h.domicilio || h.proveedores?.[0]?.domicilio || ''}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* RIGHT: VALUES */}
                <div className="w-5/12">
                    <SectionTitle title="VALORES" />
                    <div className="grid grid-cols-2 text-right">
                        <Field label="VAL. DOLARES" value={fmtMoney(h.valores?.dolares)} className="border-b border-black" />
                        <Field label="VAL. ADUANA" value={fmtMoney(h.valores?.aduana)} className="border-b border-r-0 border-black bg-slate-100" />
                        <Field label="PRECIO PAGADO" value={fmtMoney(h.valores?.comercial)} className="border-b border-black" />
                        <Field label="VALOR SEGUROS" value={fmtMoney(h.valores?.seguros)} className="border-b border-r-0 border-black" />
                        <Field label="SEGUROS" value={fmtMoney(h.valores?.seguros)} className="border-b border-black" />
                        <Field label="FLETES" value={fmtMoney(h.valores?.fletes)} className="border-b border-r-0 border-black" />
                        <Field label="EMBALAJES" value={fmtMoney(h.valores?.embalajes)} className="border-b border-black" />
                        <Field label="0TROS INCREMENTALES" value={fmtMoney(h.valores?.otros)} className="border-b border-r-0 border-black" />
                    </div>

                    <SectionTitle title="FECHAS" />
                    <div className="flex border-b border-black">
                        <Field label="ENTRADA" value={date(h.fechas?.find((f: any) => f.tipo === 'Entrada')?.fecha)} className="w-1/2" />
                        <Field label="PAGO" value={date(h.fechas?.find((f: any) => f.tipo === 'Pago')?.fecha)} className="w-1/2 border-r-0" />
                    </div>
                </div>
            </div>

            {/* --- LIQUIDACION TABLE (Bottom of P1) --- */}
            <SectionTitle title="CUADRO DE LIQUIDACION" />
            <div className="grid grid-cols-12 text-[9px] font-bold text-center border-b border-black bg-slate-100">
                <div className="col-span-2 border-r border-black">CONCEPTO</div>
                <div className="col-span-2 border-r border-black">F.P.</div>
                <div className="col-span-2 border-r border-black">IMPORTE</div>
                <div className="col-span-2 border-r border-black">CONCEPTO</div>
                <div className="col-span-2 border-r border-black">F.P.</div>
                <div className="col-span-2">IMPORTE</div>
            </div>
            <div className="grid grid-cols-12 text-[10px] font-mono text-center mb-2">
                {/* ROW 1 */}
                <div className="col-span-2 border-r border-black border-b border-slate-200">DTA</div>
                <div className="col-span-2 border-r border-black border-b border-slate-200">0</div>
                <div className="col-span-2 border-r border-black border-b border-slate-200">{fmtMoney(h.importes?.dta)}</div>
                <div className="col-span-2 border-r border-black border-b border-slate-200">IVA</div>
                <div className="col-span-2 border-r border-black border-b border-slate-200">0</div>
                <div className="col-span-2 border-b border-slate-200">{fmtMoney(h.importes?.iva)}</div>
                {/* ROW 2 */}
                <div className="col-span-2 border-r border-black">PREV</div>
                <div className="col-span-2 border-r border-black">0</div>
                <div className="col-span-2 border-r border-black">{fmtMoney(h.importes?.prv)}</div>
                <div className="col-span-2 border-r border-black">IGI</div>
                <div className="col-span-2 border-r border-black">0</div>
                <div className="col-span-2">{fmtMoney(h.importes?.igi)}</div>
            </div>


            {/* --- PAGE 2 REPLICA (Separated margins) --- */}
            <div className="mt-8 relative">
                <div className="absolute -top-4 right-0 text-[9px] font-bold text-gray-400">ANEXO 1 - PAGINA 2</div>

                {/* PAGE 2 HEADER (Repeated) */}
                <div className="flex border-y border-black bg-slate-50">
                    <Field label="NUM. PEDIMENTO" value={h.pedimentoNo} className="w-32" />
                    <Field label="T. OPER" value={h.tipoOperacion} className="w-12 text-center" />
                    <Field label="RFC" value={h.rfc} className="w-32" />
                    <Field label="CURP" value={h.curp} className="w-32 border-r-0" />
                </div>

                {/* TRANSPORTISTA & GUIAS */}
                <div className="grid grid-cols-2 border-b border-black">
                    <div className="border-r border-black">
                        <div className="text-[8px] font-bold px-1 bg-slate-100 border-b border-black">IDENTIFICADORES (TRANSPORTISTA)</div>
                        <div className="p-1 h-20 overflow-hidden">
                            <div className="flex text-[9px] mb-1">
                                <span className="font-bold w-16">RFC:</span>
                                <span className="font-mono">{h.transporte?.transportista?.rfc || ''}</span>
                            </div>
                            <div className="flex text-[9px] mb-1">
                                <span className="font-bold w-16">CURP:</span>
                                <span className="font-mono">{h.transporte?.transportista?.curp || ''}</span>
                            </div>
                            <div className="flex text-[9px]">
                                <span className="font-bold w-16">DOMICILIO:</span>
                                <span className="font-mono leading-tight">{h.transporte?.transportista?.domicilio || h.transporte?.transportista?.nombre || ''}</span>
                            </div>
                        </div>
                    </div>
                    <div>
                        <div className="text-[8px] font-bold px-1 bg-slate-100 border-b border-black">GUIAS / MANIFIESTOS / B/L</div>
                        <div className="p-0">
                            <div className="grid grid-cols-2 border-b border-black text-[8px] font-bold text-center bg-slate-50">
                                <div className="border-r border-black">NUMERO GUIA</div>
                                <div>TIPO</div>
                            </div>
                            <div className="h-20 overflow-y-auto">
                                {(h.guias || []).map((g: any, i: number) => (
                                    <div key={i} className="grid grid-cols-2 border-b border-gray-200 last:border-0 text-[10px] font-mono text-center">
                                        <div className="border-r border-gray-300 truncate px-1">{g.numero}</div>
                                        <div className="truncate px-1">{g.tipo}</div>
                                    </div>
                                ))}
                                {(!h.guias || h.guias.length === 0) && <div className="text-center text-[9px] text-gray-400 mt-2">VACIO</div>}
                            </div>
                        </div>
                    </div>
                </div>

                {/* CONTAINERS & CANDADOS */}
                <div className="grid grid-cols-2 border-b border-black">
                    <div className="border-r border-black">
                        <SectionTitle title="CONTENEDORES" />
                        <div className="grid grid-cols-2 border-b border-black text-[8px] font-bold text-center bg-slate-50">
                            <div className="border-r border-black">NUM. CONTENEDOR</div>
                            <div>TIPO</div>
                        </div>
                        <div className="h-24 overflow-y-auto p-0">
                            {(h.contenedores || []).map((c: any, i: number) => (
                                <div key={i} className="grid grid-cols-2 border-b border-gray-200 last:border-0 text-[10px] font-mono text-center">
                                    <div className="border-r border-gray-300 truncate px-1">{c.numero}</div>
                                    <div className="truncate px-1">{c.tipo}</div>
                                </div>
                            ))}
                            {(!h.contenedores || h.contenedores.length === 0) && <div className="text-center text-[9px] text-gray-400 mt-4">VACIO</div>}
                        </div>
                    </div>

                    <div>
                        <SectionTitle title="CANDADOS OFICIALES" />
                        <div className="p-1 h-24 overflow-y-auto font-mono text-[10px]">
                            {(h.transporte?.candados || []).length > 0 ? h.transporte.candados.join(', ') : 'SIN CANDADOS'}
                        </div>
                    </div>
                </div>

                {/* PAGINA 2 FOOTER */}
                <div className="bg-slate-100 text-[8px] font-bold text-center border-t border-black p-0.5">
                    FIN DE PAGINA 2
                </div>
            </div>

            {/* --- INVOICES (LINKED) --- */}
            <div className="mt-4 border border-black p-1 text-[8px] font-mono text-center bg-yellow-50">
                FACTURAS VINCULADAS: {(h.facturas || []).map((f: any) => `${f.numero}`).join(', ')}
            </div>

            {/* --- PIE DE PAGINA (VALIDACION) --- */}
            <div className="flex border border-black bg-slate-100">
                <Field label="AGENTE ADUANAL" value={h.patente} className="w-24" />
                <Field label="CODIGO DE BARRAS" value="|| |||| | ||||| || ||||" className="w-32 font-barcode text-lg overflow-hidden" />
                <Field label="CLAVE DE PAGO" value={h.acuseValidacion?.banco} className="w-24" />
                <Field label="FECHA Y HORA DE PAGO" value={h.acuseValidacion?.fecha} className="flex-1 border-r-0" />
            </div>

        </div>
    );
};
