import React, { useState, useEffect, useMemo } from 'react';
import { FileText, RotateCcw, Code, Eye, AlertCircle, Box, Truck } from 'lucide-react';

/* * STRICT PHASE 3 (EXACT MATCH & OFFICIAL LAYOUT)
 * -------------------------------
 * 1. Exact Key Mapping: Matches the specific JSON output from Phase 2.
 * 2. Official Layout: Replicates the Mexican Pedimento Partidas grid.
 * 3. Logic Injection: Extracts PartNo/Invoice/FA from 'observaciones'.
 * 4. NO Regex.
 */

interface Phase3Props {
    data: any;
    onRefresh: () => void;
}

// --- HELPER: TEXT MINING (NO REGEX) ---
const findInText = (text: string, label: string, stopMarkers: string[] = ['\n'], maxLen = 100) => {
    if (!text) return '';
    const idx = text.indexOf(label);
    if (idx === -1) return '';

    const start = idx + label.length;
    let bestEnd = start + maxLen;
    let foundStop = false;

    for (const marker of stopMarkers) {
        const end = text.indexOf(marker, start);
        if (end !== -1 && end < bestEnd) {
            bestEnd = end;
            foundStop = true;
        }
    }

    if (!foundStop && (bestEnd > text.length)) {
        bestEnd = text.length;
    }

    let val = text.substring(start, bestEnd).trim();
    val = val.split('  ')[0];
    return val;
};

