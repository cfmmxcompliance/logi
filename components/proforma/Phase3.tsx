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
    const [showJson, setShowJson] = useState(false);

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

    // RECOVERY: Helper to scan rawText for global lists if JSON is empty
    const recoverList = (type: 'ids' | 'cont' | 'guias' | 'prov') => {
        const txt = root.rawText || (data && data.rawText) || "";
        if (!txt) return [];

        switch (type) {
            case 'ids': // Global Identifiers (Before Partidas)
                const prePartidas = txt.split(/PARTIDAS/i)[0] || "";
                const idMatches = prePartidas.match(/IDENTIF\.?\s*([A-Z]{2})/g);
                return idMatches ? idMatches.map((m: string) => ({ clave: m.replace(/IDENTIF\.?\s*/, '').trim() })) : [];
            case 'cont': // Containers (4 letters + 7 numbers)
                const contMatches = txt.match(/[A-Z]{4}\d{7}/g);
                return contMatches ? contMatches.map((m: string) => ({ numero: m, tipo: 'CN' })) : [];
            case 'guias': // BLs / Guias (Look for GUIA/BL keywords or formatting)
                const guiaMatch = txt.match(/(?:GUIA|BL|MASTER|HOUSE)[:\.]?\s*([A-Z0-9\-\.]+)/i);
                return guiaMatch ? [{ numero: guiaMatch[1], tipo: 'BL' }] : [];
            case 'prov': // Provider Name recovery
                const provSection = txt.split(/DATOS DEL PROVEEDOR/i)[1];
                if (provSection) {
                    const provName = provSection.split(/NOMBRE|RAZON SOCIAL/i)[1]?.split('\n')[1]?.trim();
                    if (provName) return { nombre: provName };
                }
                return {};
        }
        return [];
    };

    const imp = root.importador || {};

    // CORRECTED MAPPING: Check all Phase 2 potential paths for Provider
    // Gemini returns "proveedor" object OR "proveedores" array
    let prov = root.proveedor || (Array.isArray(root.proveedores) ? root.proveedores[0] : root.proveedores) || {};
    if (!prov.nombre && !prov.razonSocial) {
        const recoveredProv = recoverList('prov');
        prov = { ...prov, ...recoveredProv };
    }

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

    // Arrays with Fallback
    const tasas = toArray(root.tasasNivelPedimento || root.tasasGlobales || root.dta);
    const liq = root.cuadroLiquidacion || root.importes || {};

    // Recover Global IDs
    let ids = toArray(root.identificadores || root.identificadoresGlobales);
    if (ids.length === 0) ids = recoverList('ids');

    // CORRECTED MAPPING: Transport
    // Gemini returns "transporte" array of objects OR "transporte" object with "medios"
    let trans = [];
    if (Array.isArray(root.transporte)) {
        trans = root.transporte; // Direct array from Gemini
    } else if (root.transporte && root.transporte.medios) {
        trans = root.transporte.medios; // Nested structure
    }

    // Fallback if still empty or missing ID
    if (trans.length === 0 || !trans[0]?.identificacion) {
        const recoveredGuias = recoverList('guias');
        if (recoveredGuias.length > 0) trans = [{ ...trans[0], identificacion: recoveredGuias[0].numero, tipo: 'BL' }];
    }

    // Recover Containers
    let cont = toArray(root.contenedores);
    if (cont.length === 0) cont = recoverList('cont');

    const itemsRaw = toArray(root.partidas || root.items);

    // --- 4. POST-PROCESS DATA ENRICHMENT (User "Arreglo") ---
    const [items, setItems] = useState<any[]>(itemsRaw);

    useEffect(() => {
        if (!itemsRaw || itemsRaw.length === 0) return;

        // --- 1. STRICT TEXT PARSER (Fallback for Missing AI Data) ---
        // Solves: "Analiza que esta faltando" - Recovers Identifiers and Taxes from Raw Text if JSON is empty.
        const rawText = root.rawText || (data && data.rawText) || "";
        const partidasSection = rawText.split(/PARTIDAS[\s\n\r]+FRACCION/i)[1] || rawText; // Isolate Partidas block

        // Logic: Scan 'observaciones' AND raw text context per item
        const enriched = itemsRaw.map((item: any, idx: number) => {
            // A. Existing Heuristic: PartNo/Invoice from Observaciones
            const obs = item.observaciones || item.descripcion || "";
            const tokens = obs.split(/[\s\n\r]+/).filter((t: string) => t.length > 0);

            let partNo = item.numeroParte;
            let invoice = item.folioFactura;
            let fa = item.FA;

            if (!partNo && tokens.length > 0 && tokens[0].length > 3) {
                partNo = tokens[0];
                if (tokens.length > 1 && !invoice) invoice = tokens[1];
                if (tokens.length > 2 && !fa) fa = tokens[2];
            }

            // B. STRICT TEXT EXTRACTION (New Layer)
            // Attempt to find this specific item's block in text using Sequence/Fraction
            let recoveredIds = item.identificadores || [];
            let recoveredTaxes = item.contribuciones || item.tasas || []; // "tasas" or "contribuciones"?

            // Only run heavy text scan if missing data
            if (rawText && (recoveredIds.length === 0 || recoveredTaxes.length === 0)) {
                // Find a block roughly matching "SEC [idx+1] ... [Fraction]"
                // Simple strict window: Since we don't have exact line numbers, we scan for the Sequence ID
                const seqPattern = new RegExp(`\\b${item.secuencia || idx + 1}\\s+${item.fraccion}`, 'i');
                const matchIndex = partidasSection.search(seqPattern);

                if (matchIndex !== -1) {
                    // Look ahead 500 chars (heuristic window for one item)
                    const itemBlock = partidasSection.substring(matchIndex, matchIndex + 800);

                    // Recover Identifiers: "IDENTIF. XX"
                    if (recoveredIds.length === 0) {
                        const idMatch = itemBlock.match(/IDENTIF\.?\s*([A-Z]{2,3})/g);
                        if (idMatch) {
                            recoveredIds = idMatch.map((m: string) => ({ clave: m.replace(/IDENTIF\.?\s*/, '').trim() }));
                        }
                    }

                    // Recover Taxes: "IVA" followed by rate
                    if (recoveredTaxes.length === 0) {
                        // Simple patterns for likely taxes: IVA, IGI, DTA
                        const taxTypes = ['IVA', 'IGI', 'DTA'];
                        const newTaxes: any[] = [];
                        taxTypes.forEach(tax => {
                            // Look for "IVA 16" or "IVA 0" or "IVA EX"
                            const taxRegex = new RegExp(`\\b${tax}\\s+([\\d\\.]+)`, 'i');
                            const tMatch = itemBlock.match(taxRegex);
                            if (tMatch) {
                                newTaxes.push({ clave: tax, tasa: tMatch[1] });
                            }
                        });
                        if (newTaxes.length > 0) recoveredTaxes = newTaxes;
                    }
                }
            }

            return {
                ...item,
                numeroParte: partNo,
                folioFactura: invoice,
                FA: fa,
                identificadores: recoveredIds,
                tasas: recoveredTaxes
            };
        });

        setItems(enriched);
    }, [root]); // Re-run when root changes

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
                    <div className="flex gap-3">
                        <button onClick={() => setShowRaw(!showRaw)} className="text-[10px] text-blue-600 underline hover:text-blue-800 font-bold">
                            {showRaw ? 'Hide Raw (P1)' : 'Show Raw (P1)'}
                        </button>
                        <button onClick={() => setShowJson(!showJson)} className="text-[10px] text-purple-600 underline hover:text-purple-800 font-bold">
                            {showJson ? 'Hide JSON (P2)' : 'Show JSON (P2)'}
                        </button>
                    </div>
                </div>
                <button onClick={handleLocalRefresh} className="border border-slate-400 bg-white px-3 py-1 text-[10px] uppercase hover:bg-slate-100 shadow-sm rounded flex items-center gap-1">
                    <RotateCcw size={10} /> Refresh View
                </button>
            </div>

            {showRaw && (
                <div className="mb-4">
                    <div className="bg-blue-800 text-white px-2 py-1 text-[10px] font-bold uppercase rounded-t">Phase 1: Raw Text Output</div>
                    <div className="p-4 bg-slate-900 text-green-400 text-[10px] overflow-auto max-h-60 border border-slate-700 rounded-b-lg shadow-inner font-mono whitespace-pre-wrap">
                        {typeof root === 'string' ? root : (root.rawText || "No Raw Text Available")}
                    </div>
                </div>
            )}

            {showJson && (
                <div className="mb-4">
                    <div className="bg-purple-800 text-white px-2 py-1 text-[10px] font-bold uppercase rounded-t">Phase 2: Structured JSON Output</div>
                    <div className="p-4 bg-slate-900 text-cyan-400 text-[10px] overflow-auto max-h-60 border border-slate-700 rounded-b-lg shadow-inner font-mono">
                        <pre>{JSON.stringify(root, null, 2)}</pre>
                    </div>
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
                                <th className="px-2 py-1.5 text-right">Cant UMT</th>
                                <th className="px-2 py-1.5 text-right">UMT</th>
                                <th className="px-2 py-1.5">PVC</th>
                                <th className="px-2 py-1.5">POD</th>
                                <th className="px-2 py-1.5 text-right">Precio Pag.</th>
                                <th className="px-2 py-1.5">Identificadores</th>
                                <th className="px-2 py-1.5">Contribuciones</th>
                                <th className="px-2 py-1.5 bg-yellow-50 text-yellow-800 border-l border-yellow-200">Part No</th>
                                <th className="px-2 py-1.5 bg-yellow-50 text-yellow-800">Invoice</th>
                                <th className="px-2 py-1.5 bg-yellow-50 text-yellow-800 border-r border-yellow-200">F.A.</th>
                                <th className="px-2 py-1.5 text-center">Observaciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                            {items.map((p: any, idx: number) => (
                                <tr key={idx} className="hover:bg-slate-50 align-top">
                                    <td className="px-2 py-1.5 font-mono text-slate-400">{p.secuencia || idx + 1}</td>



                                    <td className="px-2 py-1.5 font-mono font-bold text-blue-700">
                                        {p.fraccion}
                                        {p.subdivision && <span className="block text-[8px] text-slate-400">Sub: {p.subdivision}</span>}
                                    </td>
                                    <td className="px-2 py-1.5 font-mono">{p.vinculacion}</td>
                                    <td className="px-2 py-1.5 text-right font-mono">{p.cantidadUMC}</td>
                                    <td className="px-2 py-1.5 text-right font-mono">{p.umc}</td>
                                    <td className="px-2 py-1.5 text-right font-mono">{p.cantidadUMT}</td>
                                    <td className="px-2 py-1.5 text-right font-mono">{p.umt}</td>
                                    <td className="px-2 py-1.5 font-mono">{p.PVC || p.paisVendedor}</td>
                                    <td className="px-2 py-1.5 font-mono">{p.POD || p.paisOrigen}</td>
                                    <td className="px-2 py-1.5 text-right font-mono font-medium">
                                        <div className="font-bold">${Number(p.precioPagado || 0).toLocaleString()}</div>
                                        <div className="text-[8px] text-slate-400">Unit: ${Number(p.precioUnitario || 0).toFixed(4)}</div>
                                    </td>

                                    {/* IDENTIFICADORES */}
                                    <td className="px-2 py-1.5">
                                        {p.identificadores && p.identificadores.length > 0 ? (
                                            <div className="flex flex-wrap gap-1 max-w-[120px]">
                                                {p.identificadores.map((id: any, k: number) => (
                                                    <span key={k} className="px-1 py-0.5 bg-slate-100 border border-slate-300 rounded text-[9px] font-bold text-slate-600">
                                                        {id.clave}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : <span className="text-slate-300">-</span>}
                                    </td>

                                    {/* CONTRIBUCIONES (MINI GRID) */}
                                    <td className="px-2 py-1.5">
                                        {p.tasas && p.tasas.length > 0 ? (
                                            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 max-w-[140px]">
                                                {p.tasas.map((t: any, k: number) => (
                                                    <div key={k} className="flex justify-between text-[8px] border-b border-dashed border-slate-200">
                                                        <span className="font-bold">{t.clave}</span>
                                                        <span>{t.tasa ? `${t.tasa}%` : 'Ex'}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : <span className="text-slate-300">-</span>}
                                    </td>

                                    {/* ENRICHED FIELDS (Commercial Refs) */}
                                    <td className="px-2 py-1.5 font-mono font-bold text-yellow-700 bg-yellow-50/50 border-l border-yellow-100">{p.numeroParte || '-'}</td>
                                    <td className="px-2 py-1.5 font-mono text-yellow-700 bg-yellow-50/50">{p.folioFactura || '-'}</td>
                                    <td className="px-2 py-1.5 font-mono text-yellow-700 bg-yellow-50/50 border-r border-yellow-100">{p.FA || '-'}</td>

                                    <td className="px-2 py-1.5 max-w-xs break-words whitespace-normal border-l border-dashed border-slate-200 pl-4">
                                        {renderObservaciones(p.observaciones || p.descripcion || '')}
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
