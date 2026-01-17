import React, { useState, useEffect, useMemo } from 'react';
import { FileText, RotateCcw } from 'lucide-react';

/* * STRICT PHASE 3 (NO REGEX EDITION)
 * -------------------------------
 * 1. ZERO REGEX policy enforced. Using native split/join/filter/indexOf.
 * 2. Visual Parser for "Observaciones".
 * 3. Dynamic Identifiers mapping.
 * 4. Isolated from other phases.
 * 5. String-based Failsafe Parser for rawText.
 */

interface Phase3Props {
    data: any;
    onRefresh: () => void;
}

// --- STRICT STRING PARSER (NO REGEX) ---
const parseRawFallback = (rawText: string) => {
    if (!rawText) return {};

    const findValue = (marker: string, terminator: string = '\n', lengthLimit: number = 50) => {
        const idx = rawText.indexOf(marker);
        if (idx === -1) return null;

        let start = idx + marker.length;
        let end = rawText.indexOf(terminator, start);

        // If terminator not found or too far, try strict length or end of string
        if (end === -1 || (end - start) > lengthLimit) {
            end = Math.min(start + lengthLimit, rawText.length);
        }

        let val = rawText.substring(start, end).trim();
        // Cleanup common artifacts without regex
        val = val.split('  ')[0]; // Stop at double space
        return val;
    };

    return {
        pedimento: findValue('NUM.DE PEDIMENTO:', ' T. OPER'),
        tOper: findValue('T. OPER:', ' CVE'),
        cvePed: findValue('CVE. PEDIMENTO:', ' REGIMEN'),
        regimen: findValue('REGIMEN:', '\n'),
        tc: findValue('TIPO CAMBIO:', ' PESO'),
        peso: findValue('PESO BRUTO:', '\n'),
        aduana: findValue('ADUANA E/S:', '\n'),
        // Dates are harder without regex, but we can try fixed markers if standard format
        fechaEntrada: findValue('ENTRADA\n', '\n'),
        fechaPago: findValue('PAGO\n', '\n'),
        rfc: findValue('Clave en el RFC:', ' NOMBRE'),
        nombre: findValue('NOMBRE, DENOMINACION O RAZON SOCIAL:\n', '\n'), // Assumes next line
        domicilio: findValue('DOMICILIO:', '\n', 200) // Allow longer
    };
};