export const Phase3: React.FC<Phase3Props> = ({ data, onRefresh }) => {
    const [lastUpdate, setLastUpdate] = useState(Date.now());
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [showRaw, setShowRaw] = useState(false);
    const [showJson, setShowJson] = useState(false);

    // --- 1. DATA NORMALIZATION ---
    const root = useMemo(() => {
        if (!data) return {};
        let processed = data;
        if (typeof data === 'string') {
            try { processed = JSON.parse(data); } catch (e) { return {}; }
        }
        // Unwrap logic
        return processed.header ? processed : (processed.aiJson || processed.page1 || processed.data || processed || {});
    }, [data]);

    // --- 2. FAILSAFE RECOVERY ---
    const fallback = useMemo(() => {
        const txt = root.rawText || (typeof data === 'string' ? '' : data.rawText) || '';
        if (!txt) return {};

        return {
            pedimento: findInText(txt, 'NUM.DE PEDIMENTO:', [' T. OPER']),
            tOper: findInText(txt, 'T. OPER:', [' CVE.']),
            cveDoc: findInText(txt, 'CVE. PEDIMENTO:', [' REGIMEN']),
            regimen: findInText(txt, 'REGIMEN:', [' DESTINO']),
            rfc: findInText(txt, 'Clave en el RFC:', [' NOMBRE']),
            nombre: findInText(txt, 'RAZON SOCIAL:\n', ['\n']),
            peso: findInText(txt, 'PESO BRUTO:', ['\n']),
            tc: findInText(txt, 'TIPO CAMBIO:', ['\n']),
            aduana: findInText(txt, 'ADUANA E/S:', ['\n']),
            entrada: findInText(txt, 'ENTRADA\n', ['\n']),
            pago: findInText(txt, 'PAGO\n', ['\n'])
        };
    }, [root, data]);

    const handleLocalRefresh = () => {
        setIsRefreshing(true);
        setTimeout(() => { setLastUpdate(Date.now()); setIsRefreshing(false); if (onRefresh) onRefresh(); }, 600);
    };

    if (!root || Object.keys(root).length === 0) {
        return <div className="p-4 border border-red-300 text-red-700 bg-red-50 text-xs">NO DATA</div>;
    }

    // --- 3. DATA POINTERS (Exact Keys from your JSON) ---
    const h = root.header || {};
    const imp = root.importador || {};
    const prov = root.proveedor || {};

    // Header Data
    const headerData = {
        pedimento: h.numPedimento || h.pedimentoNo || fallback.pedimento,
        tOper: h.tOper || h.tipoOperacion || fallback.tOper,
        cveDoc: h.cvePedimento || h.claveDocumento || fallback.cveDoc,
        regimen: h.regimen || fallback.regimen,
        tc: h.tipoCambio || fallback.tc,
        peso: h.pesoBruto || fallback.peso,
        aduana: h.aduanaES || h.aduana || fallback.aduana,
        rfc: imp.rfc || fallback.rfc,
        nombre: imp.nombre || fallback.nombre,
        domicilio: imp.domicilio || '',
        fechaEntrada: root.fechas?.entrada || fallback.entrada,
        fechaPago: root.fechas?.pago || fallback.pago
    };

    const v = root.valores || {};
    const toArray = (x: any) => Array.isArray(x) ? x : (x ? [x] : []);

    // Arrays
    const trans = toArray(root.transporte);
    const cont = toArray(root.contenedores);
    const itemsRaw = toArray(root.partidas);

    // --- 4. ITEM ENRICHMENT (Logic Injection) ---
    const items = useMemo(() => {
        return itemsRaw.map((item: any, idx: number) => {
            const cleanObs = (item.observaciones || item.descripcion || '').split('\n').join(' ').split('\r').join(' ');
            const tokens = cleanObs.split(' ').filter((t: string) => t.trim().length > 0);

            let calcPartNo = "";
            let calcInvoice = "";
            let calcFA = "";

            for (let i = 0; i < tokens.length; i++) {
                const token = tokens[i].trim();
                const tokenUpper = token.toUpperCase();

                if (tokenUpper.indexOf('CFTT') !== -1) {
                    if (!calcInvoice) calcInvoice = token;
                    continue;
                }
                if (tokenUpper === 'F.A.' || tokenUpper === 'FA') {
                    if (i + 1 < tokens.length) { calcFA = tokens[i + 1]; i++; }
                    continue;
                }
                if (token.length === 8 && !isNaN(Number(token))) {
                    if (!calcFA) calcFA = token;
                    continue;
                }
                const ignore = ['IN', 'CHN', 'USA', 'MXN', 'USD', 'PZA', 'KGS', 'UN', 'NA'];
                if (!calcPartNo && token.length > 3 && !ignore.includes(tokenUpper) && isNaN(Number(token))) {
                    calcPartNo = token;
                }
            }

            return {
                ...item,
                displayPartNo: item.numeroParte || calcPartNo,
                displayInvoice: item.folioFactura || calcInvoice,
                displayFA: item.FA || calcFA,
            };
        });
    }, [itemsRaw]);

    // --- UI HELPERS ---
    const FieldBox = ({ label, value }: { label: string, value: any }) => (
        <div className="flex flex-col border-r border-slate-300 last:border-r-0 px-2 py-1 min-w-[80px] bg-white h-full justify-center">
            <span className="text-[8px] text-slate-500 uppercase font-bold leading-none mb-0.5">{label}</span>
            <span className="text-[10px] font-mono font-medium text-slate-900 truncate" title={String(value)}>
                {value || '-'}
            </span>
        </div>
    );

    const Section = ({ title, children }: { title: string, children: React.ReactNode }) => (
        <div className="mb-6 border border-slate-400 shadow-sm bg-white">
            <div className="bg-slate-700 text-white px-2 py-1 text-[10px] font-bold font-mono tracking-wider uppercase">
                {title}
            </div>
            <div className="p-0 bg-slate-50">
                {children}
            </div>
        </div>
    );

    const renderRowChips = (p: any) => {
        const parts = [];
        if (p.displayPartNo) parts.push({ l: 'PN', v: p.displayPartNo, c: 'yellow' });
        if (p.displayInvoice) parts.push({ l: 'INV', v: p.displayInvoice, c: 'blue' });
        if (p.displayFA) parts.push({ l: 'FA', v: p.displayFA, c: 'purple' });

        if (parts.length === 0) return null;

        return (
            <div className="flex flex-wrap gap-1 text-[8px] font-mono items-center h-full px-1">
                {parts.map((item, idx) => (
                    <span key={idx} className={`bg-${item.c}-100 text-${item.c}-800 px-1 rounded border border-${item.c}-300 font-bold whitespace-nowrap`}>
                        {item.l}: {item.v}
                    </span>
                ))}
            </div>
        );
    };

    const renderObservaciones = (p: any) => {
        if (!p.observaciones) return null;
        return (
            <div className="whitespace-pre-wrap text-[9px] text-slate-600 break-words">
                {p.observaciones}
            </div>
        );
    };

    return (
        <div key={lastUpdate} className={`font-mono text-xs text-slate-800 ${isRefreshing ? 'opacity-50' : ''}`}>

            {/* TOOLBAR */}
            <div className="mb-4 flex justify-between items-center bg-slate-200 p-2 border border-slate-400 rounded-t-lg">
                <div className="flex items-center gap-4">
                    <span className="font-bold text-slate-700 uppercase flex items-center gap-2">
                        <FileText size={16} /> Phase 3: Final Viewer
                    </span>
                    <div className="flex gap-2">
                        <button onClick={() => setShowRaw(!showRaw)} className="text-[10px] text-blue-600 underline">Raw</button>
                        <button onClick={() => setShowJson(!showJson)} className="text-[10px] text-purple-600 underline">JSON</button>
                    </div>
                </div>
                <button onClick={handleLocalRefresh} className="border border-slate-400 bg-white px-3 py-1 text-[10px] hover:bg-slate-100 flex items-center gap-1">
                    <RotateCcw size={10} /> Refresh
                </button>
            </div>



            {showRaw && <div className="mb-4 p-4 bg-slate-900 text-green-400 text-[10px] overflow-auto max-h-60 border font-mono whitespace-pre-wrap">{typeof root.rawText === 'string' ? root.rawText : (data.rawText || "No Raw Text")}</div>}

            {/* RECONSTRUCTED JSON VIEW: Shows the 'Effective' data used by the UI, not the mismatched input prop */}
            {
                showJson && (
                    <div className="mb-4 p-4 bg-slate-900 text-cyan-400 text-[10px] overflow-auto max-h-60 border font-mono">
                        <div className="flex justify-between border-b border-slate-700 pb-2 mb-2">
                            <span className="font-bold text-white">RECONSTRUCTION ANALYSIS (Active UI Data)</span>
                            <span className="text-slate-500">Source: {root.header ? 'Mapped Legacy' : 'Raw Strict'} &rarr; Normalized</span>
                        </div>
                        <pre>{JSON.stringify({
                            header: {
                                numPedimento: headerData.pedimento,
                                tOper: headerData.tOper,
                                claveDocumento: headerData.cveDoc,
                                regimen: headerData.regimen,
                                tipoCambio: headerData.tc,
                                pesoBruto: headerData.peso,
                                aduana: headerData.aduana,
                                fechas: { entrada: headerData.fechaEntrada, pago: headerData.fechaPago },
                                valores: v
                            },
                            importador: { rfc: headerData.rfc, nombre: headerData.nombre, domicilio: headerData.domicilio },
                            proveedor: prov,
                            partidas: items.map(i => ({
                                secuencia: i.secuencia,
                                fraccion: i.fraccion,
                                cantidadUMC: i.cantidadUMC,
                                precioUnitario: i.precioUnitario,
                                observaciones: i.observaciones,
                                struct: { pn: i.displayPartNo, inv: i.displayInvoice, fa: i.displayFA }
                            }))
                        }, null, 2)}</pre>
                    </div>
                )
            }

            {/* 1. HEADER */}
            <Section title="1. Header">
                <div className="grid grid-cols-7 border-b border-slate-300">
                    <FieldBox label="Pedimento" value={headerData.pedimento} />
                    <FieldBox label="T. Oper" value={headerData.tOper} />
                    <FieldBox label="Cve. Ped" value={headerData.cveDoc} />
                    <FieldBox label="Regimen" value={headerData.regimen} />
                    <FieldBox label="T. Cambio" value={headerData.tc} />
                    <FieldBox label="Peso Bruto" value={headerData.peso} />
                    <FieldBox label="Aduana E/S" value={headerData.aduana} />
                </div>
            </Section>

            {/* 2. ACTORS */}
            <div className="grid grid-cols-2 gap-4">
                <Section title="2. Importador">
                    <div className="flex flex-col">
                        <div className="flex border-b border-slate-300">
                            <div className="w-1/3"><FieldBox label="RFC" value={headerData.rfc} /></div>
                            <div className="w-2/3 border-l border-slate-300"><FieldBox label="Nombre" value={headerData.nombre} /></div>
                        </div>
                        <FieldBox label="Domicilio" value={headerData.domicilio} />
                    </div>
                </Section>
                <Section title="3. Proveedor">
                    <div className="flex flex-col">
                        <div className="flex border-b border-slate-300">
                            <div className="w-1/3"><FieldBox label="ID Fiscal" value={prov.idFiscal} /></div>
                            <div className="w-2/3 border-l border-slate-300"><FieldBox label="Nombre" value={prov.nombre} /></div>
                        </div>
                        <FieldBox label="Domicilio" value={prov.domicilio} />
                    </div>
                </Section>
            </div>

            {/* 4. DATES & VALUES */}
            <Section title="4. Fechas y Valores">
                <div className="flex border-b border-slate-300">
                    {/* Left: Dates */}
                    <div className="flex flex-col w-1/4 border-r border-slate-300">
                        <FieldBox label="Entrada" value={headerData.fechaEntrada} />
                        <div className="border-t border-slate-300"><FieldBox label="Pago" value={headerData.fechaPago} /></div>
                    </div>

                    {/* Middle: Main Values (Vertical Stack) */}
                    <div className="flex flex-col w-1/4 border-r border-slate-300 bg-blue-50/30">
                        <div className="border-b border-slate-300"><FieldBox label="Valor Dolares" value={v.valorDolares} /></div>
                        <div className="border-b border-slate-300"><FieldBox label="Valor Aduana" value={v.valorAduana} /></div>
                        <FieldBox label="Precio Pagado" value={v.precioPagado} />
                    </div>

                    {/* Right: Incrementables (Grid) */}
                    <div className="grid grid-cols-2 w-1/2">
                        <FieldBox label="Fletes" value={v.fletes} />
                        <FieldBox label="Seguros" value={v.seguros} />
                        <div className="border-t border-slate-300"><FieldBox label="Embalajes" value={v.embalajes} /></div>
                        <div className="border-t border-slate-300"><FieldBox label="Otros Increm." value={v.otrosIncrementables} /></div>
                    </div>
                </div>
            </Section>

            {/* 5. & 6. GLOBAL DATA */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <Section title="5. Contribuciones">
                    <div className="flex flex-col bg-white border-b border-slate-200">
                        <div className="flex bg-slate-100 border-b border-slate-300 text-[9px] font-bold">
                            <div className="w-16 p-1 text-center">CLAVE</div>
                            <div className="w-16 p-1 text-center">TASA</div>
                            <div className="w-12 p-1 text-center">T.T.</div>
                            <div className="flex-1 p-1 text-right">IMPORTE</div>
                        </div>
                        {(root.tasasNivelPedimento || []).map((t: any, idx: number) => (
                            <div key={idx} className="flex border-b border-slate-100 last:border-0 text-[10px]">
                                <div className="w-16 p-1 text-center font-bold text-slate-700">{t.contribucion || t.clave}</div>
                                <div className="w-16 p-1 text-center">{t.tasa}</div>
                                <div className="w-12 p-1 text-center">{t.tipoTasa}</div>
                                <div className="flex-1 p-1 text-right font-mono">{t.importe}</div>
                            </div>
                        ))}
                    </div>
                </Section>

                <Section title="6. Cuadro de Liquidación">
                    <div className="flex flex-col h-full justify-between">
                        <div className="grid grid-cols-2 gap-2 p-2">
                            {(root.cuadroLiquidacion?.conceptos || []).map((c: any, idx: number) => (
                                <div key={idx} className="flex justify-between border-b border-dashed border-slate-300 pb-1">
                                    <span className="text-[10px] font-bold text-slate-600">{c.concepto}</span>
                                    <span className="text-[10px] font-mono">{c.importe}</span>
                                </div>
                            ))}
                        </div>
                        <div className="bg-slate-800 text-white p-2 mt-2 flex justify-between items-center">
                            <span className="text-[10px] font-bold uppercase">Total Efectivo</span>
                            <span className="text-sm font-bold font-mono text-emerald-400">${root.cuadroLiquidacion?.efectivo || '0'}</span>
                        </div>
                    </div>
                </Section>
            </div>

            {(root.identificadores || []).length > 0 && (
                <div className="mb-6">
                    <Section title="Identificadores Globales">
                        <div className="flex flex-wrap gap-2 p-2">
                            {root.identificadores.map((id: any, i: number) => (
                                <div key={i} className="border border-blue-200 bg-blue-50 px-2 py-1 rounded flex items-center gap-2">
                                    <span className="font-bold text-blue-900 text-xs">{id.clave}</span>
                                    {id.compl1 && <span className="text-[10px] text-blue-700 border-l border-blue-200 pl-2">{id.compl1}</span>}
                                </div>
                            ))}
                        </div>
                    </Section>
                </div>
            )}

            {/* 7. LOGISTICS */}
            {
                (trans.length > 0 || cont.length > 0) && (
                    <Section title="7. Logística">
                        <div className="flex flex-col md:flex-row">
                            {/* Transports */}
                            <div className="w-full md:w-1/3 border-b md:border-b-0 md:border-r border-slate-300 p-1">
                                <div className="text-[9px] font-bold text-slate-500 mb-1">MEDIOS DE TRANSPORTE</div>
                                {trans.map((t: any, i: number) => (
                                    <div key={i} className="flex justify-between items-center border border-slate-200 bg-slate-50 px-2 py-1 mb-1 last:mb-0">
                                        <span className="font-bold text-blue-800 text-[10px]">{t.identificacion}</span>
                                        <span className="text-[8px] font-bold bg-white border border-slate-300 px-1 rounded">{t.tipo || 'M'}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Containers */}
                            <div className="w-full md:w-2/3 p-1">
                                <div className="text-[9px] font-bold text-slate-500 mb-1">CONTENEDORES ({cont.length})</div>
                                <div className="flex flex-wrap gap-2">
                                    {cont.map((c: any, i: number) => (
                                        <div key={i} className="border border-slate-400 bg-white px-2 py-1 text-[10px] font-mono flex items-center shadow-sm">
                                            <span className="font-bold mr-2">{c.numero}</span>
                                            <span className="text-[8px] text-slate-500">{c.tipo}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </Section>
                )
            }

            {/* 8. PARTIDAS */}
            <div className="mb-6 border border-slate-700">
                <div className="bg-slate-700 text-white px-2 py-1 text-[10px] font-bold font-mono tracking-wider uppercase">
                    8. Partidas ({items.length})
                </div>
                <div className="bg-slate-100 p-2 space-y-4">
                    {items.map((p: any, i: number) => {
                        const val = p.valores || {};
                        return (
                            <div key={i} className="border border-black bg-white text-[9px] font-mono shadow-sm">
                                {/* ROW 1: HEADER INFO */}
                                <div className="flex border-b border-black">
                                    <div className="w-8 border-r border-black p-1 text-center font-bold bg-slate-200 flex items-center justify-center">{p.secuencia}</div>
                                    <div className="w-24 border-r border-black p-1">
                                        <div className="font-bold text-[8px] text-slate-500">FRACCION</div>
                                        <div className="font-bold text-blue-800 text-[11px]">{p.fraccion}</div>
                                    </div>
                                    <div className="w-16 border-r border-black p-1">
                                        <div className="font-bold text-[8px] text-slate-500">NICO</div>
                                        <div>{p.subdivision || p.nico}</div>
                                    </div>
                                    <div className="w-10 border-r border-black p-1 text-center">
                                        <div className="font-bold text-[8px] text-slate-500">VINC</div>
                                        <div>{p.vinculacion}</div>
                                    </div>
                                    <div className="w-12 border-r border-black p-1 text-center">
                                        <div className="font-bold text-[8px] text-slate-500">UMC</div>
                                        <div>{p.umc}</div>
                                    </div>
                                    <div className="w-20 border-r border-black p-1 text-right">
                                        <div className="font-bold text-[8px] text-slate-500">CANT UMC</div>
                                        <div>{p.cantidadUMC}</div>
                                    </div>
                                    <div className="w-12 border-r border-black p-1 text-center">
                                        <div className="font-bold text-[8px] text-slate-500">UMT</div>
                                        <div>{p.umt}</div>
                                    </div>
                                    <div className="w-20 border-r border-black p-1 text-right">
                                        <div className="font-bold text-[8px] text-slate-500">CANT UMT</div>
                                        <div>{p.cantidadUMT}</div>
                                    </div>
                                    <div className="w-12 border-r border-black p-1 text-center">
                                        <div className="font-bold text-[8px] text-slate-500">P.V/C</div>
                                        <div>{p.PVC}</div>
                                    </div>
                                    <div className="w-12 border-r border-black p-1 text-center">
                                        <div className="font-bold text-[8px] text-slate-500">P.O/D</div>
                                        <div>{p.POD}</div>
                                    </div>
                                    <div className="flex-1 border-black p-1 flex items-center bg-slate-50">
                                        {renderRowChips(p)}
                                    </div>
                                </div>

                                <div className="flex">
                                    <div className="flex-1">
                                        <div className="border-b border-black p-1 min-h-[24px] whitespace-pre-wrap">{p.descripcion}</div>
                                        <div className="flex border-b border-black">
                                            <div className="w-1/4 border-r border-black p-1">
                                                <div className="font-bold text-[8px] text-slate-500">VAL.ADU/USD</div>
                                                <div className="text-right">${val.valorAduanaUSD}</div>
                                            </div>
                                            <div className="w-1/4 border-r border-black p-1">
                                                <div className="font-bold text-[8px] text-slate-500">IMP.PRECIO PAG</div>
                                                <div className="text-right">${val.impPrecioPag}</div>
                                            </div>
                                            <div className="w-1/4 border-r border-black p-1">
                                                <div className="font-bold text-[8px] text-slate-500">PRECIO UNIT.</div>
                                                <div className="text-right">${val.precioUnitario}</div>
                                            </div>
                                            <div className="w-1/4 p-1">
                                                <div className="font-bold text-[8px] text-slate-500">VAL AGREG</div>
                                                <div className="text-right">{val.valorAgregado || 0}</div>
                                            </div>
                                        </div>
                                        <div className="p-1 bg-yellow-50/50">
                                            {renderObservaciones(p)}
                                        </div>
                                    </div>

                                    {/* RIGHT COLUMN: TAXES */}
                                    <div className="w-48 border-l border-black flex flex-col bg-slate-50">
                                        <div className="flex bg-slate-200 border-b border-black font-bold text-[8px]">
                                            <div className="w-8 p-0.5 text-center">CON</div>
                                            <div className="w-12 p-0.5 text-center">TASA</div>
                                            <div className="w-8 p-0.5 text-center">FP</div>
                                            <div className="flex-1 p-0.5 text-center">IMPORTE</div>
                                        </div>
                                        {(p.tasas || []).map((t: any, k: number) => (
                                            <div key={k} className="flex border-b border-slate-200 last:border-0 text-[8px]">
                                                <div className="w-8 p-0.5 text-center font-bold">{t.clave}</div>
                                                <div className="w-12 p-0.5 text-right">{t.tasa}</div>
                                                <div className="w-8 p-0.5 text-center">{t.formaPago}</div>
                                                <div className="flex-1 p-0.5 text-right">{t.importe}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* ROW 5: IDENTIFIERS */}
                                {(p.identificadores || []).length > 0 && (
                                    <div className="border-t border-black p-1 flex flex-wrap gap-2 bg-white">
                                        {p.identificadores.map((id: any, k: number) => (
                                            <div key={k} className="border border-slate-400 bg-white px-1 py-0.5 rounded flex items-center gap-1 shadow-sm">
                                                <span className="font-bold text-blue-900">{id.identif}</span>
                                                {id.compl1 && <span className="text-slate-500 text-[8px] ml-1">{id.compl1}</span>}
                                                {id.Valcomdls > 0 && <span className="text-emerald-700 text-[8px] font-bold ml-1">${id.Valcomdls}</span>}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div >
    );
};