export const Phase3: React.FC<Phase3Props> = ({ data, onRefresh }) => {
    const [lastUpdate, setLastUpdate] = useState(Date.now());
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [showRaw, setShowRaw] = useState(false);

    useEffect(() => {
        if (data) console.log("Phase 3 Isolated Input:", data);
    }, [data]);

    const handleLocalRefresh = () => {
        setIsRefreshing(true);
        setTimeout(() => {
            setLastUpdate(Date.now());
            setIsRefreshing(false);
            if (onRefresh) onRefresh();
        }, 600);
    };

    if (!data) return <div className="p-4 border border-red-300 text-red-700 bg-red-50 font-mono text-xs">NO DATA PAYLOAD</div>;

    // --- 1. STRICT ROOT ISOLATION ---
    const root = useMemo(() => {
        if (data.header) return data;
        if (data.data && data.data.header) return data.data;
        if (data.aiJson) return data.aiJson;
        if (data.page1) return data.page1;
        return data;
    }, [data]);

    // --- 2. FAILSAFE PARSING ---
    const fallback = useMemo(() => {
        const txt = root.rawText || (data && data.rawText) || "";
        return parseRawFallback(txt);
    }, [root, data]);

    // --- 3. DATA POINTERS (Priority: Structured > Fallback) ---
    const h = root.header || {};
    const imp = root.importador || {};
    const prov = root.proveedor || (Array.isArray(root.proveedores) ? root.proveedores[0] : root.proveedores) || {};

    // Header Merge
    const displayHeader = {
        pedimento: h.pedimentoNo || h.numPedimento || fallback.pedimento,
        tOper: h.tipoOperacion || h.tOper || fallback.tOper,
        cveDoc: h.claveDocumento || h.cvePedimento || fallback.cvePed,
        regimen: h.regimen || fallback.regimen,
        tc: h.tipoCambio || fallback.tc,
        peso: h.pesoBruto || fallback.peso,
        aduana: h.aduana || h.aduanaES || fallback.aduana
    };

    // Dates Handling (No Regex)
    const f = root.fechas || {};
    const f_entrada = (Array.isArray(f) ? f.find((d: any) => d.tipo === 'Entrada')?.fecha : f.entrada) || fallback.fechaEntrada;
    const f_pago = (Array.isArray(f) ? f.find((d: any) => d.tipo === 'Pago')?.fecha : f.pago) || fallback.fechaPago;

    const v = root.valores || {};

    const toArray = (x: any) => Array.isArray(x) ? x : (x ? [x] : []);
    const tasas = toArray(root.tasasNivelPedimento || root.tasasGlobales || root.dta);
    const liq = root.cuadroLiquidacion || root.importes || {};
    const ids = toArray(root.identificadores || root.identificadoresGlobales);
    const trans = toArray(root.transporte?.medios ? root.transporte.medios[0] : root.transporte);
    const cont = toArray(root.contenedores);
    const items = toArray(root.partidas || root.items);

    // --- UI HELPERS ---
    const Field = ({ label, value, highlight = false }: { label: string, value: any, highlight?: boolean }) => (
        <div className={`flex flex-col border border-slate-300 p-1 bg-white min-h-[36px] ${highlight ? 'bg-blue-50' : ''}`}>
            <span className="text-[9px] bg-slate-100 text-slate-500 font-mono px-1 border-b border-slate-200 mb-1 block uppercase truncate">
                {label}
            </span>
            <span className="text-xs font-mono px-1 truncate block text-slate-900 font-medium" title={String(value !== undefined ? value : '')}>
                {value === null || value === undefined || value === '' ? <span className="text-slate-300">-</span> : String(value)}
            </span>
        </div>
    );

    const Section = ({ title, children }: { title: string, children: React.ReactNode }) => (
        <div className="mb-6 border border-slate-400 shadow-sm bg-white">
            <div className="bg-slate-800 text-white px-3 py-1.5 text-xs font-bold font-mono tracking-wider uppercase">
                {title}
            </div>
            <div className="p-3 bg-slate-50 grid gap-3">
                {children}
            </div>
        </div>
    );

    // --- VISUAL PARSER (NO REGEX) ---
    const renderObservaciones = (text: string) => {
        if (!text) return <span className="text-slate-300 italic">Sin observaciones</span>;

        // 1. Remove newlines using standard split/join
        const textWithoutLines = text.split('\n').join(' ').split('\r').join(' ');

        // 2. Tokenize by space and filter empty strings
        const tokens = textWithoutLines.split(' ').filter(t => t.trim().length > 0);

        // Structure check: Item | Factura | Info (Heuristic only)
        // If it looks like a short token followed by another short token
        if (tokens.length >= 2) {
            return (
                <div className="flex flex-col gap-1.5">
                    <div className="flex flex-wrap gap-2 text-[10px] font-mono">
                        <div className="flex flex-col">
                            <span className="text-[7px] text-slate-400 uppercase">Token 1</span>
                            <span className="bg-blue-100 text-blue-900 px-1.5 py-0.5 rounded border border-blue-200 font-bold">{tokens[0]}</span>
                        </div>

                        <div className="flex flex-col">
                            <span className="text-[7px] text-slate-400 uppercase">Token 2</span>
                            <span className="bg-purple-100 text-purple-900 px-1.5 py-0.5 rounded border border-purple-200 font-bold">{tokens[1]}</span>
                        </div>

                        {tokens.length > 2 && (
                            <div className="flex flex-col">
                                <span className="text-[7px] text-slate-400 uppercase">Resto</span>
                                <span className="bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded border border-amber-200 font-medium break-all">
                                    {tokens.slice(2).join(' ')}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            );
        }
        return <span className="whitespace-pre-wrap text-[10px]">{text}</span>;
    };

    return (
        <div key={lastUpdate} className={`font-mono text-xs text-slate-800 ${isRefreshing ? 'opacity-50 pointer-events-none' : ''}`}>

            {/* HEADER TOOLBAR */}
            <div className="mb-4 flex justify-between items-center bg-slate-200 p-2 border border-slate-400 rounded-t-lg mt-2">
                <div className="flex items-center gap-4">
                    <span className="font-bold text-slate-700 uppercase flex items-center gap-2">
                        <FileText size={16} /> Phase 3: Independent Viewer (Strict)
                    </span>
                    <button onClick={() => setShowRaw(!showRaw)} className="text-[10px] text-blue-600 underline hover:text-blue-800">
                        {showRaw ? 'Hide JSON Payload' : 'Show JSON Payload'}
                    </button>
                </div>
                <button onClick={handleLocalRefresh} className="border border-slate-400 bg-white px-3 py-1 text-[10px] uppercase hover:bg-slate-100 shadow-sm rounded flex items-center gap-1">
                    <RotateCcw size={10} /> Refresh View
                </button>
            </div>

            {showRaw && (
                <div className="mb-4 p-4 bg-slate-900 text-green-400 text-[10px] overflow-auto max-h-80 border border-slate-700 rounded-lg shadow-inner font-mono">
                    <pre>{JSON.stringify(root, null, 2)}</pre>
                </div>
            )}

            {/* 1. HEADER DATA */}
            <Section title="1. Header">
                <div className="grid grid-cols-4 lg:grid-cols-7 gap-0">
                    <Field label="Pedimento" value={displayHeader.pedimento} highlight />
                    <Field label="T. Oper" value={displayHeader.tOper} />
                    <Field label="Cve. Doc" value={displayHeader.cveDoc} />
                    <Field label="Regimen" value={displayHeader.regimen} />
                    <Field label="T. Cambio" value={displayHeader.tc} />
                    <Field label="Peso Bruto" value={displayHeader.peso} />
                    <Field label="Aduana" value={displayHeader.aduana} />
                </div>
            </Section>

            {/* 2. ACTORS */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Section title="2. Importador">
                    <div className="grid grid-cols-1 gap-1">
                        <div className="grid grid-cols-3 gap-0">
                            <Field label="RFC" value={imp.rfc || fallback.rfc} highlight />
                            <div className="col-span-2"><Field label="Nombre" value={imp.nombre || fallback.nombre} /></div>
                        </div>
                        <Field label="Domicilio" value={imp.domicilio || fallback.domicilio} />
                    </div>
                </Section>
                <Section title="3. Proveedor">
                    <div className="grid grid-cols-1 gap-1">
                        <div className="grid grid-cols-3 gap-0">
                            <Field label="ID Fiscal" value={prov.idFiscal} />
                            <div className="col-span-2"><Field label="Nombre" value={prov.nombre} /></div>
                        </div>
                        <Field label="Domicilio" value={prov.domicilio} />
                    </div>
                </Section>
            </div>

            {/* 4. FINANCIALS */}
            <Section title="4. Valores y Fechas">
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-0">
                    <Field label="F. Entrada" value={f_entrada} />
                    <Field label="F. Pago" value={f_pago} />
                    <Field label="Valor Dolares" value={v.dolares || v.valorDolares} />
                    <Field label="Valor Aduana" value={v.aduana || v.valorAduana} />
                    <Field label="Precio Pagado" value={v.comercial || v.precioPagado} />
                    <Field label="Fletes" value={v.fletes} />
                </div>
            </Section>

            {/* 5. TAXES */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Section title="5. Contribuciones Globales">
                    {tasas.length === 0 ? <div className="p-2 text-slate-400 italic text-[10px]">Sin tasas globales</div> : (
                        <div className="bg-white border border-slate-200">
                            {tasas.map((t: any, i: number) => (
                                <div key={i} className="flex justify-between p-1.5 border-b border-slate-100 last:border-0 hover:bg-slate-50 text-[10px]">
                                    <span className="font-bold w-12">{t.clave}</span>
                                    <span>Tasa: {t.tasa}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </Section>
                <Section title="6. Liquidación">
                    <div className="bg-white border border-slate-200 text-[10px]">
                        <div className="flex justify-between p-1.5 bg-slate-100 font-bold border-b border-slate-200">
                            <span>CONCEPTOS</span><span>EFECTIVO</span>
                        </div>
                        {liq.dta !== undefined && <div className="flex justify-between p-1.5 border-b border-slate-100"><span>DTA</span><span>{liq.dta}</span></div>}
                        {liq.iva !== undefined && <div className="flex justify-between p-1.5 border-b border-slate-100"><span>IVA</span><span>{liq.iva}</span></div>}
                        {liq.prv !== undefined && <div className="flex justify-between p-1.5 border-b border-slate-100"><span>PRV</span><span>{liq.prv}</span></div>}

                        {liq.conceptos && liq.conceptos.map((c: any, k: number) => (
                            <div key={k} className="flex justify-between p-1.5 border-b border-slate-100"><span>{c.concepto}</span><span>{c.importe}</span></div>
                        ))}

                        <div className="flex justify-between p-1.5 bg-slate-100 font-bold border-t border-slate-200 text-emerald-700">
                            <span>TOTAL EFECTIVO</span>
                            <span>{liq.totalEfectivo || liq.total}</span>
                        </div>
                    </div>
                </Section>
            </div>

            {/* 7. ITEMS (PARTIDAS) */}
            <Section title={`7. Partidas (${items.length})`}>
                <div className="overflow-x-auto border rounded-sm">
                    <table className="w-full text-left text-[10px] whitespace-nowrap">
                        <thead className="bg-slate-100 text-slate-500 font-bold uppercase border-b border-slate-200">
                            <tr>
                                <th className="px-2 py-1.5">Sec</th>
                                <th className="px-2 py-1.5">Fracción</th>
                                <th className="px-2 py-1.5">Vinculación</th>
                                <th className="px-2 py-1.5 text-right">Cant UMC</th>
                                <th className="px-2 py-1.5 text-right">UMC</th>
                                <th className="px-2 py-1.5 text-right">Precio Pag.</th>
                                <th className="px-2 py-1.5 text-center">Observaciones (Parser Visual)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                            {items.map((p: any, idx: number) => (
                                <tr key={idx} className="hover:bg-slate-50">
                                    <td className="px-2 py-1.5 font-mono text-slate-400">{p.secuencia || idx + 1}</td>
                                    <td className="px-2 py-1.5 font-mono font-bold text-blue-700">{p.fraccion}</td>
                                    <td className="px-2 py-1.5 font-mono">{p.vinculacion}</td>
                                    <td className="px-2 py-1.5 text-right font-mono">{p.cantidadUMC}</td>
                                    <td className="px-2 py-1.5 text-right font-mono">{p.umc}</td>
                                    <td className="px-2 py-1.5 text-right font-mono font-medium">${Number(p.valComDls || p.precioPagado || 0).toLocaleString()}</td>
                                    <td className="px-2 py-1.5 max-w-xs break-words whitespace-normal border-l border-dashed border-slate-200 pl-4">
                                        {renderObservaciones(p.observaciones || '')}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Section>
        </div>
    );
};
